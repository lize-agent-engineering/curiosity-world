import { describe, expect, it } from 'vitest';

import { CuriosityGuidanceError, runCuriosityGuidanceTurn } from '@/lib/curiosity/guidance-service';
import { createCuriosityGuidancePostHandler } from '@/app/api/curiosity/guidance/route';
import { CuriosityModelUnavailableError } from '@/lib/curiosity/api-handlers';
import type { CuriosityPipelineModel } from '@/lib/curiosity/agent-pipeline';
import type {
  GuidanceTurnRequestV1,
  KnowledgeDesignArtifactV1,
  StoryDesignArtifactV1,
} from '@/lib/curiosity/agent-contracts';

const story: StoryDesignArtifactV1 = {
  artifactId: 'art_story_1',
  runId: 'run_generation_1',
  agentRole: 'curiosity.story-designer',
  schemaVersion: '1.0',
  createdAt: '2026-08-15T08:00:00.000Z',
  upstreamArtifactIds: ['art_question_1', 'art_knowledge_1', 'art_interaction_1'],
  knowledgePackVersion: '1.0.0',
  sourceArtifactIds: {
    questionModel: 'art_question_1',
    knowledgeDesign: 'art_knowledge_1',
    interactionDesign: 'art_interaction_1',
  },
  stages: [
    {
      id: 'predict',
      kind: 'prediction',
      openingNarration: '先猜一猜。',
      prompt: '谁变化得快？',
      allowedEventTypes: ['prediction_submitted'],
      hints: [
        { level: 0, text: '看看远近。', revealsAnswer: false },
        { level: 1, text: '比较路灯和月亮。', revealsAnswer: false },
        { level: 2, text: '先选一个再验证。', revealsAnswer: false },
      ],
      completionCondition: '提交预测',
    },
    {
      id: 'explore',
      kind: 'exploration',
      openingNarration: '移动看看。',
      prompt: '拖动小朋友。',
      allowedEventTypes: ['variable_changed'],
      hints: [
        { level: 0, text: '找到滑杆。', revealsAnswer: false },
        { level: 1, text: '移动滑杆。', revealsAnswer: false },
        { level: 2, text: '比较物体变化。', revealsAnswer: false },
      ],
      completionCondition: '改变变量',
    },
    {
      id: 'transfer',
      kind: 'transfer',
      openingNarration: '换个情境。',
      prompt: '远山呢？',
      allowedEventTypes: ['transfer_attempted'],
      hints: [
        { level: 0, text: '想想远处。', revealsAnswer: false },
        { level: 1, text: '比较车窗和远山。', revealsAnswer: false },
        { level: 2, text: '用刚才的现象。', revealsAnswer: false },
      ],
      completionCondition: '完成迁移',
    },
  ],
};

const knowledge: KnowledgeDesignArtifactV1 = {
  artifactId: 'art_knowledge_1',
  runId: 'run_generation_1',
  agentRole: 'curiosity.knowledge-designer',
  schemaVersion: '1.0',
  createdAt: '2026-08-15T08:00:00.000Z',
  upstreamArtifactIds: ['art_question_1'],
  knowledgePackVersion: '1.0.0',
  knowledgeFamily: 'relative-motion',
  packId: 'relative-motion.moon-following.v1',
  objectives: ['比较远近物体的视角变化'],
  causalRelations: [{ cause: '观察者移动', relation: '远处方向变化小', effect: '像在跟随' }],
  prerequisites: ['知道远近'],
  allowedVocabulary: ['远', '近', '观察方向', '路灯', '月亮'],
  forbiddenExplanations: ['月亮真的在追着观察者移动'],
  misconceptions: ['视角变化就是物体速度'],
  ageExpressionStrategy: '用路灯和月亮比较。',
  observationSuggestions: ['散步时观察路灯和月亮。'],
  packReferences: ['relative-motion.moon-following.v1#core'],
};

const request: GuidanceTurnRequestV1 = {
  schemaVersion: '1.0',
  experienceId: 'cur_moon_demo',
  versionId: 'ver_moon_demo_1',
  storyArtifactId: 'art_story_1',
  stageId: 'predict',
  recentEventIds: ['evt_prediction_1'],
  childInput: { kind: 'voice', transcript: '我猜路灯变化快' },
};

function model(output: unknown): CuriosityPipelineModel {
  return {
    route: { providerId: 'test', modelId: 'guide-json' },
    complete: async () => JSON.stringify(output),
  };
}

