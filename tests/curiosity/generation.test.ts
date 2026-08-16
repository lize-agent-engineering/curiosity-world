import { describe, expect, it, vi } from 'vitest';

import {
  CuriosityGenerationError,
  createCuriosityCandidate,
  createCuriosityRevisionCandidate,
  type CuriosityTextModel,
} from '@/lib/curiosity/generation';
import { createValidCuriositySpec } from './fixture';

function validAuthoringPayload() {
  const spec = createValidCuriositySpec();
  return {
    coreQuestion: spec.question.coreQuestion,
    presentation: spec.presentation,
    simulation: {
      observerTravel: spec.simulation.observerTravel,
      nearObjectDistance: spec.simulation.nearObjectDistance,
      farObjectDistance: spec.simulation.farObjectDistance,
    },
    taskCopy: {
      predictionPrompt: '你觉得谁移动得最明显？',
      challengePrompt: '哪个距离会让物体看起来移动得更少？',
      explanationPrompt: '选择最合理的解释。',
      nearLabel: '近处路灯',
      mountainLabel: '远处山峰',
      moonLabel: '月亮',
      nearerLabel: '更近',
      fartherLabel: '更远',
      correctExplanationLabel: '月亮很远，观察方向变化很小',
      misconceptionLabel: '月亮真的在追着我们移动',
    },
  };
}

function modelReturning(value: unknown): CuriosityTextModel {
  return { complete: vi.fn(async () => JSON.stringify(value)) };
}

describe('Curiosity candidate generation', () => {
  it('maps a valid model data response into a compiled bounded specification', async () => {
    const result = await createCuriosityCandidate(
      { question: '为什么月亮看起来会跟着我们？', age: 8, interests: ['散步'] },
      modelReturning(validAuthoringPayload()),
      {
        experienceId: 'cur_generated_1',
        versionId: 'ver_generated_1',
        createdAt: '2026-08-15T01:00:00.000Z',
      },
    );

    expect(result.spec.experienceId).toBe('cur_generated_1');
    expect(result.spec.knowledge.packId).toBe('relative-motion.moon-following.v1');
    expect(result.spec.eventRequirements).toHaveLength(7);
    expect(result.compiled.html).toContain('data-curiosity-runtime');
  });

  it('rejects unsupported input before calling the model', async () => {
    const model = modelReturning(validAuthoringPayload());

    await expect(
      createCuriosityCandidate({ question: '彩虹为什么会出现？', age: 8, interests: [] }, model, {
        experienceId: 'cur_generated_1',
        versionId: 'ver_generated_1',
        createdAt: '2026-08-15T01:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_QUESTION' });
    expect(model.complete).not.toHaveBeenCalled();
  });

  it.each(['not json', JSON.stringify({ arbitraryHtml: '<script />' })])(
    'fails invalid model output without a template fallback',
    async (response) => {
      const model = { complete: vi.fn(async () => response) };

      await expect(
        createCuriosityCandidate(
          { question: '月亮为什么一直跟着我？', age: 8, interests: [] },
          model,
          {
            experienceId: 'cur_generated_1',
            versionId: 'ver_generated_1',
            createdAt: '2026-08-15T01:00:00.000Z',
          },
        ),
      ).rejects.toBeInstanceOf(CuriosityGenerationError);
    },
  );
});

describe('Curiosity revision generation', () => {
  it('accepts only a validated patch and returns a compiled candidate revision', async () => {
    const base = createValidCuriositySpec();
    const model = modelReturning({
      schemaVersion: '1.0',
      baseVersionId: base.versionId,
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
    });

    const result = await createCuriosityRevisionCandidate(
      base,
      '改成适合 6 岁并加入桌上实验',
      model,
      {
        versionId: 'ver_moon_demo_2',
        createdAt: '2026-08-15T01:05:00.000Z',
      },
    );

    expect(result.spec.profile.age).toBe(6);
    expect(result.spec.tabletopExperiment?.title).toBe('手指和远处路灯');
    expect(result.spec.versionId).toBe('ver_moon_demo_2');
  });

  it('rejects an arbitrary HTML patch and leaves the base unchanged', async () => {
    const base = createValidCuriositySpec();
    const model = modelReturning({
      schemaVersion: '1.0',
      baseVersionId: base.versionId,
      operations: [{ op: 'replace', path: '/html', value: '<script />' }],
    });

    await expect(
      createCuriosityRevisionCandidate(base, '替换页面代码', model, {
        versionId: 'ver_moon_demo_2',
        createdAt: '2026-08-15T01:05:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_MODEL_OUTPUT' });
    expect(base.versionId).toBe('ver_moon_demo_1');
  });
});
