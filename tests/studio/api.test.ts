import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createStudioJobGetHandler,
  createStudioMessagePostHandler,
  createStudioProjectGetHandler,
  createStudioProjectsGetHandler,
  createStudioProjectsPostHandler,
  createStudioRollbackPostHandler,
  createStudioRuntimeErrorPostHandler,
  createStudioVersionGetHandler,
} from '@/lib/studio/api-handlers';
import { MemoryStudioJobStore, type StudioJobStore } from '@/lib/studio/jobs';
import { appendStudioVersion, MemoryStudioStore, type StudioStore } from '@/lib/studio/store';

const at = '2026-08-18T10:00:00.000Z';
let counter = 0;
const identityFactory = () => {
  counter += 1;
  return {
    projectId: `prj_test${counter}`,
    jobId: `job_test${counter}`,
    messageId: `msg_test${counter}`,
    createdAt: at,
  };
};

let projectStore: StudioStore;
let jobStore: StudioJobStore;

const post = (body: unknown) =>
  new NextRequest('http://studio.local/api/studio/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const json = async (response: Response) => (await response.json()) as Record<string, unknown>;

beforeEach(() => {
  counter = 0;
  projectStore = new MemoryStudioStore();
  jobStore = new MemoryStudioJobStore();
});

async function seedProject() {
  const handler = createStudioProjectsPostHandler({ projectStore, jobStore, identityFactory });
  return json(await handler(post({ prompt: '做一个番茄钟' })));
}

async function seedVersion(
  projectId: string,
  versionId = 'ver_one',
  parentVersionId: string | null = null,
) {
  const snapshot = (await projectStore.read(projectId))!;
  return projectStore.write(
    appendStudioVersion(snapshot, {
      id: versionId,
      projectId,
      parentVersionId,
      revision: 1,
      html: '<!doctype html><html><body><h1>番茄钟</h1></body></html>',
      summary: '第一版',
      appKind: 'tool',
      editMode: 'create',
      jobId: 'job_test1',
      runtimeErrors: [],
      createdAt: at,
    }),
    snapshot.project.storeVersion,
  );
}

describe('the education surface', () => {
  it('records the child age on the project and on the job', async () => {
    const handler = createStudioProjectsPostHandler({ projectStore, jobStore, identityFactory });
    const response = await handler(
      post({ prompt: '为什么月亮看起来会跟着我们？', mode: 'education', targetAge: 8 }),
    );
    expect(response.status).toBe(202);
    const snapshot = (await projectStore.read('prj_test1'))!;
    expect(snapshot.project.mode).toBe('education');
    expect(snapshot.project.targetAge).toBe(8);
    expect((await jobStore.read('job_test1'))!.input).toMatchObject({
      mode: 'education',
      targetAge: 8,
    });
  });

  it('refuses an education project with no child age', async () => {
    const handler = createStudioProjectsPostHandler({ projectStore, jobStore, identityFactory });
    const response = await handler(post({ prompt: '为什么天是蓝的？', mode: 'education' }));
    expect(response.status).toBe(400);
  });

  it('rejects an age outside the supported range instead of guessing', async () => {
    const handler = createStudioProjectsPostHandler({ projectStore, jobStore, identityFactory });
    const response = await handler(
      post({ prompt: '为什么天是蓝的？', mode: 'education', targetAge: 30 }),
    );
    expect(response.status).toBe(400);
  });

  it('makes a follow-up turn inherit the surface and the age of its project', async () => {
    const create = createStudioProjectsPostHandler({ projectStore, jobStore, identityFactory });
    await create(post({ prompt: '为什么月亮看起来会跟着我们？', mode: 'education', targetAge: 8 }));
    await seedVersion('prj_test1');
    const handler = createStudioMessagePostHandler({ projectStore, jobStore, identityFactory });
    await handler(post({ text: '再简单一点' }), {
      params: Promise.resolve({ projectId: 'prj_test1' }),
    });
    expect((await jobStore.read('job_test2'))!.input).toMatchObject({
      mode: 'education',
      targetAge: 8,
    });
  });
});

describe('POST /api/studio/projects', () => {
  it('creates a project, records the request as the first message and queues a job', async () => {
    const body = await seedProject();
    expect(body.projectId).toBe('prj_test1');
    expect(body.jobId).toBe('job_test1');
    expect(body.pollUrl).toBe('/api/studio/jobs/job_test1');
    const snapshot = (await projectStore.read('prj_test1'))!;
    expect(snapshot.messages[0]!.text).toBe('做一个番茄钟');
    const job = (await jobStore.read('job_test1'))!;
    expect(job.status).toBe('queued');
    expect(job.input.request).toBe('做一个番茄钟');
  });

  it('names the project from the request until the planner renames it', async () => {
    await seedProject();
    expect((await projectStore.read('prj_test1'))!.project.title).toContain('番茄钟');
  });

  it('accepts an unusual request instead of judging it', async () => {
    const handler = createStudioProjectsPostHandler({ projectStore, jobStore, identityFactory });
    const response = await handler(post({ prompt: '做一个会占卜的土豆' }));
    expect(response.status).toBe(202);
  });

  it('rejects an empty request', async () => {
    const handler = createStudioProjectsPostHandler({ projectStore, jobStore, identityFactory });
    const response = await handler(post({ prompt: ' ' }));
    expect(response.status).toBe(400);
    expect((await json(response)).errorCode).toBe('INVALID_REQUEST');
  });
});

describe('GET /api/studio/projects', () => {
  it('lists projects with the kind and revision of their current version', async () => {
    await seedProject();
    await seedVersion('prj_test1');
    const body = await json(await createStudioProjectsGetHandler({ projectStore })());
    const projects = body.projects as Array<Record<string, unknown>>;
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ id: 'prj_test1', appKind: 'tool', revision: 1 });
    expect(projects[0]!.question).toBe('做一个番茄钟');
  });

  it('lists a project that has no version yet', async () => {
    await seedProject();
    const body = await json(await createStudioProjectsGetHandler({ projectStore })());
    expect(body.projects as unknown[]).toHaveLength(1);
  });
});