describe('Curiosity runtime guide', () => {
  it('gives the guide an explicit strict output schema', async () => {
    let systemPrompt = '';
    let userPrompt = '';
    const schemaAwareModel: CuriosityPipelineModel = {
      route: { providerId: 'test', modelId: 'guide-json' },
      async complete(input) {
        systemPrompt = input.system ?? '';
        userPrompt = input.prompt;
        return JSON.stringify({
          narration: '记住这个猜想，我们移动看看。',
          feedbackKind: 'observation',
          hintLevel: 0,
          advanceTo: 'explore',
        });
      },
    };

    await runCuriosityGuidanceTurn({ request, story, knowledge }, schemaAwareModel);

    expect(systemPrompt).toContain('JSON Schema');
    expect(systemPrompt).toContain('苏格拉底式引导');
    expect(systemPrompt).toContain('拒绝条件');
    expect(systemPrompt).toContain('"narration"');
    expect(systemPrompt).toContain('"additionalProperties":false');
    expect(userPrompt).toContain('"allowedAdvanceTo":["predict","explore"]');
  });

  it('returns only a validated one-stage response bound to the triggering event', async () => {
    await expect(
      runCuriosityGuidanceTurn(
        { request, story, knowledge },
        model({
          narration: '记住这个猜想，我们移动看看。',
          feedbackKind: 'observation',
          hintLevel: 0,
          advanceTo: 'explore',
        }),
      ),
    ).resolves.toEqual({
      schemaVersion: '1.0',
      experienceId: 'cur_moon_demo',
      versionId: 'ver_moon_demo_1',
      storyArtifactId: 'art_story_1',
      stageId: 'predict',
      triggeredByEventIds: ['evt_prediction_1'],
      narration: '记住这个猜想，我们移动看看。',
      feedbackKind: 'observation',
      hintLevel: 0,
      advanceTo: 'explore',
    });
  });

  it('retries one invalid guide response before returning a validated turn', async () => {
    let attempts = 0;
    const retryingModel: CuriosityPipelineModel = {
      route: { providerId: 'test', modelId: 'guide-json' },
      async complete() {
        attempts += 1;
        return JSON.stringify(
          attempts === 1
            ? { answer: '继续' }
            : {
                narration: '记住这个猜想，我们移动看看。',
                feedbackKind: 'observation',
                hintLevel: 0,
                advanceTo: 'explore',
              },
        );
      },
    };

    await expect(
      runCuriosityGuidanceTurn({ request, story, knowledge }, retryingModel),
    ).resolves.toMatchObject({
      advanceTo: 'explore',
    });
    expect(attempts).toBe(2);
  });

  it('deterministically advances an allowed runtime event to the next stage', async () => {
    const eventRequest: GuidanceTurnRequestV1 = {
      ...request,
      recentEventIds: ['evt_prediction_2'],
      childInput: { kind: 'event', eventId: 'evt_prediction_2' },
    };

    await expect(
      runCuriosityGuidanceTurn(
        { request: eventRequest, story, knowledge },
        model({
          narration: '再猜一次。',
          feedbackKind: 'prompt',
          hintLevel: 0,
          advanceTo: 'predict',
        }),
      ),
    ).resolves.toMatchObject({
      stageId: 'predict',
      narration: '再猜一次。',
      advanceTo: 'explore',
    });
  });

  it('deterministically keeps an allowed runtime event on the terminal stage', async () => {
    const eventRequest: GuidanceTurnRequestV1 = {
      ...request,
      stageId: 'transfer',
      recentEventIds: ['evt_transfer_1'],
      childInput: { kind: 'event', eventId: 'evt_transfer_1' },
    };

    await expect(
      runCuriosityGuidanceTurn(
        { request: eventRequest, story, knowledge },
        model({
          narration: '你完成了迁移挑战。',
          feedbackKind: 'encouragement',
          hintLevel: 0,
          advanceTo: 'finish',
        }),
      ),
    ).resolves.toMatchObject({
      stageId: 'transfer',
      narration: '你完成了迁移挑战。',
      advanceTo: 'transfer',
    });
  });

  it.each([
    ['invalid schema', { answer: '继续' }, 'GUIDANCE_MODEL_INVALID'],
    [
      'skipped stage',
      { narration: '跳过实验。', feedbackKind: 'prompt', hintLevel: 0, advanceTo: 'transfer' },
      'GUIDANCE_STAGE_CONFLICT',
    ],
    [
      'forbidden explanation',
      {
        narration: '月亮真的在追着观察者移动',
        feedbackKind: 'observation',
        hintLevel: 0,
        advanceTo: 'explore',
      },
      'GUIDANCE_KNOWLEDGE_VIOLATION',
    ],
  ])('fails fast for %s', async (_label, output, code) => {
    await expect(
      runCuriosityGuidanceTurn({ request, story, knowledge }, model(output)),
    ).rejects.toMatchObject({
      code,
    });
  });

  it('exposes the validated service through a strict POST route', async () => {
    const post = createCuriosityGuidancePostHandler({
      resolveModel: async () =>
        model({
          narration: '记住猜想，我们去验证。',
          feedbackKind: 'observation',
          hintLevel: 0,
          advanceTo: 'explore',
        }),
    });
    const response = await post(
      new Request('http://localhost/api/curiosity/guidance', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ request, story, knowledge }),
      }) as never,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      response: { advanceTo: 'explore' },
    });
  });

  it('names unavailable guide models without substituting narration', async () => {
    const error = new CuriosityGuidanceError('MODEL_UNAVAILABLE', '没有可用引导模型。');
    expect(error.code).toBe('MODEL_UNAVAILABLE');
    expect(error.message).toContain('没有可用引导模型');
  });

  it('returns MODEL_UNAVAILABLE when the configured runtime guide cannot resolve', async () => {
    const post = createCuriosityGuidancePostHandler({
      resolveModel: async () => {
        throw new CuriosityModelUnavailableError('没有可用引导模型。');
      },
    });
    const response = await post(
      new Request('http://localhost/api/curiosity/guidance', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ request, story, knowledge }),
      }) as never,
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      success: false,
      errorCode: 'MODEL_UNAVAILABLE',
      error: '没有可用引导模型。',
    });
  });
});
