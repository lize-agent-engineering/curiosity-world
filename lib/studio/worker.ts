/**
 * The studio worker loop: claim a queued job, run the pipeline, commit the new
 * version to the project.
 *
 * A job has no mid-pipeline checkpoints — the coder writes one document per
 * round, so there is nothing meaningful to resume from. A job whose lease
 * expires is therefore reset and rerun from the start rather than resumed with a
 * half-written page.
 */

import { NextRequest } from 'next/server';

import type { StudioAgentRole, StudioMessage, StudioVersion } from './contracts';
import {
  projectStudioJobForClient,
  studioJobProgress,
  type StudioGenerationJob,
  type StudioJobStore,
} from './jobs';
import {
  runStudioPipeline,
  StudioPipelineError,
  type StudioPipelineModels,
  type StudioPipelineStage,
} from './pipeline';
import { resolveStudioRoleModel } from './server-model';
import {
  appendStudioMessage,
  appendStudioVersion,
  withStudioProject,
  type StudioStore,
} from './store';

const STAGE_MESSAGE: Record<StudioPipelineStage, string> = {
  planning: '正在规划应用的功能与结构',
  coding: '正在编写代码',
  reviewing: '正在审查功能与运行风险',
};

/** Persist partial code at most this often, or whenever this much new code arrives. */
const CODE_FLUSH_INTERVAL_MS = 500;
const CODE_FLUSH_BYTES = 2_048;

export async function resolveStudioPipelineModels(
  job: StudioGenerationJob,
): Promise<StudioPipelineModels> {
  const request = new NextRequest('http://studio-worker.local/internal');
  const entries = await Promise.all(
    (['studio.planner', 'studio.coder', 'studio.reviewer'] as StudioAgentRole[]).map(
      async (role) => [role, await resolveStudioRoleModel(request, job.input, role)] as const,
    ),
  );
  return Object.fromEntries(entries) as StudioPipelineModels;
}

export interface StudioWorkerInput {
  jobStore: StudioJobStore;
  projectStore: StudioStore;
  workerId: string;
  leaseMs?: number;
  now?: number;
  resolveModels?: (job: StudioGenerationJob) => Promise<StudioPipelineModels>;
  newIds?: () => { versionId: string; messageId: string };
  onJobWritten?: (job: StudioGenerationJob) => void;
}

async function recoverExpiredStudioJobs(store: StudioJobStore, now: number): Promise<void> {
  for (const job of await store.list()) {
    if (job.status !== 'running') continue;
    if (job.leaseExpiresAt && Date.parse(job.leaseExpiresAt) > now) continue;
    await store.update(job.id, job.storeVersion, {
      status: 'queued',
      stage: 'queued',
      code: '',
      message: '上一个 worker 中断，任务将重新开始。',
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
    });
  }
}

