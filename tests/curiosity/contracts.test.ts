import { describe, expect, it } from 'vitest';

import {
  CURIOUSITY_EVENT_TYPES,
  curiosityEventSchema,
  curiosityExperienceSpecSchema,
  curiosityPatchSchema,
  type CuriosityExperienceSpecV1,
} from '@/lib/curiosity/contracts';
import {
  CuriosityDomainError,
  classifyCuriosityRequest,
  validateKnowledgeBoundaries,
} from '@/lib/curiosity/knowledge';
import { applyCuriosityPatch } from '@/lib/curiosity/revisions';

function validSpec(): CuriosityExperienceSpecV1 {
  return {
    schemaVersion: '1.0',
    experienceId: 'cur_moon_demo',
    versionId: 'ver_moon_demo_1',
    revision: 1,
    createdAt: '2026-08-15T00:00:00.000Z',
    profile: { age: 8, interests: ['散步'] },
    question: {
      original: '为什么月亮看起来会跟着我们？',
      coreQuestion: '为什么移动时月亮的位置看起来几乎不变？',
    },
    knowledge: {
      family: 'relative-motion',
      packId: 'relative-motion.moon-following.v1',
    },
    presentation: {
      title: '月亮真的在跟着我吗？',
      hook: '先猜猜：路灯、远山和月亮，谁在视野里移动得最明显？',
      explorePrompt: '拖动小朋友，观察三种物体在视野中的变化。',
      challengePrompt: '把物体放得更远，它在视野中的变化会怎样？',
      completion: '你发现了：距离越远，观察方向的变化通常越小。',
    },
    simulation: {
      preset: 'moon-parallax-v1',
      observerTravel: 80,
      nearObjectDistance: 20,
      farObjectDistance: 400,
    },
    tasks: [
      {
        id: 'prediction',
        kind: 'prediction',
        prompt: '你觉得谁移动得最明显？',
        options: [
          { id: 'near-lamp', label: '近处路灯' },
          { id: 'far-mountain', label: '远处山峰' },
          { id: 'moon', label: '月亮' },
        ],
        expectedOptionId: 'near-lamp',
      },
      {
        id: 'exploration',
        kind: 'exploration',
        prompt: '移动观察者并比较视角变化。',
        variable: 'observer-position',
      },
      {
        id: 'challenge',
        kind: 'challenge',
        prompt: '哪个距离会让物体看起来移动得更少？',
        options: [
          { id: 'nearer', label: '更近' },
          { id: 'farther', label: '更远' },
        ],
        expectedOptionId: 'farther',
      },
      {
        id: 'explanation',
        kind: 'explanation',
        prompt: '选择最合理的解释。',
        options: [
          { id: 'small-angle-change', label: '月亮很远，观察方向变化很小' },
          { id: 'moon-follows', label: '月亮真的在追着我们移动' },
        ],
        expectedOptionId: 'small-angle-change',
      },
    ],
    eventRequirements: [...CURIOUSITY_EVENT_TYPES],
  };
}

