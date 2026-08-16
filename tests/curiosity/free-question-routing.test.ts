import { describe, expect, it, vi } from 'vitest';

import { createCuriosityGenerationPostHandler } from '@/lib/curiosity/api-handlers';
import { MemoryCuriosityJobStore } from '@/lib/curiosity/jobs';
import { classifyCuriosityRequest, CuriosityDomainError } from '@/lib/curiosity/knowledge';

const request = (body: unknown) =>
  new Request('http://localhost/api/curiosity/generations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;

function identityFactory() {
  return {
    jobId: 'job_free_question',
    runId: 'run_free_question',
    experienceId: 'cur_free_question',
    versionId: 'ver_free_question',
    createdAt: '2026-08-17T00:00:00.000Z',
    artifactIds: {
      question: 'art_question_free',
      knowledge: 'art_knowledge_free',
      scene: 'art_scene_free',
      presentation: 'art_presentation_free',
      spec: 'art_spec_free',
      quality: 'art_quality_free',
    },
    agentRunIds: {
      question: 'agent_run_question_free',
      knowledge: 'agent_run_knowledge_free',
      scene: 'agent_run_scene_free',
      presentation: 'agent_run_presentation_free',
      quality: 'agent_run_quality_free',
    },
  };
}

describe('first-release free-question routing', () => {
  it.each([
    ['为什么月亮看起来会跟着我？', 'relative-motion', 'relative-motion.moon-following.v1'],
    ['桥为什么不会倒？', 'balance-support', 'balance-support.bridge.v1'],
    ['影子为什么会变长？', 'light-path', 'light-path.shadow-length.v1'],
  ])('routes one curated-family match through its curated pack', (question, family, packId) => {
    expect(classifyCuriosityRequest({ question, targetAge: 8 })).toEqual({
      kind: 'curated',
      family,
      packId,
    });
  });

  it('routes an unmatched question to open knowledge generation', () => {
    expect(
      classifyCuriosityRequest({ question: '毛毛虫为什么会变成蝴蝶？', targetAge: 8 }),
    ).toEqual({
      kind: 'open',
      matchedFamilies: [],
    });
  });

  it('routes a multi-family match to open instead of asking the child to disambiguate', () => {
    expect(
      classifyCuriosityRequest({ question: '桥的影子为什么会变长又不会倒？', targetAge: 8 }),
    ).toEqual({
      kind: 'open',
      matchedFamilies: ['balance-support', 'light-path'],
    });
  });

  it('fails with NEEDS_CLARIFICATION when the question has no identifiable subject', () => {
    expect(() =>
      classifyCuriosityRequest({ question: '为什么会这样？', targetAge: 8 }),
    ).toThrowError(
      expect.objectContaining<Partial<CuriosityDomainError>>({ code: 'NEEDS_CLARIFICATION' }),
    );
  });
});

describe('first generation request contract', () => {
  it('creates an initial job with only question and targetAge and resolves five generation roles', async () => {
    const store = new MemoryCuriosityJobStore();
    const roles: string[] = [];
    const schedule = vi.fn();
    const post = createCuriosityGenerationPostHandler({
      store,
      resolveRoleModel: vi.fn(async (_request, _body, role) => {
        roles.push(role);
        return {
          route: { providerId: 'test', modelId: 'unused' },
          complete: async () => '{}',
        };
      }),
      schedule,
      identityFactory,
    });

    const response = await post(request({ question: '毛毛虫为什么会变成蝴蝶？', targetAge: 8 }));

    expect(response.status).toBe(202);
    expect(roles).toEqual([
      'curiosity.question-modeler',
      'curiosity.knowledge-designer',
      'curiosity.interaction-designer',
      'curiosity.presentation-designer',
      'curiosity.quality-reviewer',
    ]);
    expect((await store.read('job_free_question'))?.input).toEqual({
      question: '毛毛虫为什么会变成蝴蝶？',
      targetAge: 8,
    });
    expect(schedule).toHaveBeenCalledOnce();
  });

  it('accepts only question and targetAge', async () => {
    const store = new MemoryCuriosityJobStore();
    const resolveRoleModel = vi.fn();
    const post = createCuriosityGenerationPostHandler({
      store,
      resolveRoleModel,
      schedule: vi.fn(),
      identityFactory,
    });

    const response = await post(
      request({
        question: '毛毛虫为什么会变成蝴蝶？',
        targetAge: 8,
        interests: ['昆虫'],
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, errorCode: 'INVALID_REQUEST' });
    expect(resolveRoleModel).not.toHaveBeenCalled();
    expect(await store.list()).toHaveLength(0);
  });

  it('returns 422 NEEDS_CLARIFICATION without creating a job', async () => {
    const store = new MemoryCuriosityJobStore();
    const resolveRoleModel = vi.fn();
    const schedule = vi.fn();
    const post = createCuriosityGenerationPostHandler({
      store,
      resolveRoleModel,
      schedule,
      identityFactory,
    });

    const response = await post(request({ question: '为什么会这样？', targetAge: 8 }));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      success: false,
      errorCode: 'NEEDS_CLARIFICATION',
    });
    expect(resolveRoleModel).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
    expect(await store.list()).toHaveLength(0);
  });
});