export async function runStudioWorkerOnce(input: StudioWorkerInput): Promise<boolean> {
  const now = input.now ?? Date.now();
  const leaseMs = input.leaseMs ?? 900_000;
  await recoverExpiredStudioJobs(input.jobStore, now);
  const queued = (await input.jobStore.list()).find(
    (job) =>
      job.status === 'queued' && (!job.leaseExpiresAt || Date.parse(job.leaseExpiresAt) <= now),
  );
  if (!queued) return false;

  let job = await input.jobStore.update(queued.id, queued.storeVersion, {
    status: 'running',
    stage: 'planning',
    message: STAGE_MESSAGE.planning,
    code: '',
    leaseOwner: input.workerId,
    leaseExpiresAt: new Date(now + leaseMs).toISOString(),
  });

  const write = async (patch: Partial<StudioGenerationJob>) => {
    job = await input.jobStore.update(job.id, job.storeVersion, {
      ...patch,
      ...(patch.status === 'succeeded' || patch.status === 'failed'
        ? { leaseOwner: undefined, leaseExpiresAt: undefined }
        : {
            leaseOwner: input.workerId,
            leaseExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
          }),
    });
    input.onJobWritten?.(job);
    return job;
  };

  let models: StudioPipelineModels;
  try {
    models = await (input.resolveModels ?? resolveStudioPipelineModels)(job);
  } catch (error) {
    await write({
      status: 'failed',
      stage: 'failed',
      message: '没有可用的模型，生成无法开始。',
      errorCode: 'MODEL_UNAVAILABLE',
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }

  const snapshot = await input.projectStore.read(job.projectId);
  if (!snapshot) {
    await write({
      status: 'failed',
      stage: 'failed',
      message: '项目不存在。',
      errorCode: 'PROJECT_NOT_FOUND',
      error: `PROJECT_NOT_FOUND: ${job.projectId}`,
    });
    return true;
  }

  const parentVersionId = job.input.parentVersionId ?? snapshot.project.currentVersionId;
  const parent = parentVersionId
    ? (snapshot.versions.find((version) => version.id === parentVersionId) ?? null)
    : null;

  let code = '';
  let pendingCode = '';
  let lastFlush = Date.now();
  const flush = async (force: boolean) => {
    if (pendingCode === '') return;
    const due =
      force ||
      pendingCode.length >= CODE_FLUSH_BYTES ||
      Date.now() - lastFlush >= CODE_FLUSH_INTERVAL_MS;
    if (!due) return;
    pendingCode = '';
    lastFlush = Date.now();
    await write({ code });
  };

  try {
    const result = await runStudioPipeline(
      {
        request: job.input.request,
        current: parent
          ? {
              html: parent.html,
              plan: parent.plan ?? {
                appName: snapshot.project.title,
                appKind: parent.appKind,
                summary: parent.summary,
                changeNote: parent.summary,
                features: [parent.summary],
                layout: '沿用当前页面的结构。',
                interactions: ['沿用当前页面的交互。'],
                persistence: 'none',
              },
              summary: parent.summary,
              runtimeErrors: parent.runtimeErrors,
            }
          : undefined,
      },
      models,
      {
        onEvent: async (event) => {
          if (event.type === 'stage') {
            if (event.stage === 'coding') {
              code = '';
              pendingCode = '';
            }
            await write({ stage: event.stage, message: STAGE_MESSAGE[event.stage], code });
            return;
          }
          if (event.type === 'plan') {
            await write({ plan: event.plan });
            return;
          }
          if (event.type === 'code-delta') {
            code += event.text;
            pendingCode += event.text;
            await flush(false);
            return;
          }
          if (event.type === 'code-done') {
            await flush(true);
            await write({ editMode: event.editMode });
            return;
          }
          await write({ review: event.review });
        },
      },
    );

    const ids = input.newIds?.() ?? { versionId: '', messageId: '' };
    const createdAt = new Date().toISOString();
    const version: StudioVersion = {
      id: ids.versionId,
      projectId: job.projectId,
      parentVersionId: parent?.id ?? null,
      revision: parent ? parent.revision + 1 : 1,
      html: result.html,
      summary: result.summary,
      appKind: result.plan.appKind,
      editMode: result.editMode,
      jobId: job.id,
      runtimeErrors: [],
      createdAt,
      plan: result.plan,
    };
    const message: StudioMessage = {
      id: ids.messageId,
      projectId: job.projectId,
      role: 'agent',
      text: result.summary,
      versionId: version.id,
      jobId: job.id,
      createdAt,
    };
    const committed = await withStudioProject(input.projectStore, job.projectId, (current) => {
      const next = appendStudioMessage(appendStudioVersion(current, version), message);
      // The project was named from the raw request; once the planner has named
      // the app, that name is better in the project list.
      if (current.versions.length > 0) return next;
      return { ...next, project: { ...next.project, title: result.plan.appName } };
    });
    const stored = committed.versions.find((entry) => entry.id === version.id)!;
    await write({
      status: 'succeeded',
      stage: 'done',
      message: '生成完成',
      code: result.html,
      review: result.review,
      editMode: result.editMode,
      editBlockFailures: result.editBlockFailures,
      codeAttempts: result.codeAttempts,
      result: {
        versionId: stored.id,
        revision: stored.revision,
        summary: stored.summary,
      },
    });
  } catch (error) {
    const pipelineError = error instanceof StudioPipelineError ? error : undefined;
    await write({
      status: 'failed',
      stage: 'failed',
      message: pipelineError?.message ?? '生成失败',
      errorCode: pipelineError?.failureCode ?? 'GENERATION_FAILED',
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return true;
}

export { projectStudioJobForClient, studioJobProgress };
