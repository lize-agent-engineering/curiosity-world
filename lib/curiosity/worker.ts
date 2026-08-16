import { NextRequest } from 'next/server';

import type { CuriosityPipelineModels } from './agent-pipeline';
import {
  runCuriosityGenerationJob,
  type CuriosityGenerationJob,
  type CuriosityJobStore,
} from './jobs';
import { resolveCuriosityRoleModel } from './server-model';

const GENERATION_ROLES = [
  'curiosity.question-modeler',
  'curiosity.knowledge-designer',
  'curiosity.interaction-designer',
  'curiosity.presentation-designer',
  'curiosity.quality-reviewer',
] as const;

export async function claimCuriosityJob(
  store: CuriosityJobStore,
  jobId: string,
  workerId: string,
  leaseMs: number,
  now = Date.now(),
): Promise<CuriosityGenerationJob> {
  const job = await store.read(jobId);
  if (!job) throw new Error(`JOB_NOT_FOUND: ${jobId}`);
  const expiresAt = job.leaseExpiresAt ? Date.parse(job.leaseExpiresAt) : 0;
  if (job.leaseOwner && job.leaseOwner !== workerId && expiresAt > now) {
    throw new Error(`JOB_LEASE_HELD: ${job.leaseOwner}`);
  }
  return store.update(jobId, job.storeVersion, {
    status: 'running',
    leaseOwner: workerId,
    leaseExpiresAt: new Date(now + leaseMs).toISOString(),
  });
}

export async function recoverExpiredCuriosityJobs(
  store: CuriosityJobStore,
  _workerId: string,
  now = Date.now(),
): Promise<void> {
  for (const job of await store.list()) {
    if (job.status !== 'queued' && job.status !== 'running') continue;
    if (!job.identity) {
      await store.update(job.id, job.storeVersion, {
        status: 'failed',
        step: 'failed',
        progress: 100,
        message: '旧版生成任务无法由 V3 worker 恢复。',
        errorCode: 'LEGACY_JOB_INCOMPATIBLE',
        error: '任务缺少 V3 identity，请重新发起生成。',
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
      });
      continue;
    }
    if (job.status !== 'running') continue;
    if (job.leaseExpiresAt && Date.parse(job.leaseExpiresAt) > now) continue;
    await store.update(job.id, job.storeVersion, {
      status: 'queued',
      message: '租约已过期，等待 worker 从最近检查点继续。',
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
    });
  }
}

export async function runCuriosityWorkerOnce(input: {
  store: CuriosityJobStore;
  workerId: string;
  leaseMs?: number;
  now?: number;
}): Promise<boolean> {
  const now = input.now ?? Date.now();
  await recoverExpiredCuriosityJobs(input.store, input.workerId, now);
  const queued = (await input.store.list())
    .filter(
      (job) =>
        job.status === 'queued' && (!job.leaseExpiresAt || Date.parse(job.leaseExpiresAt) <= now),
    )
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
  if (!queued) return false;
  const claimed = await claimCuriosityJob(
    input.store,
    queued.id,
    input.workerId,
    input.leaseMs ?? 600_000,
    now,
  );
  const request = new NextRequest('http://curiosity-worker.local/internal');
  let entries: ReadonlyArray<
    readonly [string, Awaited<ReturnType<typeof resolveCuriosityRoleModel>>]
  >;
  try {
    entries = await Promise.all(
      GENERATION_ROLES.map(
        async (role) =>
          [role, await resolveCuriosityRoleModel(request, claimed.input, role)] as const,
      ),
    );
  } catch (error) {
    const current = await input.store.read(claimed.id);
    if (!current) throw error;
    await input.store.update(current.id, current.storeVersion, {
      status: 'failed',
      step: 'failed',
      progress: 100,
      message: '生成已停止',
      errorCode: 'MODEL_UNAVAILABLE',
      error: error instanceof Error ? error.message : String(error),
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
    });
    return true;
  }
  await runCuriosityGenerationJob(
    claimed.id,
    claimed.input,
    Object.fromEntries(entries) as CuriosityPipelineModels,
    input.store,
    claimed.identity,
    { owner: input.workerId, durationMs: input.leaseMs ?? 600_000 },
  );
  return true;
}
