/**
 * Project storage: one JSON snapshot per project under `data/studio/`.
 *
 * The mutation model is read → transform → compare-and-swap, the same shape as
 * the Curiosity job store: every write states the `storeVersion` it was built
 * on, and a stale write is rejected rather than silently clobbering a concurrent
 * one. The transforms themselves are pure functions over a snapshot, which is
 * where the version-tree rules live — appending never rewrites history, and a
 * rollback only moves `currentVersionId`, so continuing from an old version
 * grows a branch instead of erasing the versions after it.
 */

import { promises as fs } from 'fs';
import path from 'path';
import lockfile from 'proper-lockfile';

import {
  parseStudioSnapshot,
  type StudioMode,
  type StudioMessage,
  type StudioProject,
  type StudioRuntimeError,
  type StudioSnapshot,
  type StudioVersion,
} from './contracts';

/** Keep at most this many runtime errors per version; one broken page loops forever. */
const MAX_RUNTIME_ERRORS = 20;

export class StudioStoreConflictError extends Error {
  readonly code = 'STUDIO_STORE_VERSION_CONFLICT';
  constructor(readonly currentVersion: number) {
    super(`STUDIO_STORE_VERSION_CONFLICT: current version is ${currentVersion}`);
    this.name = 'StudioStoreConflictError';
  }
}

export class StudioProjectNotFoundError extends Error {
  readonly code = 'PROJECT_NOT_FOUND';
  constructor(projectId: string) {
    super(`PROJECT_NOT_FOUND: ${projectId}`);
    this.name = 'StudioProjectNotFoundError';
  }
}

export function createStudioSnapshot(input: {
  projectId: string;
  title: string;
  createdAt: string;
  mode?: StudioMode;
  targetAge?: number;
  firstMessage: { id: string; text: string; createdAt: string; jobId?: string };
}): StudioSnapshot {
  return parseStudioSnapshot({
    project: {
      id: input.projectId,
      title: input.title,
      mode: input.mode ?? 'general',
      ...(input.targetAge === undefined ? {} : { targetAge: input.targetAge }),
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      currentVersionId: null,
      storeVersion: 1,
    },
    versions: [],
    messages: [
      {
        id: input.firstMessage.id,
        projectId: input.projectId,
        role: 'user',
        text: input.firstMessage.text,
        ...(input.firstMessage.jobId ? { jobId: input.firstMessage.jobId } : {}),
        createdAt: input.firstMessage.createdAt,
      },
    ],
  });
}

/** Append a version and make it current. Its revision is derived from its parent. */
export function appendStudioVersion(
  snapshot: StudioSnapshot,
  version: StudioVersion,
): StudioSnapshot {
  const parent = version.parentVersionId
    ? snapshot.versions.find((entry) => entry.id === version.parentVersionId)
    : undefined;
  if (version.parentVersionId && !parent) {
    throw new Error(`STUDIO_PARENT_VERSION_NOT_FOUND: ${version.parentVersionId}`);
  }
  const stored: StudioVersion = { ...version, revision: parent ? parent.revision + 1 : 1 };
  return parseStudioSnapshot({
    ...snapshot,
    project: { ...snapshot.project, currentVersionId: stored.id },
    versions: [...snapshot.versions, stored],
  });
}

export function appendStudioMessage(
  snapshot: StudioSnapshot,
  message: StudioMessage,
): StudioSnapshot {
  return parseStudioSnapshot({ ...snapshot, messages: [...snapshot.messages, message] });
}

export function rollbackStudioProject(snapshot: StudioSnapshot, versionId: string): StudioSnapshot {
  if (!snapshot.versions.some((version) => version.id === versionId)) {
    throw new Error(`STUDIO_VERSION_NOT_FOUND: ${versionId}`);
  }
  return parseStudioSnapshot({
    ...snapshot,
    project: { ...snapshot.project, currentVersionId: versionId },
  });
}

export function attachStudioRuntimeErrors(
  snapshot: StudioSnapshot,
  versionId: string,
  errors: StudioRuntimeError[],
): StudioSnapshot {
  return parseStudioSnapshot({
    ...snapshot,
    versions: snapshot.versions.map((version) => {
      if (version.id !== versionId) return version;
      const merged = [...version.runtimeErrors];
      for (const error of errors) {
        const duplicate = merged.some(
          (existing) =>
            existing.errorKind === error.errorKind && existing.message === error.message,
        );
        if (!duplicate) merged.push(error);
      }
      return { ...version, runtimeErrors: merged.slice(0, MAX_RUNTIME_ERRORS) };
    }),
  });
}

/** The chain from the root version down to `versionId`, oldest first. */
export function studioVersionLineage(snapshot: StudioSnapshot, versionId: string): StudioVersion[] {
  const byId = new Map(snapshot.versions.map((version) => [version.id, version]));
  const lineage: StudioVersion[] = [];
  let cursor = byId.get(versionId);
  while (cursor) {
    lineage.unshift(cursor);
    cursor = cursor.parentVersionId ? byId.get(cursor.parentVersionId) : undefined;
  }
  return lineage;
}

