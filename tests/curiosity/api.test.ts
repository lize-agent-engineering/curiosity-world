import { describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

import {
  createCuriosityGenerationGetHandler,
  createCuriosityGenerationPostHandler,
  createCuriosityRevisionPostHandler,
  CuriosityModelUnavailableError,
} from '@/lib/curiosity/api-handlers';
import type { CuriosityAgentRole } from '@/lib/curiosity/agent-contracts';
import type { CuriosityPipelineModel } from '@/lib/curiosity/agent-pipeline';
import { MemoryCuriosityJobStore } from '@/lib/curiosity/jobs';
import { createValidCuriosityExperienceSpecV2, createValidCuriositySpec } from './fixture';

function request(url: string, body?: unknown): NextRequest {
  return new Request(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as NextRequest;
}

function validPipelineModel(
  role: CuriosityAgentRole,
  omitCausalRelations = false,
): CuriosityPipelineModel {
  const route = { providerId: 'test', modelId: 'strict-json' };
  if (role === 'curiosity.question-modeler') {
    return {
      route,
      complete: async () =>
        JSON.stringify({
          coreQuestion: '为什么我们移动时，月亮看起来还在原来的方向？',
          equivalentQuestions: ['月亮为什么像在跟着我？'],
          ageBand: '8-10',
          interestSignals: ['散步'],
          safetyTags: [],
          supportStatus: 'supported',
          knowledgeFamilyCandidates: ['relative-motion'],
          clarifications: [],
        }),
    };
  }
  if (role === 'curiosity.team-assembler') {
    return {
      route,
      complete: async () => JSON.stringify({
        teamName: '月光观察队',
        rationale: '围绕本题的科学边界和互动任务动态组成探索团队。',
        members: [
          { id: 'member_lead', name: '小满队长', role: 'lead', persona: '温和地串起问题和任务，只给孩子下一步线索。', avatar: '🌙', color: '#4F7DA1', priority: 10, voiceStyle: '温暖清楚，语速舒缓' },
          { id: 'member_science', name: '远近博士', role: 'science', persona: '专门核对远近物体与观察方向，守住科学解释边界。', avatar: '🔭', color: '#927236', priority: 8, voiceStyle: '沉稳准确，句子简短' },
          { id: 'member_interaction', name: '动手阿桥', role: 'interaction', persona: '把抽象规律变成孩子可以移动、比较和验证的动作。', avatar: '🧩', color: '#3F8066', priority: 7, voiceStyle: '活泼鼓励，节奏明快' },
        ],
      }),
    };
  }
  if (role === 'curiosity.knowledge-designer') {
    const output = {
      knowledgeFamily: 'relative-motion',
      packId: 'relative-motion.moon-following.v1',
      objectives: ['比较近处与远处物体的视角变化'],
      causalRelations: [
        {
          cause: '观察者移动相同距离',
          relation: '距离越远，观察方向变化越小',
          effect: '月亮看起来几乎停在原来的方向',
        },
      ],
      prerequisites: ['知道远和近'],
      allowedVocabulary: ['远', '近', '观察方向'],
      forbiddenExplanations: ['月亮真的在追着观察者移动'],
      misconceptions: ['视角变化等于真实速度'],
      ageExpressionStrategy: '比较路灯和月亮。',
      observationSuggestions: ['散步时比较路灯和月亮。'],
      packReferences: ['relative-motion.moon-following.v1#core'],
    };
    const { causalRelations: _causalRelations, ...withoutCausalRelations } = output;
    return {
      route,
      complete: async () => JSON.stringify(omitCausalRelations ? withoutCausalRelations : output),
    };
  }
  if (role === 'curiosity.interaction-designer') {
    return {
      route,
      complete: async () =>
        JSON.stringify({
          scenario: '夜晚散步时比较路灯、远山和月亮。',
          visualTheme: '安静的蓝色夜空',
          variables: [
            { id: 'observer-position', label: '观察者位置', min: -80, max: 80, initial: 0 },
            { id: 'object-distance', label: '物体距离', min: 20, max: 400, initial: 200 },
          ],
          taskSequence: [
            'prediction',
            'exploration',
            'guided-discovery',
            'transfer',
            'explanation',
          ],
          instructionCopy: [
            { taskId: 'prediction', kind: 'prediction', text: '先猜一猜' },
            { taskId: 'exploration', kind: 'exploration', text: '拖动看看' },
            {
              taskId: 'guided-discovery',
              kind: 'guided-discovery',
              text: '比较远和近',
            },
            { taskId: 'transfer', kind: 'transfer', text: '换个距离试试' },
            { taskId: 'explanation', kind: 'explanation', text: '选一个说给家长听' },
          ],
          primitives: ['move-observer', 'compare-near-far'],
          feedback: [
            {
              trigger: 'observer-moved',
              message: '近处路灯的方向变化更明显。',
              explains: '距离会影响观察方向的变化大小。',
            },
          ],
          endConditions: ['完成一次远近比较', '选择一个解释'],
        }),
    };
  }
  if (role === 'curiosity.story-designer') {
    const hints = (subject: string) => [
      { level: 0, text: `先看看${subject}。`, revealsAnswer: false },
      { level: 1, text: `再比较${subject}。`, revealsAnswer: false },
      { level: 2, text: `用${subject}来回答。`, revealsAnswer: false },
    ];
    return {
      route,
      complete: async () =>
        JSON.stringify({
          stages: [
            {
              id: 'predict',
              kind: 'prediction',
              openingNarration: '先猜一猜。',
              prompt: '谁变化得快？',
              allowedEventTypes: ['prediction_submitted'],
              hints: hints('远近'),
              completionCondition: '提交预测',
            },
            {
              id: 'explore',
              kind: 'exploration',
              openingNarration: '移动看看。',
              prompt: '拖动小朋友。',
              allowedEventTypes: ['variable_changed'],
              hints: hints('变量'),
              completionCondition: '改变变量',
            },
            {
              id: 'discover',
              kind: 'guided-discovery',
              openingNarration: '比较远近找规律。',
              prompt: '距离改变后有什么不同？',
              allowedEventTypes: ['variable_changed'],
              hints: hints('远近规律'),
              completionCondition: '说出比较结果',
            },
            {
              id: 'transfer',
              kind: 'transfer',
              openingNarration: '换个地方试试。',
              prompt: '选择一个。',
              allowedEventTypes: ['transfer_attempted'],
              hints: hints('新情境'),
              completionCondition: '完成迁移',
            },
            {
              id: 'explain',
              kind: 'explanation',
              openingNarration: '说出发现。',
              prompt: '为什么？',
              allowedEventTypes: ['explanation_selected'],
              hints: hints('现象'),
              completionCondition: '留下解释',
            },
          ],
        }),
    };
  }
  if (role === 'curiosity.quality-reviewer') {
    const criteria = [
      'age-fit',
      'interest-link',
      'knowledge-consistency',
      'misconception-risk',
      'interaction-completeness',
      'transfer-validity',
      'copy-load',
    ];
    return {
      route,
      complete: async () =>
        JSON.stringify({
          checks: criteria.map((criterion) => ({ criterion, status: 'pass', findings: [] })),
          verdict: 'pass',
        }),
    };
  }
  throw new Error(`No initial-generation model for ${role}`);
}

function generationIdentity(jobId: string) {
  return {
    jobId,
    runId: `run_${jobId}`,
    experienceId: `cur_${jobId}`,
    versionId: `ver_${jobId}`,
    createdAt: '2026-08-15T02:00:00.000Z',
    artifactIds: {
      question: `art_question_${jobId}`,
      knowledge: `art_knowledge_${jobId}`,
      interaction: `art_interaction_${jobId}`,
      team: `art_team_${jobId}`,
      story: `art_story_${jobId}`,
      spec: `art_spec_${jobId}`,
      quality: `art_quality_${jobId}`,
    },
    agentRunIds: {
      question: `agent_run_question_${jobId}`,
      knowledge: `agent_run_knowledge_${jobId}`,
      interaction: `agent_run_interaction_${jobId}`,
      team: `agent_run_team_${jobId}`,
      story: `agent_run_story_${jobId}`,
      quality: `agent_run_quality_${jobId}`,
    },
  };
}

describe('Curiosity generation API handlers', () => {
  it('creates a new candidate revision for an existing experience from another perspective', async () => {
    const store = new MemoryCuriosityJobStore();
    const scheduled: Promise<void>[] = [];
    const preservedCausalRelations = [
      {
        cause: '观察者移动相同距离',
        relation: '距离越远，观察方向变化越小',
        effect: '月亮看起来几乎停在原来的方向',
      },
    ];
    const post = createCuriosityGenerationPostHandler({
      store,
      resolveRoleModel: vi.fn(async (_request, _body, role) => validPipelineModel(role, true)),
      schedule: (work) => scheduled.push(work()),
      identityFactory: (body) => ({
        ...generationIdentity('job_regenerate'),
        experienceId: body.experienceId ?? 'unexpected',
        revision: body.revision,
      }),
    });

    const response = await post(
      request('http://localhost/api/curiosity/generations', {
        question: '为什么月亮看起来会跟着我们？',
        age: 8,
        interests: ['散步'],
        experienceId: 'cur_existing',
        revision: 2,
        perspectiveDirective: '从坐车看远山的角度重新讲解',
        preservedCausalRelations,
      }),
    );
    expect(response.status).toBe(202);
    await scheduled[0];

    const job = await store.read('job_regenerate');
    expect(job?.input).toMatchObject({
      experienceId: 'cur_existing',
      revision: 2,
      perspectiveDirective: '从坐车看远山的角度重新讲解',
      preservedCausalRelations,
    });
    expect(job?.result?.spec).toMatchObject({ experienceId: 'cur_existing', revision: 2 });
  });

  it('returns a queued job immediately and exposes the compiled candidate after work finishes', async () => {
    const store = new MemoryCuriosityJobStore();
    const scheduled: Promise<void>[] = [];
    const post = createCuriosityGenerationPostHandler({
      store,
      resolveRoleModel: vi.fn(async (_request, _body, role) => validPipelineModel(role)),
      schedule: (work) => scheduled.push(work()),
      identityFactory: () => generationIdentity('job_1'),
    });
    const response = await post(
      request('http://localhost/api/curiosity/generations', {
        question: '为什么月亮看起来会跟着我们？',
        age: 8,
        interests: ['散步'],
      }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ success: true, jobId: 'job_1', step: 'queued' });
    expect(scheduled).toHaveLength(1);
    await scheduled[0];

    const get = createCuriosityGenerationGetHandler({ store });
    const result = await get(request('http://localhost/api/curiosity/generations/job_1'), {
      params: Promise.resolve({ jobId: 'job_1' }),
    });
    const completed = await result.json();
    expect(completed).toMatchObject({
      success: true,
      status: 'candidate_ready',
      step: 'awaiting_runtime_check',
      completedStages: [
        'question_modeling',
        'knowledge_design',
        'interaction_design',
        'team_assembly',
        'story_design',
        'deterministic_compile',
        'quality_review',
      ],
      artifacts: expect.arrayContaining([
        expect.objectContaining({ artifactId: 'art_question_job_1' }),
      ]),
      agentRuns: expect.arrayContaining([
        expect.objectContaining({ agentRunId: 'agent_run_question_job_1' }),
      ]),
      result: {
        spec: { experienceId: 'cur_job_1', schemaVersion: '1.0' },
        experienceSpec: { experienceId: 'cur_job_1', schemaVersion: '2.0' },
      },
    });
    expect(completed.artifacts).toHaveLength(7);
    expect(completed.agentRuns).toHaveLength(6);
  });

  it('rejects unsupported input before resolving a model or creating a job', async () => {
    const store = new MemoryCuriosityJobStore();
    const resolveRoleModel = vi.fn(async (_request, _body, role: CuriosityAgentRole) =>
      validPipelineModel(role),
    );
    const post = createCuriosityGenerationPostHandler({
      store,
      resolveRoleModel,
      schedule: vi.fn(),
      identityFactory: vi.fn(),
    });
    const response = await post(
      request('http://localhost/api/curiosity/generations', {
        question: '彩虹为什么会出现？',
        age: 8,
        interests: [],
      }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ errorCode: 'UNSUPPORTED_QUESTION' });
    expect(resolveRoleModel).not.toHaveBeenCalled();
    expect(await store.list()).toEqual([]);
  });

  it('returns MODEL_UNAVAILABLE without creating a job', async () => {
    const store = new MemoryCuriosityJobStore();
    const post = createCuriosityGenerationPostHandler({
      store,
      resolveRoleModel: vi.fn(async () => {
        throw new CuriosityModelUnavailableError('没有可用模型');
      }),
      schedule: vi.fn(),
      identityFactory: vi.fn(),
    });
    const response = await post(
      request('http://localhost/api/curiosity/generations', {
        question: '为什么月亮会跟着我？',
        age: 8,
        interests: [],
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ errorCode: 'MODEL_UNAVAILABLE' });
    expect(await store.list()).toEqual([]);
  });

  it('marks invalid model output as a failed job without a candidate result', async () => {
    const store = new MemoryCuriosityJobStore();
    const scheduled: Promise<void>[] = [];
    const post = createCuriosityGenerationPostHandler({
      store,
      resolveRoleModel: vi.fn(async (_request, _body, role) =>
        role === 'curiosity.knowledge-designer'
          ? { ...validPipelineModel(role), complete: async () => 'not json' }
          : validPipelineModel(role),
      ),
      schedule: (work) => scheduled.push(work()),
      identityFactory: () => generationIdentity('job_bad'),
    });
    await post(
      request('http://localhost/api/curiosity/generations', {
        question: '为什么月亮会跟着我？',
        age: 8,
        interests: [],
      }),
    );
    await scheduled[0];

    expect(await store.read('job_bad')).toMatchObject({
      status: 'failed',
      step: 'failed',
      errorCode: 'KNOWLEDGE_DESIGN_INVALID',
      failedRole: 'curiosity.knowledge-designer',
      completedStages: ['question_modeling'],
      artifacts: [{ artifactId: 'art_question_job_bad' }],
      result: undefined,
    });
  });
});

describe('Curiosity revision API handler', () => {
  it('returns a validated candidate and never accepts arbitrary executable patches', async () => {
    const baseSpec = createValidCuriositySpec();
    const experienceSpec = createValidCuriosityExperienceSpecV2();
    const identity = {
      runId: 'run_revision_api_1',
      versionId: 'ver_moon_demo_2',
      createdAt: '2026-08-15T02:05:00.000Z',
      impactArtifactId: 'art_impact_api_1',
      patchArtifactId: 'art_patch_api_1',
      specArtifactId: 'art_spec_api_2',
      qualityArtifactId: 'art_quality_api_1',
      plannerAgentRunId: 'agent_run_revision_api_1',
      qualityAgentRunId: 'agent_run_quality_api_1',
    };
    const quality = {
      checks: [
        'age-fit',
        'interest-link',
        'knowledge-consistency',
        'misconception-risk',
        'interaction-completeness',
        'transfer-validity',
        'copy-load',
      ].map((criterion) => ({ criterion, status: 'pass', findings: [] })),
      verdict: 'pass',
    };
    const valid = createCuriosityRevisionPostHandler({
      resolveRoleModel: async (_request, _body, role) => ({
        route: { providerId: 'test', modelId: role },
        complete: async ({ prompt }) => {
          if (role === 'curiosity.quality-reviewer') return JSON.stringify(quality);
          if (prompt.includes('"phase":"impact"'))
            return JSON.stringify({
              baseVersionId: baseSpec.versionId,
              summary: '将表达调整为适合十岁。',
              changedFields: ['profile.age'],
              preservedFields: ['knowledge.packId', 'knowledge.packVersion'],
              knowledgeFamily: 'relative-motion',
            });
          return JSON.stringify({ operations: [{ op: 'set_age', age: 10 }] });
        },
      }),
      identityFactory: () => identity,
    });
    const ok = await valid(
      request('http://localhost/api/curiosity/experiences/cur_moon_demo/revisions', {
        baseSpec,
        experienceSpec,
        sourceArtifacts: [experienceSpec],
        instruction: '改成适合 10 岁',
      }),
      { params: Promise.resolve({ experienceId: 'cur_moon_demo' }) },
    );
    expect(await ok.json()).toMatchObject({
      success: true,
      candidateReady: true,
      spec: { profile: { age: 10 }, versionId: 'ver_moon_demo_2' },
      experienceSpec: { profile: { age: 10 }, versionId: 'ver_moon_demo_2' },
      impact: { changedFields: ['profile.age'] },
    });

    const invalid = createCuriosityRevisionPostHandler({
      resolveRoleModel: async (_request, _body, role) => ({
        route: { providerId: 'test', modelId: role },
        complete: async ({ prompt }) => {
          if (role === 'curiosity.quality-reviewer') return JSON.stringify(quality);
          if (prompt.includes('"phase":"impact"'))
            return JSON.stringify({
              baseVersionId: baseSpec.versionId,
              summary: '尝试替换页面。',
              changedFields: ['presentation.instructions'],
              preservedFields: ['knowledge.packId', 'knowledge.packVersion'],
              knowledgeFamily: 'relative-motion',
            });
          return JSON.stringify({
            operations: [{ op: 'replace', path: '/html', value: '<script />' }],
          });
        },
      }),
      identityFactory: () => ({ ...identity, versionId: 'ver_moon_demo_3' }),
    });
    const failed = await invalid(
      request('http://localhost/api/curiosity/experiences/cur_moon_demo/revisions', {
        baseSpec,
        experienceSpec,
        sourceArtifacts: [experienceSpec],
        instruction: '替换 HTML',
      }),
      { params: Promise.resolve({ experienceId: 'cur_moon_demo' }) },
    );
    expect(failed.status).toBe(422);
    expect(await failed.json()).toMatchObject({ errorCode: 'REVISION_PATCH_INVALID' });
    expect(baseSpec.versionId).toBe('ver_moon_demo_1');
  });
});
