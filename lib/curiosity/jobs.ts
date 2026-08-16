import { promises as fs } from 'fs';
import path from 'path';

import type { CuriosityExperienceSpecV1 } from './contracts';
import {
  CuriosityAgentPipelineError,
  runCuriosityAgentPipeline,
  type CuriosityPipelineArtifact,
  type CuriosityPipelineIdentities,
  type CuriosityPipelineModels,
  type CuriosityPipelineStage,
} from './agent-pipeline';
import type { CuriosityAgentRun, CuriosityExperienceSpecV2 } from './agent-contracts';
import type { KnowledgeDesignArtifactV1 } from './agent-contracts';

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
  preservedCausalRelations?: KnowledgeDesignArtifactV1['causalRelations'];
}

export interface CuriosityGenerationJob {
  id: string;
  status: CuriosityGenerationJobStatus;
  step: CuriosityGenerationStep;
  progress: number;
  message: string;
  input: CuriosityGenerationInput;
  createdAt: string;
  updatedAt: string;
  runId: string;
  completedStages: CuriosityPipelineStage[];
  stageArtifacts?: Partial<Record<CuriosityPipelineStage, string>>;
  artifacts: CuriosityPipelineArtifact[];
  agentRuns: CuriosityAgentRun[];
  result?: {
    spec: CuriosityExperienceSpecV1;
    experienceSpec: CuriosityExperienceSpecV2;
    specHash: string;
  };
  errorCode?: string;
  error?: string;
  failedRole?: string;
}

export interface CuriosityJobStore {
  create(job: CuriosityGenerationJob): Promise<void>;
  read(jobId: string): Promise<CuriosityGenerationJob | null>;
  update(jobId: string, patch: Partial<CuriosityGenerationJob>): Promise<CuriosityGenerationJob>;
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
    patch: Partial<CuriosityGenerationJob>,
  ): Promise<CuriosityGenerationJob> {
    const current = this.jobs.get(jobId);
    if (!current) throw new Error(`Curiosity job not found: ${jobId}`);
    const next = { ...current, ...clone(patch), updatedAt: new Date().toISOString() };
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
      return JSON.parse(await fs.readFile(this.file(jobId), 'utf8')) as CuriosityGenerationJob;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async update(
    jobId: string,
    patch: Partial<CuriosityGenerationJob>,
  ): Promise<CuriosityGenerationJob> {
    const current = await this.read(jobId);
    if (!current) throw new Error(`Curiosity job not found: ${jobId}`);
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    await writeJsonFileAtomic(this.file(jobId), next);
    return next;
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
): Promise<void> {
  const completedStages: CuriosityPipelineStage[] = [];
  try {
    await store.update(jobId, {
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
    const stageArtifacts: Partial<Record<CuriosityPipelineStage, string>> = {};
    const candidate = await runCuriosityAgentPipeline(input, models, identity, async (update) => {
      if (!completedStages.includes(update.stage)) completedStages.push(update.stage);
      stageArtifacts[update.stage] = update.artifactId;
      await store.update(jobId, {
        step: update.stage,
        ...presentation[update.stage],
        completedStages: [...completedStages],
        stageArtifacts: { ...stageArtifacts },
        artifacts: update.artifacts,
        agentRuns: update.agentRuns,
      });
    });
    await store.update(jobId, {
      status: 'candidate_ready',
      step: 'awaiting_runtime_check',
      progress: 95,
      message: '等待浏览器运行检查',
      completedStages,
      artifacts: candidate.artifacts,
      agentRuns: candidate.agentRuns,
      result: {
        spec: candidate.runtimeSpec,
        experienceSpec: candidate.spec,
        specHash: candidate.compiled.specHash,
      },
      error: undefined,
      errorCode: undefined,
      failedRole: undefined,
    });
  } catch (error) {
    const pipelineError = error instanceof CuriosityAgentPipelineError ? error : undefined;
    await store.update(jobId, {
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
    });
  }
}
