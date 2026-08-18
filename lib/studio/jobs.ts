/**
 * Generation jobs — one per user turn.
 *
 * The job carries the streamed code as it is written, because that stream is the
 * main thing that makes a two-to-four minute wait tolerable. The worker writes
 * partial code back under a throttle, and the client polls with `?since=` and
 * receives only the tail it has not seen, so a long document does not get
 * re-sent on every 500ms poll.
 */

import { promises as fs } from 'fs';
import path from 'path';
import lockfile from 'proper-lockfile';

import type { StudioEditMode, StudioPlan, StudioReview } from './contracts';

export type StudioJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type StudioJobStage = 'queued' | 'planning' | 'coding' | 'reviewing' | 'done' | 'failed';

export interface StudioGenerationJob {
  id: string;
  storeVersion: number;
  projectId: string;
  status: StudioJobStatus;
  stage: StudioJobStage;
  message: string;
  input: { request: string; parentVersionId: string | null };
  /** Everything the coder has emitted so far in this job's latest coding round. */
  code: string;
  createdAt: string;
  updatedAt: string;
  plan?: StudioPlan;
  review?: StudioReview;
  editMode?: StudioEditMode;
  editBlockFailures?: string[];
  codeAttempts?: number;
  result?: { versionId: string; revision: number; summary: string };
  errorCode?: string;
  error?: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
}

/** Progress that keeps moving while code streams, so the bar is never a lie. */
export function studioJobProgress(input: { stage: StudioJobStage; codeLength: number }): number {
  switch (input.stage) {
    case 'queued':
      return 0;
    case 'planning':
      return 8;
    case 'coding':
      return 30 + Math.min(50, Math.round((input.codeLength / 25_000) * 50));
    case 'reviewing':
      return 88;
    default:
      return 100;
  }
}

export interface StudioJobClientView extends Omit<StudioGenerationJob, 'code'> {
  codeChunk: string;
  codeLength: number;
  progress: number;
  done: boolean;
}

/** Project a job for the poller: incremental code, precomputed progress. */
export function projectStudioJobForClient(
  job: StudioGenerationJob,
  since: number,
): StudioJobClientView {
  const { code, ...rest } = job;
  const offset = Math.max(0, Math.min(since, code.length));
  return {
    ...rest,
    codeChunk: code.slice(offset),
    codeLength: code.length,
    progress: studioJobProgress({ stage: job.stage, codeLength: code.length }),
    done: job.status === 'succeeded' || job.status === 'failed',
  };
}

export class StudioJobConflictError extends Error {
  readonly code = 'STUDIO_JOB_VERSION_CONFLICT';
  constructor(readonly currentVersion: number) {
    super(`STUDIO_JOB_VERSION_CONFLICT: current version is ${currentVersion}`);
    this.name = 'StudioJobConflictError';
  }
}

export interface StudioJobStore {
  create(job: StudioGenerationJob): Promise<void>;
  read(jobId: string): Promise<StudioGenerationJob | null>;
  update(
    jobId: string,
    expectedStoreVersion: number,
    patch: Partial<StudioGenerationJob>,
  ): Promise<StudioGenerationJob>;
  list(): Promise<StudioGenerationJob[]>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function merged(
  current: StudioGenerationJob,
  patch: Partial<StudioGenerationJob>,
): StudioGenerationJob {
  return {
    ...current,
    ...patch,
    storeVersion: current.storeVersion + 1,
    updatedAt: new Date().toISOString(),
  };
}

function byCreatedAt(left: StudioGenerationJob, right: StudioGenerationJob): number {
  return left.createdAt.localeCompare(right.createdAt);
}

export class MemoryStudioJobStore implements StudioJobStore {
  private readonly jobs = new Map<string, StudioGenerationJob>();

  async create(job: StudioGenerationJob): Promise<void> {
    if (this.jobs.has(job.id)) throw new Error(`STUDIO_JOB_EXISTS: ${job.id}`);
    this.jobs.set(job.id, clone(job));
  }

  async read(jobId: string): Promise<StudioGenerationJob | null> {
    const job = this.jobs.get(jobId);
    return job ? clone(job) : null;
  }

  async update(
    jobId: string,
    expectedStoreVersion: number,
    patch: Partial<StudioGenerationJob>,
  ): Promise<StudioGenerationJob> {
    const current = this.jobs.get(jobId);
    if (!current) throw new Error(`STUDIO_JOB_NOT_FOUND: ${jobId}`);
    if (current.storeVersion !== expectedStoreVersion) {
      throw new StudioJobConflictError(current.storeVersion);
    }
    const next = merged(current, clone(patch));
    this.jobs.set(jobId, next);
    return clone(next);
  }

  async list(): Promise<StudioGenerationJob[]> {
    return [...this.jobs.values()].map(clone).sort(byCreatedAt);
  }
}

async function writeJsonFileAtomic(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(temporary, filePath);
}

export class FileStudioJobStore implements StudioJobStore {
  constructor(private readonly directory = path.join(process.cwd(), 'data', 'studio-jobs')) {}

  private file(jobId: string): string {
    if (!/^job_[a-zA-Z0-9_-]+$/.test(jobId)) throw new Error('Invalid studio job id');
    return path.join(this.directory, `${jobId}.json`);
  }

  async create(job: StudioGenerationJob): Promise<void> {
    if (await this.read(job.id)) throw new Error(`STUDIO_JOB_EXISTS: ${job.id}`);
    await writeJsonFileAtomic(this.file(job.id), job);
  }

  async read(jobId: string): Promise<StudioGenerationJob | null> {
    try {
      return JSON.parse(await fs.readFile(this.file(jobId), 'utf8')) as StudioGenerationJob;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async update(
    jobId: string,
    expectedStoreVersion: number,
    patch: Partial<StudioGenerationJob>,
  ): Promise<StudioGenerationJob> {
    await fs.mkdir(this.directory, { recursive: true });
    const staleMs = Number(process.env.STUDIO_JOB_LOCK_STALE_MS ?? 600_000);
    const release = await lockfile.lock(this.file(jobId), {
      realpath: false,
      stale: staleMs,
      update: Math.max(1_000, Math.floor(staleMs / 2)),
      retries: { retries: 5, minTimeout: 20, maxTimeout: 200 },
    });
    try {
      const current = await this.read(jobId);
      if (!current) throw new Error(`STUDIO_JOB_NOT_FOUND: ${jobId}`);
      if (current.storeVersion !== expectedStoreVersion) {
        throw new StudioJobConflictError(current.storeVersion);
      }
      const next = merged(current, patch);
      await writeJsonFileAtomic(this.file(jobId), next);
      return next;
    } finally {
      await release();
    }
  }

  async list(): Promise<StudioGenerationJob[]> {
    let names: string[];
    try {
      names = await fs.readdir(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const jobs = await Promise.all(
      names
        .filter((name) => name.startsWith('job_') && name.endsWith('.json'))
        .map((name) => this.read(name.slice(0, -5))),
    );
    return jobs.filter((job): job is StudioGenerationJob => job !== null).sort(byCreatedAt);
  }
}