describe('Curiosity request boundary', () => {
  it.each([
    '为什么月亮看起来会跟着我们？',
    '散步的时候，月亮为什么一直跟着我？',
    'Why does the moon look like it follows me?',
  ])('maps a supported moon-following question to the only knowledge pack', (question) => {
    expect(classifyCuriosityRequest({ question, age: 8 })).toEqual({
      kind: 'curated',
      family: 'relative-motion',
      packId: 'relative-motion.moon-following.v1',
    });
  });

  it('rejects ages outside 6–10', () => {
    expect(() => classifyCuriosityRequest({ question: '月亮为什么跟着我？', age: 5 })).toThrowError(
      expect.objectContaining({ code: 'AGE_OUT_OF_RANGE' }),
    );
  });

  it('routes a different mechanism to open knowledge', () => {
    expect(classifyCuriosityRequest({ question: '彩虹为什么会出现？', age: 8 })).toEqual({
      kind: 'open',
      matchedFamilies: [],
    });
  });

  it('rejects high-risk content before knowledge mapping', () => {
    try {
      classifyCuriosityRequest({ question: '怎样用炸弹伤害别人？', age: 8 });
      throw new Error('expected classifyCuriosityRequest to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(CuriosityDomainError);
      expect((error as CuriosityDomainError).code).toBe('UNSAFE_CONTENT');
    }
  });
});

describe('CuriosityExperienceSpecV1', () => {
  it('accepts the complete bounded moon specification', () => {
    expect(curiosityExperienceSpecSchema.parse(validSpec())).toEqual(validSpec());
  });

  it('rejects unknown fields', () => {
    expect(() =>
      curiosityExperienceSpecSchema.parse({ ...validSpec(), arbitraryHtml: '<script />' }),
    ).toThrow();
  });

  it('requires every task and the complete event protocol', () => {
    const spec = validSpec();
    spec.tasks = spec.tasks.filter((task) => task.kind !== 'challenge');
    spec.eventRequirements = ['experiment_started'];

    expect(() => curiosityExperienceSpecSchema.parse(spec)).toThrow();
  });

  it('rejects an explanation that crosses the knowledge boundary', () => {
    const spec = validSpec();
    spec.presentation.completion = '月亮真的在跟着你走。';

    expect(() => validateKnowledgeBoundaries(spec)).toThrowError(
      expect.objectContaining({ code: 'KNOWLEDGE_VIOLATION' }),
    );
  });
});

describe('CuriosityPatchV1', () => {
  it('accepts allow-listed revision operations', () => {
    expect(
      curiosityPatchSchema.parse({
        schemaVersion: '1.0',
        baseVersionId: 'ver_moon_demo_1',
        operations: [
          { op: 'set_age', age: 6 },
          {
            op: 'set_tabletop_experiment',
            experiment: {
              title: '手指和远处路灯',
              steps: ['举起一根手指', '左右移动头部并比较远近变化'],
            },
          },
        ],
      }),
    ).toBeTruthy();
  });

  it('rejects arbitrary paths and executable content', () => {
    expect(() =>
      curiosityPatchSchema.parse({
        schemaVersion: '1.0',
        baseVersionId: 'ver_moon_demo_1',
        operations: [{ op: 'replace', path: '/html', value: '<script>alert(1)</script>' }],
      }),
    ).toThrow();
  });

  it('creates an immutable validated revision', () => {
    const base = validSpec();
    const revised = applyCuriosityPatch(
      base,
      {
        schemaVersion: '1.0',
        baseVersionId: base.versionId,
        operations: [
          { op: 'set_age', age: 6 },
          {
            op: 'replace_copy',
            field: 'completion',
            value: '远处的月亮看起来变化很小。',
          },
        ],
      },
      { versionId: 'ver_moon_demo_2', createdAt: '2026-08-15T00:05:00.000Z' },
    );

    expect(revised.versionId).toBe('ver_moon_demo_2');
    expect(revised.revision).toBe(2);
    expect(revised.profile.age).toBe(6);
    expect(base.profile.age).toBe(8);
    expect(base.presentation.completion).not.toBe(revised.presentation.completion);
  });

  it('rejects a stale base and an out-of-range parameter without changing the base', () => {
    const base = validSpec();
    expect(() =>
      applyCuriosityPatch(
        base,
        {
          schemaVersion: '1.0',
          baseVersionId: 'ver_stale',
          operations: [{ op: 'set_parameter', field: 'observerTravel', value: 500 }],
        },
        { versionId: 'ver_moon_demo_2', createdAt: '2026-08-15T00:05:00.000Z' },
      ),
    ).toThrowError(expect.objectContaining({ code: 'STALE_BASE_VERSION' }));
    expect(base.simulation.observerTravel).toBe(80);
  });
});

describe('CuriosityEventV1', () => {
  it('accepts a traceable event envelope and rejects unknown event types', () => {
    const event = {
      source: 'curiosity-world',
      protocolVersion: '1.0',
      eventId: 'evt_1',
      experienceId: 'cur_moon_demo',
      versionId: 'ver_moon_demo_1',
      type: 'variable_changed',
      taskId: 'exploration',
      action: 'observer_moved',
      occurredAt: '2026-08-15T00:00:05.000Z',
      payload: { position: 32 },
    };

    expect(curiosityEventSchema.parse(event)).toEqual(event);
    expect(() => curiosityEventSchema.parse({ ...event, type: 'mastery_inferred' })).toThrow();
  });
});