describe('GET /api/studio/projects/:projectId', () => {
  it('returns the conversation and the version tree without the html payloads', async () => {
    await seedProject();
    await seedVersion('prj_test1');
    const handler = createStudioProjectGetHandler({ projectStore });
    const body = await json(
      await handler(post({}), { params: Promise.resolve({ projectId: 'prj_test1' }) }),
    );
    const versions = body.versions as Array<Record<string, unknown>>;
    expect(versions[0]!.html).toBeUndefined();
    expect(versions[0]!.htmlBytes).toBeGreaterThan(0);
    expect((body.messages as unknown[]).length).toBe(1);
    expect((body.project as Record<string, unknown>).currentVersionId).toBe('ver_one');
  });

  it('404s an unknown project', async () => {
    const handler = createStudioProjectGetHandler({ projectStore });
    const response = await handler(post({}), {
      params: Promise.resolve({ projectId: 'prj_missing' }),
    });
    expect(response.status).toBe(404);
  });
});

describe('GET a version', () => {
  it('returns the stored html for preview', async () => {
    await seedProject();
    await seedVersion('prj_test1');
    const handler = createStudioVersionGetHandler({ projectStore });
    const body = await json(
      await handler(post({}), {
        params: Promise.resolve({ projectId: 'prj_test1', versionId: 'ver_one' }),
      }),
    );
    expect(String(body.html)).toContain('番茄钟');
  });

  it('404s a version from another project', async () => {
    await seedProject();
    await seedVersion('prj_test1');
    const handler = createStudioVersionGetHandler({ projectStore });
    const response = await handler(post({}), {
      params: Promise.resolve({ projectId: 'prj_test1', versionId: 'ver_other' }),
    });
    expect(response.status).toBe(404);
  });
});

describe('POST a follow-up message', () => {
  it('queues a job that continues from the current version', async () => {
    await seedProject();
    await seedVersion('prj_test1');
    const handler = createStudioMessagePostHandler({ projectStore, jobStore, identityFactory });
    const body = await json(
      await handler(post({ text: '加一个今日完成计数' }), {
        params: Promise.resolve({ projectId: 'prj_test1' }),
      }),
    );
    expect(body.jobId).toBe('job_test2');
    const job = (await jobStore.read('job_test2'))!;
    expect(job.input).toEqual({
      request: '加一个今日完成计数',
      parentVersionId: 'ver_one',
      mode: 'general',
    });
    const snapshot = (await projectStore.read('prj_test1'))!;
    expect(snapshot.messages.at(-1)!.text).toBe('加一个今日完成计数');
  });

  it('branches from an explicitly chosen version', async () => {
    await seedProject();
    await seedVersion('prj_test1');
    await seedVersion('prj_test1', 'ver_two', 'ver_one');
    const handler = createStudioMessagePostHandler({ projectStore, jobStore, identityFactory });
    await handler(post({ text: '换个配色', parentVersionId: 'ver_one' }), {
      params: Promise.resolve({ projectId: 'prj_test1' }),
    });
    expect((await jobStore.read('job_test2'))!.input.parentVersionId).toBe('ver_one');
  });

  it('404s an unknown parent version', async () => {
    await seedProject();
    await seedVersion('prj_test1');
    const handler = createStudioMessagePostHandler({ projectStore, jobStore, identityFactory });
    const response = await handler(post({ text: '改一下', parentVersionId: 'ver_nope' }), {
      params: Promise.resolve({ projectId: 'prj_test1' }),
    });
    expect(response.status).toBe(404);
  });
});

