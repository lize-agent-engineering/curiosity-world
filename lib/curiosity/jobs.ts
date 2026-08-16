import { promises as fs } from 'fs';
import path from 'path';
import lockfile from 'proper-lockfile';

import {
  CuriosityAgentPipelineError,
  runCuriosityAgentPipeline,
  type CuriosityPipelineArtifact,
  type CuriosityPipelineIdentities,
  type CuriosityPipelineModels,
  type CuriosityPipelineStage,
} from './agent-pipeline';
import type { CuriosityAgentRun } from './agent-contracts';
import type { CuriosityExperienceSpecV3 } from './experience-spec-v3';

export type CuriosityGenerationStep =
  | 'queued'
  | 'question'
  | 'knowledge'
  | 'scene'
  | 'presentation'
  | 'quality'
  | 'awaiting_runtime_check'
  | 'failed';

export type CuriosityGenerationJobStatus = 'queued' | 'running' | 'candidate_ready' | 'failed';

export interface CuriosityGenerationInput {
  question: string;
  targetAge: number;
  perspectiveDirective?: string;
  experienceId?: string;
  revision?: number;
  preservedKnowledge?: CuriosityExperienceSpecV3['knowledge'];
}

export interface CuriosityGenerationJob {
  id: string;
  storeVersion: number;
  status: CuriosityGenerationJobStatus;
  step: CuriosityGenerationStep;
  progress: number;
  message: string;
  input: CuriosityGenerationInput;
  identity: CuriosityPipelineIdentities;
  createdAt: string;
  updatedAt: string;
  runId: string;
  completedStages: CuriosityPipelineStage[];
  stageArtifacts?: Partial<Record<CuriosityPipelineStage, string>>;
  stageDurations?: Partial<Record<CuriosityPipelineStage, number>>;
  schemaRepairs?: number;
  qualityRetryCount?: 0 | 1;
  artifacts: CuriosityPipelineArtifact[];
  agentRuns: CuriosityAgentRun[];
  result?: {
    experienceId: string;
    versionId: string;
    revision: number;
    createdAt: string;
    spec: CuriosityExperienceSpecV3;
    specHash: string;
  };
  errorCode?: string;
  error?: string;
  failedRole?: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
}

export class CuriosityJobStoreConflictError extends Error {
  readonly code = 'JOB_STORE_VERSION_CONFLICT';
  constructor(readonly currentVersion: number) {
    super(`JOB_STORE_VERSION_CONFLICT: current version is ${currentVersion}`);
  }
}

export interface CuriosityJobStore {
  create(job: CuriosityGenerationJob): Promise<void>;
  read(jobId: string): Promise<CuriosityGenerationJob | null>;
  update(
    jobId: string,
    expectedStoreVersion: number,
    patch: Partial<CuriosityGenerationJob>,
  ): Promise<CuriosityGenerationJob>;
  list(): Promise<CuriosityGenerationJob[]>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

async function writeJsonFileAtomic(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(temporaryPath, filePath);
}

export class MemoryCuriosityJobStore implements CuriosityJobStore {
  private readonly jobs = new Map<string, CuriosityGenerationJob>();

  async create(job: CuriosityGenerationJob): Promise<void> {
    if (this.jobs.has(job.id)) throw new Error(`Curiosity job already exists: ${job.id}`);
    this.jobs.set(job.id, clone(job));
  }

  async read(jobId: string): Promise<CuriosityGenerationJob | null> {
    const job = this.jobs.get(jobId);
    return job ? clone(job) : null;
  }

  async update(
    jobId: string,
    expectedStoreVersion: number,
    patch: Partial<CuriosityGenerationJob>,
  ): Promise<CuriosityGenerationJob> {
    const current = this.jobs.get(jobId);
    if (!current) throw new Error(`Curiosity job not found: ${jobId}`);
    if (current.storeVersion !== expectedStoreVersion) {
      throw new CuriosityJobStoreConflictError(current.storeVersion);
    }
    const next = {
      ...current,
      ...clone(patch),
      storeVersion: current.storeVersion + 1,
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, next);
    return clone(next);
  }

  async list(): Promise<CuriosityGenerationJob[]> {
    return [...this.jobs.values()].map(clone);
  }
}

export class FileCuriosityJobStore implements CuriosityJobStore {
  constructor(private readonly directory = path.join(process.cwd(), 'data', 'curiosity-jobs')) {}

  private file(jobId: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(jobId)) throw new Error('Invalid Curiosity job id');
    return path.join(this.directory, `${jobId}.json`);
  }

  async create(job: CuriosityGenerationJob): Promise<void> {
    if (await this.read(job.id)) throw new Error(`Curiosity job already exists: ${job.id}`);
    await writeJsonFileAtomic(this.file(job.id), job);
  }

