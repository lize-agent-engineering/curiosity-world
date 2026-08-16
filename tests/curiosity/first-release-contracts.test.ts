import { describe, expect, it } from 'vitest';

import { knowledgeDesignArtifactV1Schema } from '@/lib/curiosity/agent-contracts';
import { curiosityPresentationArtifactSchema } from '@/lib/curiosity/agent-pipeline';

const envelope = {
  artifactId: 'art_open_knowledge',
  runId: 'run_open_knowledge',
  agentRole: 'curiosity.knowledge-designer' as const,
  schemaVersion: '1.0' as const,
  createdAt: '2026-08-17T00:00:00.000Z',
  upstreamArtifactIds: ['art_question_open'],
  knowledgePackVersion: 'generated-1',
};

function openKnowledge() {
  return {
    ...envelope,
    source: 'open',
    knowledgeFamily: 'open',
    packId: 'open.art_open_knowledge',
    objectives: ['观察水在不同温度下的变化'],
    causalRelations: [
      { cause: '温度升高', relation: '让水分子运动更快', effect: '水更容易变成水蒸气' },
    ],
    claims: [{ id: 'claim_evaporation', statement: '液态水可以从表面变成水蒸气。' }],
    relations: [
      {
        id: 'relation_temperature_evaporation',
        fromClaimId: 'claim_evaporation',
        relation: 'supports',
        toClaimId: 'claim_evaporation',
      },
    ],
    prerequisites: ['知道液体和气体不同'],
    allowedVocabulary: ['水蒸气', '温度', '蒸发'],
    allowedExplanations: ['水可以从表面慢慢变成看不见的水蒸气。'],
    forbiddenExplanations: ['水凭空消失了'],
    misconceptions: ['只有沸腾时水才会变成水蒸气'],
    uncertainties: ['蒸发速度还会受湿度和空气流动影响'],
    timeSensitive: false,
    ageExpressionStrategy: '用晾干的水迹来解释。',
    observationSuggestions: ['比较两滴水在温暖和阴凉处的变化。'],
    packReferences: ['generated:open.art_open_knowledge'],
  };
}

describe('first-release knowledge and presentation contracts', () => {
  it('accepts a fully bounded open knowledge artifact', () => {
    expect(knowledgeDesignArtifactV1Schema.parse(openKnowledge())).toMatchObject({
      source: 'open',
      knowledgeFamily: 'open',
      timeSensitive: false,
    });
  });

  it.each(['claims', 'relations', 'allowedExplanations', 'uncertainties', 'timeSensitive'])(
    'requires open knowledge field %s',
    (field) => {
      const candidate = openKnowledge() as Record<string, unknown>;
      delete candidate[field];
      expect(knowledgeDesignArtifactV1Schema.safeParse(candidate).success).toBe(false);
    },
  );

  it('rejects executable or web-code content in model-authored knowledge', () => {
    const candidate = openKnowledge();
    candidate.claims[0]!.statement = '<script>window.run()</script>';
    expect(knowledgeDesignArtifactV1Schema.safeParse(candidate).success).toBe(false);
  });

  it('accepts a reviewed narration library, immediate feedback, and at most three skippable cards', () => {
    const parsed = curiosityPresentationArtifactSchema.parse({
      artifactId: 'art_presentation_open',
      runId: 'run_open_knowledge',
      agentRole: 'curiosity.presentation-designer',
      schemaVersion: '3.0',
      createdAt: '2026-08-17T00:00:00.000Z',
      upstreamArtifactIds: ['art_question_open', 'art_open_knowledge', 'art_scene_open'],
      knowledgePackVersion: 'generated-1',
      sourceArtifactIds: {
        questionModel: 'art_question_open',
        knowledgeDesign: 'art_open_knowledge',
        sceneDesign: 'art_scene_open',
      },
      narrationLibrary: [
        {
          id: 'narration_start',
          eventType: 'exploration_started',
          action: '*',
          text: '先看看两滴水有什么不同。',
        },
        {
          id: 'narration_warmer',
          eventType: 'control_changed',
          action: 'set-warmer',
          text: '温暖的一边变化得更快。',
        },
      ],
      discoveryPrompts: [
        { id: 'card_surface', prompt: '水只会在烧开时变成水蒸气吗？', skippable: true },
      ],
      limitations: ['这里只比较表面水迹的变化。'],
    });

    expect(parsed.discoveryPrompts).toHaveLength(1);
    expect(parsed.discoveryPrompts[0]?.skippable).toBe(true);
  });

  it('rejects a fourth discovery card', () => {
    const base = {
      artifactId: 'art_presentation_open',
      runId: 'run_open_knowledge',
      agentRole: 'curiosity.presentation-designer',
      schemaVersion: '3.0',
      createdAt: '2026-08-17T00:00:00.000Z',
      upstreamArtifactIds: ['art_question_open', 'art_open_knowledge', 'art_scene_open'],
      knowledgePackVersion: 'generated-1',
      sourceArtifactIds: {
        questionModel: 'art_question_open',
        knowledgeDesign: 'art_open_knowledge',
        sceneDesign: 'art_scene_open',
      },
      narrationLibrary: [
        {
          id: 'narration_start',
          eventType: 'exploration_started',
          action: '*',
          text: '开始观察。',
        },
        { id: 'narration_end', eventType: 'exploration_ended', action: '*', text: '探索结束。' },
      ],
      discoveryPrompts: Array.from({ length: 4 }, (_, index) => ({
        id: `card_${index}`,
        prompt: `发现问题 ${index}`,
        skippable: true,
      })),
      limitations: ['这里只比较表面水迹的变化。'],
    };

    expect(curiosityPresentationArtifactSchema.safeParse(base).success).toBe(false);
  });
});