export interface StudioStore {
  create(snapshot: StudioSnapshot): Promise<StudioSnapshot>;
  read(projectId: string): Promise<StudioSnapshot | null>;
  list(): Promise<StudioProject[]>;
  write(next: StudioSnapshot, expectedStoreVersion: number): Promise<StudioSnapshot>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function committed(next: StudioSnapshot, currentStoreVersion: number): StudioSnapshot {
  return {
    ...next,
    project: {
      ...next.project,
      storeVersion: currentStoreVersion + 1,
      updatedAt: new Date().toISOString(),
    },
  };
}

export class MemoryStudioStore implements StudioStore {
  private readonly projects = new Map<string, StudioSnapshot>();

  async create(snapshot: StudioSnapshot): Promise<StudioSnapshot> {
    if (this.projects.has(snapshot.project.id)) {
      throw new Error(`STUDIO_PROJECT_EXISTS: ${snapshot.project.id}`);
    }
    const stored = parseStudioSnapshot(snapshot);
    this.projects.set(stored.project.id, clone(stored));
    return clone(stored);
  }

  async read(projectId: string): Promise<StudioSnapshot | null> {
    const snapshot = this.projects.get(projectId);
    return snapshot ? clone(snapshot) : null;
  }

  async list(): Promise<StudioProject[]> {
    return [...this.projects.values()]
      .map((snapshot) => clone(snapshot.project))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async write(next: StudioSnapshot, expectedStoreVersion: number): Promise<StudioSnapshot> {
    const current = this.projects.get(next.project.id);
    if (!current) throw new StudioProjectNotFoundError(next.project.id);
    if (current.project.storeVersion !== expectedStoreVersion) {
      throw new StudioStoreConflictError(current.project.storeVersion);
    }
    const stored = parseStudioSnapshot(committed(next, current.project.storeVersion));
    this.projects.set(stored.project.id, clone(stored));
    return clone(stored);
  }
}

export class FileStudioStore implements StudioStore {
  constructor(private readonly directory = path.join(process.cwd(), 'data', 'studio')) {}

  private file(projectId: string): string {
    if (!/^prj_[a-zA-Z0-9_-]+$/.test(projectId)) throw new Error('Invalid studio project id');
    return path.join(this.directory, `${projectId}.json`);
  }

  private async writeAtomic(snapshot: StudioSnapshot): Promise<void> {
    const file = this.file(snapshot.project.id);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(snapshot, null, 2), 'utf8');
    await fs.rename(temporary, file);
  }

  async create(snapshot: StudioSnapshot): Promise<StudioSnapshot> {
    const stored = parseStudioSnapshot(snapshot);
    if (await this.read(stored.project.id)) {
      throw new Error(`STUDIO_PROJECT_EXISTS: ${stored.project.id}`);
    }
    await this.writeAtomic(stored);
    return stored;
  }

  async read(projectId: string): Promise<StudioSnapshot | null> {
    let raw: string;
    try {
      raw = await fs.readFile(this.file(projectId), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    return parseStudioSnapshot(JSON.parse(raw));
  }

  async list(): Promise<StudioProject[]> {
    let names: string[];
    try {
      names = await fs.readdir(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const snapshots = await Promise.all(
      names
        .filter((name) => name.startsWith('prj_') && name.endsWith('.json'))
        .map((name) => this.read(name.slice(0, -5))),
    );
    return snapshots
      .filter((snapshot): snapshot is StudioSnapshot => snapshot !== null)
      .map((snapshot) => snapshot.project)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async write(next: StudioSnapshot, expectedStoreVersion: number): Promise<StudioSnapshot> {
    const file = this.file(next.project.id);
    await fs.mkdir(this.directory, { recursive: true });
    const staleMs = Number(process.env.STUDIO_STORE_LOCK_STALE_MS ?? 60_000);
    const release = await lockfile.lock(file, {
      realpath: false,
      stale: staleMs,
      update: Math.max(1_000, Math.floor(staleMs / 2)),
      retries: { retries: 5, minTimeout: 20, maxTimeout: 200 },
    });
    try {
      const current = await this.read(next.project.id);
      if (!current) throw new StudioProjectNotFoundError(next.project.id);
      if (current.project.storeVersion !== expectedStoreVersion) {
        throw new StudioStoreConflictError(current.project.storeVersion);
      }
      const stored = parseStudioSnapshot(committed(next, current.project.storeVersion));
      await this.writeAtomic(stored);
      return stored;
    } finally {
      await release();
    }
  }
}

/**
 * Read → transform → write with a bounded retry, so a losing racer re-applies its
 * change on top of the winner instead of dropping it.
 */
export async function withStudioProject(
  store: StudioStore,
  projectId: string,
  mutate: (snapshot: StudioSnapshot) => StudioSnapshot | Promise<StudioSnapshot>,
  attempts = 5,
): Promise<StudioSnapshot> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const snapshot = await store.read(projectId);
    if (!snapshot) throw new StudioProjectNotFoundError(projectId);
    const next = await mutate(snapshot);
    try {
      return await store.write(next, snapshot.project.storeVersion);
    } catch (error) {
      if (!(error instanceof StudioStoreConflictError)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}
