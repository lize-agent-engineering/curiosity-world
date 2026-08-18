import { describe, expect, it } from 'vitest';

import type { StudioMessage } from '@/lib/studio/contracts';
import {
  buildStudioTurns,
  findActiveStudioJobId,
  foldStudioCode,
  studioJobViewSchema,
  studioProjectViewSchema,
} from '@/lib/studio/client';

const at = '2026-08-18T10:00:00.000Z';
const message = (overrides: Partial<StudioMessage>): StudioMessage => ({
  id: 'msg_one',
  projectId: 'prj_one',
  role: 'user',
  text: '做个番茄钟',
  createdAt: at,
  ...overrides,
});

describe('findActiveStudioJobId', () => {
  it('finds the job of a user turn that has not been answered yet', () => {
    expect(findActiveStudioJobId([message({ jobId: 'job_one' })])).toBe('job_one');
  });

  it('returns null once the agent has replied to that turn', () => {
    expect(
      findActiveStudioJobId([
        message({ jobId: 'job_one' }),
        message({ id: 'msg_two', role: 'agent', text: '做好了', jobId: 'job_one' }),
      ]),
    ).toBeNull();
  });

  it('picks the latest unanswered turn when several rounds have run', () => {
    expect(
      findActiveStudioJobId([
        message({ jobId: 'job_one' }),
        message({ id: 'msg_two', role: 'agent', text: '做好了', jobId: 'job_one' }),
        message({ id: 'msg_three', text: '加个计数', jobId: 'job_two' }),
      ]),
    ).toBe('job_two');
  });

  it('returns null for a conversation with no jobs', () => {
    expect(findActiveStudioJobId([message({})])).toBeNull();
  });
});

describe('foldStudioCode', () => {
  it('appends the incremental chunk', () => {
    expect(foldStudioCode('abc', { codeChunk: 'def', codeLength: 6 })).toBe('abcdef');
  });

  it('resets when the server restarted the stream for a new round', () => {
    expect(foldStudioCode('abcdef', { codeChunk: 'xy', codeLength: 2 })).toBe('xy');
  });

  it('keeps what it has when the chunk is empty', () => {
    expect(foldStudioCode('abc', { codeChunk: '', codeLength: 3 })).toBe('abc');
  });
});

describe('response schemas', () => {
  it('accepts a job poll payload', () => {
    const view = studioJobViewSchema.parse({
      success: true,
      id: 'job_one',
      projectId: 'prj_one',
      status: 'running',
      stage: 'coding',
      message: '正在编写代码',
      codeChunk: '<!doctype html>',
      codeLength: 15,
      progress: 40,
      done: false,
    });
    expect(view.stage).toBe('coding');
  });

  it('accepts a finished job with its result', () => {
    const view = studioJobViewSchema.parse({
      success: true,
      id: 'job_one',
      projectId: 'prj_one',
      status: 'succeeded',
      stage: 'done',
      message: '生成完成',
      codeChunk: '',
      codeLength: 20,
      progress: 100,
      done: true,
      editMode: 'patch',
      review: { verdict: 'pass', findings: [] },
      result: { versionId: 'ver_one', revision: 2, summary: '加了计数' },
    });
    expect(view.result!.revision).toBe(2);
  });

  it('accepts a project payload whose versions carry no html', () => {
    const view = studioProjectViewSchema.parse({
      success: true,
      project: {
        id: 'prj_one',
        title: '番茄钟',
        createdAt: at,
        updatedAt: at,
        currentVersionId: 'ver_one',
        storeVersion: 2,
      },
      messages: [message({ jobId: 'job_one' })],
      versions: [
        {
          id: 'ver_one',
          projectId: 'prj_one',
          parentVersionId: null,
          revision: 1,
          summary: '第一版',
          appKind: 'tool',
          editMode: 'create',
          jobId: 'job_one',
          runtimeErrors: [],
          createdAt: at,
          htmlBytes: 1200,
        },
      ],
    });
    expect(view.versions[0]!.htmlBytes).toBe(1200);
  });
});

describe('buildStudioTurns', () => {
  const job = {
    id: 'job_two',
    projectId: 'prj_one',
    status: 'running' as const,
    stage: 'coding' as const,
    message: '正在编写代码',
    codeChunk: '',
    codeLength: 3,
    progress: 40,
    done: false,
  };

  it('recovers how a past round was made from the stored version', () => {
    const turns = buildStudioTurns({
      messages: [
        message({ jobId: 'job_one' }),
        message({
          id: 'msg_two',
          role: 'agent',
          text: '做好了',
          jobId: 'job_one',
          versionId: 'ver_one',
        }),
      ],
      versions: [
        {
          id: 'ver_one',
          projectId: 'prj_one',
          parentVersionId: null,
          revision: 1,
          summary: '第一版',
          appKind: 'tool',
          editMode: 'patch',
          jobId: 'job_one',
          runtimeErrors: [],
          createdAt: at,
          htmlBytes: 10,
          review: { verdict: 'pass', findings: [] },
        },
      ],
      activeJob: null,
      code: '',
    });
    expect(turns[0]!.artifacts).toMatchObject({ editMode: 'patch' });
    expect(turns[0]!.artifacts!.review!.verdict).toBe('pass');
  });

  it('pairs each request with the reply that answered it', () => {
    const turns = buildStudioTurns({
      messages: [
        message({ jobId: 'job_one' }),
        message({
          id: 'msg_two',
          role: 'agent',
          text: '做好了',
          jobId: 'job_one',
          versionId: 'ver_one',
        }),
      ],
      activeJob: null,
      code: '',
    });
    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({
      request: '做个番茄钟',
      reply: '做好了',
      versionId: 'ver_one',
    });
  });

  it('attaches the live job and its stream to the unanswered turn only', () => {
    const turns = buildStudioTurns({
      messages: [
        message({ jobId: 'job_one' }),
        message({ id: 'msg_two', role: 'agent', text: '做好了', jobId: 'job_one' }),
        message({ id: 'msg_three', text: '加个计数', jobId: 'job_two' }),
      ],
      activeJob: job,
      code: '<h1',
    });
    expect(turns[0]!.job).toBeUndefined();
    expect(turns[1]!.job!.id).toBe('job_two');
    expect(turns[1]!.code).toBe('<h1');
  });

  it('keeps an unanswered turn even when nothing is running', () => {
    const turns = buildStudioTurns({
      messages: [message({ jobId: 'job_one' })],
      activeJob: null,
      code: '',
    });
    expect(turns).toHaveLength(1);
    expect(turns[0]!.reply).toBeUndefined();
  });
});
