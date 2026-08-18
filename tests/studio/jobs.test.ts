import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  FileStudioJobStore,
  MemoryStudioJobStore,
  projectStudioJobForClient,
  studioJobProgress,
  StudioJobConflictError,
  type StudioGenerationJob,
  type StudioJobStore,
} from '@/lib/studio/jobs';

const at = '2026-08-18T10:00:00.000Z';

const job = (overrides: Partial<StudioGenerationJob> = {}): StudioGenerationJob => ({
  id: 'job_one',
  storeVersion: 1,
  projectId: 'prj_one',
  status: 'queued',
  stage: 'queued',
  message: '任务已创建',
  input: { request: '做个番茄钟', parentVersionId: null },
  code: '',
  createdAt: at,
  updatedAt: at,
  ...overrides,
});

describe('studioJobProgress', () => {
  it('advances through the three stages', () => {
    expect(studioJobProgress({ stage: 'queued', codeLength: 0 })).toBe(0);
    expect(studioJobProgress({ stage: 'planning', codeLength: 0 })).toBeGreaterThan(0);
    expect(studioJobProgress({ stage: 'reviewing', codeLength: 20_000 })).toBeGreaterThan(
      studioJobProgress({ stage: 'coding', codeLength: 20_000 }),
    );
    expect(studioJobProgress({ stage: 'done', codeLength: 0 })).toBe(100);
  });

  it('moves while code streams in so waiting has visible motion', () => {
    const early = studioJobProgress({ stage: 'coding', codeLength: 500 });
    const later = studioJobProgress({ stage: 'coding', codeLength: 18_000 });
    expect(later).toBeGreaterThan(early);
    expect(later).toBeLessThan(studioJobProgress({ stage: 'reviewing', codeLength: 0 }));
  });

  it('never runs past the reviewing stage no matter how long the code is', () => {
    expect(studioJobProgress({ stage: 'coding', codeLength: 5_000_000 })).toBeLessThan(85);
  });
});

describe('projectStudioJobForClient', () => {
  const streaming = job({ status: 'running', stage: 'coding', code: '0123456789' });

  it('sends only the code the client has not seen yet', () => {
    const view = projectStudioJobForClient(streaming, 4);
    expect(view.codeChunk).toBe('456789');
    expect(view.codeLength).toBe(10);
    expect('code' in view).toBe(false);
  });

  it('sends everything when the client is starting from scratch', () => {
    expect(projectStudioJobForClient(streaming, 0).codeChunk).toBe('0123456789');
  });

  it('sends nothing when the client is already current', () => {
    expect(projectStudioJobForClient(streaming, 10).codeChunk).toBe('');
  });

  it('tolerates an offset past the end after a retry', () => {
    expect(projectStudioJobForClient(streaming, 99).codeChunk).toBe('');
  });

  it('marks terminal states as done for the poller', () => {
    expect(projectStudioJobForClient(job({ status: 'succeeded' }), 0).done).toBe(true);
    expect(projectStudioJobForClient(job({ status: 'failed' }), 0).done).toBe(true);
    expect(projectStudioJobForClient(streaming, 0).done).toBe(false);
  });

  it('carries the progress number so the client does not recompute it', () => {
    expect(projectStudioJobForClient(job({ stage: 'done', status: 'succeeded' }), 0).progress).toBe(
      100,
    );
  });
});

function jobStoreContract(name: string, makeStore: () => StudioJobStore) {
  describe(name, () => {
    let store: StudioJobStore;
    beforeEach(() => {
      store = makeStore();
    });

    it('round-trips a job', async () => {
      await store.create(job());
      expect((await store.read('job_one'))!.input.request).toBe('做个番茄钟');
    });

    it('returns null for an unknown job', async () => {
      expect(await store.read('job_missing')).toBeNull();
    });

    it('bumps the store version on update', async () => {
      await store.create(job());
      const updated = await store.update('job_one', 1, { status: 'running' });
      expect(updated.storeVersion).toBe(2);
      expect(updated.status).toBe('running');
    });

    it('rejects an update built on a stale version', async () => {
      await store.create(job());
      await store.update('job_one', 1, { status: 'running' });
      await expect(store.update('job_one', 1, { status: 'failed' })).rejects.toBeInstanceOf(
        StudioJobConflictError,
      );
    });

    it('lists queued jobs oldest first', async () => {
      await store.create(job({ id: 'job_b', createdAt: '2026-08-18T11:00:00.000Z' }));
      await store.create(job({ id: 'job_a' }));
      expect((await store.list()).map((entry) => entry.id).slice(0, 2)).toEqual(['job_a', 'job_b']);
    });
  });
}

jobStoreContract('MemoryStudioJobStore', () => new MemoryStudioJobStore());

describe('FileStudioJobStore', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'studio-jobs-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  jobStoreContract('contract', () => new FileStudioJobStore(directory));

  it('rejects a job id that could escape the data directory', async () => {
    await expect(new FileStudioJobStore(directory).read('../secrets')).rejects.toThrow();
  });
});
