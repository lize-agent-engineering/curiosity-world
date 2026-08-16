import { describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import {
  CuriosityJobStoreConflictError,
  FileCuriosityJobStore,
  MemoryCuriosityJobStore,
  type CuriosityGenerationJob,
} from '@/lib/curiosity/jobs';
import { claimCuriosityJob, recoverExpiredCuriosityJobs } from '@/lib/curiosity/worker';

function job(overrides: Partial<CuriosityGenerationJob> = {}): CuriosityGenerationJob {
  return {
    id: 'job_worker_1',
    storeVersion: 1,
    status: 'queued',
    step: 'queued',
    progress: 0,
    message: 'queued',
    input: { question: '飞机为什么能飞起来？', targetAge: 8 },
    identity: {
      runId: 'run_worker_1',
      experienceId: 'cur_worker_1',
      versionId: 'ver_worker_1',
      revision: 1,
      createdAt: '2026-08-17T00:00:00.000Z',
      artifactIds: {
        question: 'art_question_1',
        knowledge: 'art_knowledge_1',
        scene: 'art_scene_1',
        presentation: 'art_presentation_1',
        quality: 'art_quality_1',
      },
      agentRunIds: {
        question: 'agent_question_1',
        knowledge: 'agent_knowledge_1',
        scene: 'agent_scene_1',
        presentation: 'agent_presentation_1',
        quality: 'agent_quality_1',
      },
    },
    runId: 'run_worker_1',
    completedStages: [],
    stageArtifacts: {},
    artifacts: [],
    agentRuns: [],
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
    ...overrides,
  };
}

describe('curiosity worker leases and CAS', () => {
  it('fast-fails stale updates with the current store version', async () => {
    const store = new MemoryCuriosityJobStore();
    await store.create(job());
    await store.update('job_worker_1', 1, { message: 'first' });
    await expect(store.update('job_worker_1', 1, { message: 'stale' })).rejects.toBeInstanceOf(
      CuriosityJobStoreConflictError,
    );
    expect((await store.read('job_worker_1'))?.storeVersion).toBe(2);
  });

  it('does not let another worker claim an unexpired lease', async () => {
    const store = new MemoryCuriosityJobStore();
    await store.create(job());
    const first = await claimCuriosityJob(
      store,
      'job_worker_1',
      'worker_a',
      60_000,
      1_700_000_000_000,
    );
    await expect(
      claimCuriosityJob(store, 'job_worker_1', 'worker_b', 60_000, 1_700_000_001_000),
    ).rejects.toThrow(/JOB_LEASE_HELD/);
    expect(first.leaseOwner).toBe('worker_a');
  });

  it('only recovers expired leases and preserves stage checkpoints', async () => {
    const store = new MemoryCuriosityJobStore();
    await store.create(
      job({
        status: 'running',
        step: 'scene',
        completedStages: ['question', 'knowledge'],
        stageArtifacts: { question: 'art_question_1', knowledge: 'art_knowledge_1' },
        leaseOwner: 'dead_worker',
        leaseExpiresAt: '2023-11-14T22:13:20.000Z',
      }),
    );
    await recoverExpiredCuriosityJobs(store, 'worker_b', 1_700_000_060_000);
    const recovered = await store.read('job_worker_1');
    expect(recovered).toMatchObject({
      status: 'queued',
      step: 'scene',
      completedStages: ['question', 'knowledge'],
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
    });
  });

  it('moves pre-lease running jobs back to the queue', async () => {
    const store = new MemoryCuriosityJobStore();
    await store.create(
      job({ status: 'running', leaseOwner: undefined, leaseExpiresAt: undefined }),
    );
    await recoverExpiredCuriosityJobs(store, 'worker_b', 1_700_000_060_000);
    expect(await store.read('job_worker_1')).toMatchObject({ status: 'queued' });
  });

  it('marks legacy jobs without V3 identity as explicitly incompatible', async () => {
    const store = new MemoryCuriosityJobStore();
    const { identity: _identity, ...legacy } = job();
    await store.create(legacy as CuriosityGenerationJob);
    await recoverExpiredCuriosityJobs(store, 'worker_b');
    expect(await store.read('job_worker_1')).toMatchObject({
      status: 'failed',
      errorCode: 'LEGACY_JOB_INCOMPATIBLE',
    });
  });

  it('reclaims a stale file lock before applying a CAS update', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'curiosity-worker-'));
    const store = new FileCuriosityJobStore(directory);
    try {
      await store.create(job());
      const lockPath = path.join(directory, 'job_worker_1.json.lock');
      await fs.mkdir(lockPath);
      const stale = new Date(Date.now() - 700_000);
      await fs.utimes(lockPath, stale, stale);
      await expect(
        store.update('job_worker_1', 1, { message: 'recovered' }),
      ).resolves.toMatchObject({ message: 'recovered', storeVersion: 2 });
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