  async read(jobId: string): Promise<CuriosityGenerationJob | null> {
    try {
      const job = JSON.parse(await fs.readFile(this.file(jobId), 'utf8')) as CuriosityGenerationJob;
      return { ...job, storeVersion: job.storeVersion ?? 1 };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async update(
    jobId: string,
    expectedStoreVersion: number,
    patch: Partial<CuriosityGenerationJob>,
  ): Promise<CuriosityGenerationJob> {
    await fs.mkdir(this.directory, { recursive: true });
    const staleMs = Number(process.env.CURIOSITY_JOB_LOCK_STALE_MS ?? 600_000);
    const release = await lockfile.lock(this.file(jobId), {
      realpath: false,
      stale: staleMs,
      update: Math.max(1_000, Math.floor(staleMs / 2)),
      retries: 0,
    });
    try {
      const current = await this.read(jobId);
      if (!current) throw new Error(`Curiosity job not found: ${jobId}`);
      if (current.storeVersion !== expectedStoreVersion) {
        throw new CuriosityJobStoreConflictError(current.storeVersion);
      }
      const next = {
        ...current,
        ...patch,
        storeVersion: current.storeVersion + 1,
        updatedAt: new Date().toISOString(),
      };
      await writeJsonFileAtomic(this.file(jobId), next);
      return next;
    } finally {
      await release();
    }
  }

  async list(): Promise<CuriosityGenerationJob[]> {
    try {
      const names = await fs.readdir(this.directory);
      const jobs = await Promise.all(
        names.filter((name) => name.endsWith('.json')).map((name) => this.read(name.slice(0, -5))),
      );
      return jobs.filter((job): job is CuriosityGenerationJob => job !== null);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }
}

export async function runCuriosityGenerationJob(
  jobId: string,
  input: CuriosityGenerationInput,
  models: CuriosityPipelineModels,
  store: CuriosityJobStore,
  identity: CuriosityPipelineIdentities,
  lease?: { owner: string; durationMs: number },
): Promise<void> {
  const checkpoint = await store.read(jobId);
  if (!checkpoint) throw new Error(`Curiosity job not found: ${jobId}`);
  const completedStages: CuriosityPipelineStage[] = [...checkpoint.completedStages];
  const updateJob = async (patch: Partial<CuriosityGenerationJob>) => {
    const current = await store.read(jobId);
    if (!current) throw new Error(`Curiosity job not found: ${jobId}`);
    return store.update(jobId, current.storeVersion, {
      ...patch,
      ...(lease
        ? {
            leaseOwner: lease.owner,
            leaseExpiresAt: new Date(Date.now() + lease.durationMs).toISOString(),
          }
        : {}),
    });
  };
  try {
    await updateJob({
      status: 'running',
      step: 'question',
      progress: 12,
      message: '正在确认孩子真正想问的是什么',
    });
    const presentation: Record<CuriosityPipelineStage, { progress: number; message: string }> = {
      question: { progress: 20, message: '已确认核心问题与安全范围' },
      knowledge: { progress: 40, message: '已完成知识边界与误解设计' },
      scene: { progress: 60, message: '已完成受控场景与事件设计' },
      presentation: { progress: 80, message: '已完成旁白、反馈与发现卡' },
      quality: { progress: 92, message: '质量检查已完成' },
    };
    const stageArtifacts: Partial<Record<CuriosityPipelineStage, string>> = {
      ...checkpoint.stageArtifacts,
    };
    const stageDurations: Partial<Record<CuriosityPipelineStage, number>> = {
      ...checkpoint.stageDurations,
    };
    const candidate = await runCuriosityAgentPipeline(
      input,
      models,
      identity,
      async (update) => {
        if (!completedStages.includes(update.stage)) completedStages.push(update.stage);
        stageArtifacts[update.stage] = update.artifactId;
        const run = update.agentRuns.at(-1);
        if (run?.status === 'succeeded') {
          stageDurations[update.stage] = Date.parse(run.endedAt) - Date.parse(run.startedAt);
        }
        await updateJob({
          step: update.stage,
          ...presentation[update.stage],
          completedStages: [...completedStages],
          stageArtifacts: { ...stageArtifacts },
          stageDurations: { ...stageDurations },
          artifacts: update.artifacts,
          agentRuns: update.agentRuns,
        });
      },
      { artifacts: checkpoint.artifacts, agentRuns: checkpoint.agentRuns },
    );
    await updateJob({
      status: 'candidate_ready',
      step: 'awaiting_runtime_check',
      progress: 95,
      message: '等待浏览器运行检查',
      completedStages,
      stageDurations,
      schemaRepairs: candidate.schemaRepairs,
      qualityRetryCount: candidate.qualityRetryCount,
      artifacts: candidate.artifacts,
      agentRuns: candidate.agentRuns,
      result: {
        experienceId: identity.experienceId,
        versionId: identity.versionId,
        revision: identity.revision ?? 1,
        createdAt: identity.createdAt,
        spec: candidate.spec,
        specHash: candidate.specHash,
      },
      error: undefined,
      errorCode: undefined,
      failedRole: undefined,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
    });
  } catch (error) {
    const pipelineError = error instanceof CuriosityAgentPipelineError ? error : undefined;
    await updateJob({
      status: 'failed',
      step: 'failed',
      progress: 100,
      message: '生成已停止',
      result: undefined,
      completedStages,
      ...(pipelineError
        ? { artifacts: pipelineError.artifacts, agentRuns: pipelineError.agentRuns }
        : {}),
      errorCode: pipelineError?.failureCode ?? 'GENERATION_FAILED',
      error: error instanceof Error ? error.message : String(error),
      failedRole: pipelineError?.failedRole,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
    });
  }
}
