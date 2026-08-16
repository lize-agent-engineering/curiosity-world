import { describe, expect, it } from 'vitest';

import {
  applyGuidanceTurn,
  createGuidanceState,
  deriveGuidanceRequest,
  restoreGuidanceState,
  mapGuidanceTriggerEvent,
} from '@/lib/curiosity/guidance';
import type {
  GuidanceTurnResponseV1,
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

const bindings = {
  experienceId: 'cur_moon_demo',
  versionId: 'ver_moon_demo_1',
};

function response(overrides: Partial<GuidanceTurnResponseV1> = {}): GuidanceTurnResponseV1 {
  return {
    schemaVersion: '1.0',
    ...bindings,
    storyArtifactId: story.artifactId,
    stageId: 'predict',
    triggeredByEventIds: ['evt_prediction_1'],
    narration: '记住这个猜想，我们去验证。',
    feedbackKind: 'observation',
    hintLevel: 0,
    advanceTo: 'explore',
    ...overrides,
  };
}

describe('deterministic curiosity guidance state', () => {
  it('advances transfer guidance only after the challenge is actually completed', () => {
    expect(mapGuidanceTriggerEvent('transfer', 'challenge_attempted')).toBeNull();
    expect(mapGuidanceTriggerEvent('transfer', 'challenge_completed')).toBe('transfer_attempted');
    expect(mapGuidanceTriggerEvent('explanation', 'explanation_selected')).toBe(
      'explanation_selected',
    );
  });

  it('starts at the first story stage and derives a version-bound request', () => {
    const state = createGuidanceState(story);
    expect(state).toEqual({
      storyArtifactId: 'art_story_1',
      stageId: 'predict',
      hintLevel: 0,
      completedStageIds: [],
      lastTriggerEventIds: [],
    });
    expect(
      deriveGuidanceRequest(state, story, bindings, ['evt_prediction_1'], {
        kind: 'voice',
        transcript: '我猜路灯更快',
      }),
    ).toEqual({
      schemaVersion: '1.0',
      ...bindings,
      storyArtifactId: 'art_story_1',
      stageId: 'predict',
      recentEventIds: ['evt_prediction_1'],
      childInput: { kind: 'voice', transcript: '我猜路灯更快' },
    });
  });

  it('allows same-stage hints and exactly one forward stage', () => {
    const initial = createGuidanceState(story);
    const hinted = applyGuidanceTurn(
      initial,
      response({ feedbackKind: 'hint', hintLevel: 1, advanceTo: 'predict' }),
      story,
      bindings,
    );
    expect(hinted.stageId).toBe('predict');
    expect(hinted.hintLevel).toBe(1);

    const advanced = applyGuidanceTurn(hinted, response(), story, bindings);
    expect(advanced.stageId).toBe('explore');
    expect(advanced.completedStageIds).toEqual(['predict']);
    expect(advanced.hintLevel).toBe(0);
  });

  it.each([
    ['skipped stage', { advanceTo: 'transfer' }],
    ['unknown stage', { advanceTo: 'finish' }],
    ['wrong version', { versionId: 'ver_other_1' }],
    ['wrong story', { storyArtifactId: 'art_story_other' }],
  ])('rejects %s responses without changing state', (_label, overrides) => {
    const initial = createGuidanceState(story);
    expect(() => applyGuidanceTurn(initial, response(overrides), story, bindings)).toThrowError(
      /GUIDANCE_STAGE_CONFLICT/,
    );
    expect(initial.stageId).toBe('predict');
  });

  it('restores the first incomplete stage from validated event types', () => {
    expect(
      restoreGuidanceState(story, [
        { eventId: 'evt_1', type: 'prediction_submitted' },
        { eventId: 'evt_2', type: 'variable_changed' },
      ]),
    ).toMatchObject({
      stageId: 'transfer',
      completedStageIds: ['predict', 'explore'],
      lastTriggerEventIds: ['evt_1', 'evt_2'],
    });
  });
});
