import { describe, expect, it, vi } from 'vitest';

import type { StudioPipelineModels, StudioTextModel } from '@/lib/studio/pipeline';
import {
  MemoryStudioJobStore,
  type StudioGenerationJob,
  type StudioJobStore,
} from '@/lib/studio/jobs';
import {
  appendStudioVersion,
  createStudioSnapshot,
  MemoryStudioStore,
  type StudioStore,
} from '@/lib/studio/store';
import { runStudioWorkerOnce } from '@/lib/studio/worker';

const at = '2026-08-18T10:00:00.000Z';

const document = `<!doctype html>\n<html lang="zh-CN"><head><title>番茄钟</title></head>\n<body><h1>番茄钟</h1></body>\n</html>`;

function textModel(responses: string[]): StudioTextModel {
  let index = 0;
  return {
    route: { providerId: 'test', modelId: 'x' },
    async complete(input) {
      const response = responses[Math.min(index, responses.length - 1)]!;
      index += 1;
      if (input.onDelta) {
        for (const chunk of response.match(/[\s\S]{1,20}/g) ?? []) await input.onDelta(chunk);
      }
      return response;
    },
  };
}

const planJson = JSON.stringify({
  appName: '番茄钟',
  appKind: 'tool',
  summary: '一个专注计时器。',
  changeNote: '生成了番茄钟。',
  features: ['倒计时'],
  layout: '居中单栏，标题在上、按钮在下。',
  interactions: ['点击开始'],
  persistence: 'none',
});

function models(coder: string[] = [document]): StudioPipelineModels {
  return {
    'studio.planner': textModel([planJson]),
    'studio.coder': textModel(coder),
    'studio.reviewer': textModel([JSON.stringify({ verdict: 'pass', findings: [] })]),
  };
}

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

async function seeded(): Promise<{ jobStore: StudioJobStore; projectStore: StudioStore }> {
  const projectStore = new MemoryStudioStore();
  await projectStore.create(
    createStudioSnapshot({
      projectId: 'prj_one',
      title: '番茄钟',
      createdAt: at,
      firstMessage: { id: 'msg_one', text: '做个番茄钟', createdAt: at },
    }),
  );
  return { jobStore: new MemoryStudioJobStore(), projectStore };
}

const ids = () => ({ versionId: 'ver_new', messageId: 'msg_new' });