describe('POST a rollback', () => {
  it('moves the pointer and keeps every version', async () => {
    await seedProject();
    await seedVersion('prj_test1');
    await seedVersion('prj_test1', 'ver_two', 'ver_one');
    const handler = createStudioRollbackPostHandler({ projectStore });
    const response = await handler(post({ versionId: 'ver_one' }), {
      params: Promise.resolve({ projectId: 'prj_test1' }),
    });
    expect(response.status).toBe(200);
    const snapshot = (await projectStore.read('prj_test1'))!;
    expect(snapshot.project.currentVersionId).toBe('ver_one');
    expect(snapshot.versions).toHaveLength(2);
  });

  it('404s an unknown version', async () => {
    await seedProject();
    await seedVersion('prj_test1');
    const handler = createStudioRollbackPostHandler({ projectStore });
    const response = await handler(post({ versionId: 'ver_nope' }), {
      params: Promise.resolve({ projectId: 'prj_test1' }),
    });
    expect(response.status).toBe(404);
  });
});

describe('POST runtime errors', () => {
  it('attaches errors reported by the preview to the version that produced them', async () => {
    await seedProject();
    await seedVersion('prj_test1');
    const handler = createStudioRuntimeErrorPostHandler({ projectStore });
    const response = await handler(
      post({ errors: [{ errorKind: 'error', message: 'timer is not defined' }] }),
      { params: Promise.resolve({ projectId: 'prj_test1', versionId: 'ver_one' }) },
    );
    expect(response.status).toBe(200);
    const snapshot = (await projectStore.read('prj_test1'))!;
    expect(snapshot.versions[0]!.runtimeErrors[0]!.message).toBe('timer is not defined');
  });

  it('rejects a malformed report', async () => {
    await seedProject();
    await seedVersion('prj_test1');
    const handler = createStudioRuntimeErrorPostHandler({ projectStore });
    const response = await handler(post({ errors: [{ message: '' }] }), {
      params: Promise.resolve({ projectId: 'prj_test1', versionId: 'ver_one' }),
    });
    expect(response.status).toBe(400);
  });
});

describe('GET a job', () => {
  it('returns only the code the client has not seen', async () => {
    await seedProject();
    await jobStore.update('job_test1', 1, {
      status: 'running',
      stage: 'coding',
      code: '0123456789',
    });
    const handler = createStudioJobGetHandler({ jobStore });
    const body = await json(
      await handler(new NextRequest('http://studio.local/api/studio/jobs/job_test1?since=4'), {
        params: Promise.resolve({ jobId: 'job_test1' }),
      }),
    );
    expect(body.codeChunk).toBe('456789');
    expect(body.codeLength).toBe(10);
    expect(body.done).toBe(false);
  });

  it('defaults to the whole stream when since is missing', async () => {
    await seedProject();
    await jobStore.update('job_test1', 1, { code: 'abc' });
    const handler = createStudioJobGetHandler({ jobStore });
    const body = await json(
      await handler(new NextRequest('http://studio.local/api/studio/jobs/job_test1'), {
        params: Promise.resolve({ jobId: 'job_test1' }),
      }),
    );
    expect(body.codeChunk).toBe('abc');
  });

  it('404s an unknown job', async () => {
    const handler = createStudioJobGetHandler({ jobStore });
    const response = await handler(new NextRequest('http://studio.local/api/studio/jobs/job_x'), {
      params: Promise.resolve({ jobId: 'job_x' }),
    });
    expect(response.status).toBe(404);
  });
});
