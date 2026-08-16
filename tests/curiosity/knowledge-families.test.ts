import { describe, expect, it } from 'vitest';

import { knowledgeDesignArtifactV1Schema } from '@/lib/curiosity/agent-contracts';
import { relativeMotionPlugin } from '@/lib/curiosity/knowledge/relative-motion';
import { knowledgeRegistry } from '@/lib/curiosity/knowledge/registry';

describe('deterministic knowledge-family registry', () => {
  it('allows an explicit negation of the moon-following misconception', () => {
    const artifact = knowledgeDesignArtifactV1Schema.parse({
      artifactId: 'art_knowledge_negation',
      runId: 'run_negation',
      agentRole: 'curiosity.knowledge-designer' as const,
      schemaVersion: '1.0' as const,
      createdAt: '2026-08-16T03:30:00.000Z',
      upstreamArtifactIds: ['art_question_negation'],
      knowledgePackVersion: '1.0.0',
      knowledgeFamily: 'relative-motion' as const,
      packId: 'relative-motion.moon-following.v1',
      objectives: ['说明这只是观察现象，不是月亮真的在跟着人移动。'],
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
      misconceptions: ['视角变化等于物体真实速度'],
      ageExpressionStrategy: '比较路灯和月亮。',
      observationSuggestions: ['散步时比较路灯和月亮。'],
      packReferences: ['relative-motion.moon-following.v1#core'],
    });

    expect(() => relativeMotionPlugin.validateKnowledge(artifact)).not.toThrow();
    expect(() =>
      relativeMotionPlugin.validateKnowledge({
        ...artifact,
        objectives: ['能识别“月亮真的在跟着我”是误解，并给出正确解释。'],
      }),
    ).not.toThrow();
    expect(() =>
      relativeMotionPlugin.validateKnowledge({
        ...artifact,
        objectives: ['能判断“月亮真的在跟着我走”是一种错觉。'],
      }),
    ).not.toThrow();
    expect(() =>
      relativeMotionPlugin.validateKnowledge({
        ...artifact,
        objectives: ['能区分“月亮真的跟着我”和“月亮看起来跟着我”这两种说法。'],
      }),
    ).not.toThrow();
    expect(() =>
      relativeMotionPlugin.validateKnowledge({
        ...artifact,
        objectives: ['理解“月亮看起来跟着走”不等于“月亮真的在跟着我走”。'],
      }),
    ).not.toThrow();
    expect(() =>
      relativeMotionPlugin.validateKnowledge({
        ...artifact,
        objectives: ['月亮真的在跟着人移动。'],
      }),
    ).toThrowError(expect.objectContaining({ code: 'KNOWLEDGE_VIOLATION' }));
  });

  it.each([
    ['月亮为什么跟着我？', 'relative-motion', 'relative-motion.moon-following.v1'],
    ['桥为什么不会倒？', 'balance-support', 'balance-support.bridge.v1'],
    ['影子为什么会变长？', 'light-path', 'light-path.shadow-length.v1'],
    ['为什么车窗旁边的树退得更快？', 'relative-motion', 'relative-motion.moon-following.v1'],
    ['坐车时远山为什么像没动？', 'relative-motion', 'relative-motion.moon-following.v1'],
    ['积木怎么搭才更稳？', 'balance-support', 'balance-support.bridge.v1'],
    ['手电筒靠近时影子为什么变大？', 'light-path', 'light-path.shadow-length.v1'],
  ])('maps %s to exactly one pack', (question, family, packId) => {
    expect(knowledgeRegistry.classify({ question, age: 8 })).toEqual({
      kind: 'curated',
      family,
      packId,
    });
  });

  it('routes multiple-family and unmatched questions to open knowledge', () => {
    expect(
      knowledgeRegistry.classify({ question: '桥为什么不倒，它的影子为什么会变长？', age: 8 }),
    ).toMatchObject({
      kind: 'open',
      matchedFamilies: ['balance-support', 'light-path'],
    });
    expect(knowledgeRegistry.classify({ question: '彩虹为什么有颜色？', age: 8 })).toEqual({
      kind: 'open',
      matchedFamilies: [],
    });
  });

  it('keeps family bounds declarative for migration and V3 scene validation', () => {
    expect(knowledgeRegistry.get('relative-motion').allowedVariables).toEqual({
      'observer-position': { min: -100, max: 100 },
      'object-distance': { min: 10, max: 600 },
    });
    expect(knowledgeRegistry.get('balance-support').allowedPrimitives).toContain('place-support');
    expect(knowledgeRegistry.get('light-path').allowedPrimitives).toContain('trace-light-path');
  });
});