describe('runStudioWorkerOnce', () => {
  it('reports that there was nothing to do when the queue is empty', async () => {
    const { jobStore, projectStore } = await seeded();
    expect(
      await runStudioWorkerOnce({
        jobStore,
        projectStore,
        workerId: 'w1',
        resolveModels: async () => models(),
        newIds: ids,
      }),
    ).toBe(false);
  });

  it('runs a create job into a stored first version and an agent reply', async () => {
    const { jobStore, projectStore } = await seeded();
    await jobStore.create(job());
    expect(
      await runStudioWorkerOnce({
        jobStore,
        projectStore,
        workerId: 'w1',
        resolveModels: async () => models(),
        newIds: ids,
      }),
    ).toBe(true);
    const snapshot = (await projectStore.read('prj_one'))!;
    expect(snapshot.versions).toHaveLength(1);
    expect(snapshot.versions[0]!.editMode).toBe('create');
    expect(snapshot.versions[0]!.jobId).toBe('job_one');
    expect(snapshot.project.currentVersionId).toBe('ver_new');
    expect(snapshot.messages.at(-1)).toMatchObject({ role: 'agent', versionId: 'ver_new' });
    const finished = (await jobStore.read('job_one'))!;
    expect(finished.status).toBe('succeeded');
    expect(finished.stage).toBe('done');
    expect(finished.result).toMatchObject({ versionId: 'ver_new', revision: 1 });
  });

  it('renames the project to the planned app name on the first version only', async () => {
    const { jobStore, projectStore } = await seeded();
    await jobStore.create(job());
    await runStudioWorkerOnce({
      jobStore,
      projectStore,
      workerId: 'w1',
      resolveModels: async () => models(),
      newIds: ids,
    });
    expect((await projectStore.read('prj_one'))!.project.title).toBe('番茄钟');
    await jobStore.create(
      job({ id: 'job_two', input: { request: '改标题', parentVersionId: null } }),
    );
    await runStudioWorkerOnce({
      jobStore,
      projectStore,
      workerId: 'w1',
      resolveModels: async () =>
        models(['<<<<<<< SEARCH\n<h1>番茄钟</h1>\n=======\n<h1>专注钟</h1>\n>>>>>>> REPLACE']),
      newIds: () => ({ versionId: 'ver_two', messageId: 'msg_two' }),
    });
    expect((await projectStore.read('prj_one'))!.project.title).toBe('番茄钟');
  });

  it('streams the code into the job as it is written', async () => {
    const { jobStore, projectStore } = await seeded();
    await jobStore.create(job());
    const seen: number[] = [];
    const spy = vi.spyOn(jobStore, 'update');
    await runStudioWorkerOnce({
      jobStore,
      projectStore,
      workerId: 'w1',
      resolveModels: async () => models(),
      newIds: ids,
      onJobWritten: (written) => seen.push(written.code.length),
    });
    expect((await jobStore.read('job_one'))!.code).toBe(document);
    // Throttled: far fewer writes than the ~7 delta chunks plus stage changes.
    expect(spy.mock.calls.length).toBeLessThan(12);
    expect(seen.at(-1)).toBe(document.length);
  });

  it('builds the next version on top of the current one for a modify turn', async () => {
    const { jobStore, projectStore } = await seeded();
    const snapshot = await projectStore.read('prj_one');
    await projectStore.write(
      appendStudioVersion(snapshot!, {
        id: 'ver_one',
        projectId: 'prj_one',
        parentVersionId: null,
        revision: 1,
        html: document,
        summary: '第一版',
        appKind: 'tool',
        editMode: 'create',
        jobId: 'job_zero',
        runtimeErrors: [],
        createdAt: at,
      }),
      snapshot!.project.storeVersion,
    );
    await jobStore.create(
      job({ id: 'job_two', input: { request: '标题改成专注钟', parentVersionId: null } }),
    );
    await runStudioWorkerOnce({
      jobStore,
      projectStore,
      workerId: 'w1',
      resolveModels: async () =>
        models(['<<<<<<< SEARCH\n<h1>番茄钟</h1>\n=======\n<h1>专注钟</h1>\n>>>>>>> REPLACE']),
      newIds: ids,
    });
    const next = (await projectStore.read('prj_one'))!;
    expect(next.versions).toHaveLength(2);
    expect(next.versions[1]).toMatchObject({
      parentVersionId: 'ver_one',
      revision: 2,
      editMode: 'patch',
    });
    expect(next.versions[1]!.html).toContain('专注钟');
  });

  it('feeds the previous version runtime errors into the generation', async () => {
    const { jobStore, projectStore } = await seeded();
    const snapshot = await projectStore.read('prj_one');
    await projectStore.write(
      appendStudioVersion(snapshot!, {
        id: 'ver_one',
        projectId: 'prj_one',
        parentVersionId: null,
        revision: 1,
        html: document,
        summary: '第一版',
        appKind: 'tool',
        editMode: 'create',
        jobId: 'job_zero',
        runtimeErrors: [{ errorKind: 'error', message: 'timer is not defined', occurredAt: at }],
        createdAt: at,
      }),
      snapshot!.project.storeVersion,
    );
    await jobStore.create(job({ id: 'job_two' }));
    let coderPrompt = '';
    const bundle = models([
      '<<<<<<< SEARCH\n<h1>番茄钟</h1>\n=======\n<h1>专注钟</h1>\n>>>>>>> REPLACE',
    ]);
    const coder = bundle['studio.coder'];
    bundle['studio.coder'] = {
      route: coder.route,
      complete: (input) => {
        coderPrompt = input.prompt;
        return coder.complete(input);
      },
    };
    await runStudioWorkerOnce({
      jobStore,
      projectStore,
      workerId: 'w1',
      resolveModels: async () => bundle,
      newIds: ids,
    });
    expect(coderPrompt).toContain('timer is not defined');
  });

  it('fails the job without touching the project when generation fails', async () => {
    const { jobStore, projectStore } = await seeded();
    await jobStore.create(job());
    await runStudioWorkerOnce({
      jobStore,
      projectStore,
      workerId: 'w1',
      resolveModels: async () => models(['这是一段说明，不是网页。']),
      newIds: ids,
    });
    const failed = (await jobStore.read('job_one'))!;
    expect(failed.status).toBe('failed');
    expect(failed.errorCode).toBe('CODE_INVALID');
    expect(failed.message.length).toBeGreaterThan(0);
    expect((await projectStore.read('prj_one'))!.versions).toHaveLength(0);
  });

  it('fails the job clearly when no model is configured', async () => {
    const { jobStore, projectStore } = await seeded();
    await jobStore.create(job());
    await runStudioWorkerOnce({
      jobStore,
      projectStore,
      workerId: 'w1',
      resolveModels: async () => {
        throw new Error('no model');
      },
      newIds: ids,
    });
    expect((await jobStore.read('job_one'))!.errorCode).toBe('MODEL_UNAVAILABLE');
  });

  it('leaves a job that another worker holds a live lease on', async () => {
    const { jobStore, projectStore } = await seeded();
    await jobStore.create(
      job({
        status: 'running',
        leaseOwner: 'w2',
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    );
    expect(
      await runStudioWorkerOnce({
        jobStore,
        projectStore,
        workerId: 'w1',
        resolveModels: async () => models(),
        newIds: ids,
      }),
    ).toBe(false);
  });

  it('recovers a job whose worker died and runs it from the start', async () => {
    const { jobStore, projectStore } = await seeded();
    await jobStore.create(
      job({
        status: 'running',
        stage: 'coding',
        code: '<!doctype html><html><bo',
        leaseOwner: 'w2',
        leaseExpiresAt: new Date(Date.now() - 1_000).toISOString(),
      }),
    );
    await runStudioWorkerOnce({
      jobStore,
      projectStore,
      workerId: 'w1',
      resolveModels: async () => models(),
      newIds: ids,
    });
    const finished = (await jobStore.read('job_one'))!;
    expect(finished.status).toBe('succeeded');
    expect(finished.code).toBe(document);
    expect((await projectStore.read('prj_one'))!.versions).toHaveLength(1);
  });
});
