import { describe, expect, it } from 'vitest';

import {
  STUDIO_MAX_AGE,
  STUDIO_MIN_AGE,
  parseStudioPlan,
  studioEducationPlannerOutputSchema,
  studioProjectSchema,
  studioTargetAgeSchema,
  studioVersionSchema,
} from '@/lib/studio/contracts';

const base = {
  appName: '月亮为什么跟着我',
  appKind: 'creative',
  summary: '让孩子比较远近物体的视角变化。',
  changeNote: '首次生成。',
  features: ['拖动小朋友走动', '比较路灯和月亮的方向变化'],
  layout: '上方是夜空场景，下方是控制条。',
  interactions: ['拖动观察者'],
  persistence: 'local-storage',
};

describe('education planner output', () => {
  it('requires the causal point the child should end up understanding', () => {
    const plan = studioEducationPlannerOutputSchema.parse({
      ...base,
      knowledgePoints: ['距离越远，观察方向变化越小'],
      misconceptions: ['月亮真的在追着我们跑'],
    });
    expect(plan.knowledgePoints).toHaveLength(1);
  });

  it('rejects an education plan with no knowledge point', () => {
    expect(() =>
      studioEducationPlannerOutputSchema.parse({
        ...base,
        knowledgePoints: [],
        misconceptions: [],
      }),
    ).toThrow();
  });

  it('keeps those fields optional on a stored plan so general mode still parses', () => {
    expect(parseStudioPlan(base).knowledgePoints).toBeUndefined();
    expect(parseStudioPlan({ ...base, knowledgePoints: ['a b'] }).knowledgePoints).toEqual(['a b']);
  });
});

describe('target age', () => {
  it('opens the range beyond the old pipeline 6–10 gate', () => {
    expect(STUDIO_MIN_AGE).toBeLessThan(6);
    expect(STUDIO_MAX_AGE).toBeGreaterThan(10);
    expect(studioTargetAgeSchema.parse(5)).toBe(5);
    expect(studioTargetAgeSchema.parse(12)).toBe(12);
  });

  it('still rejects an age outside the supported range', () => {
    expect(() => studioTargetAgeSchema.parse(2)).toThrow();
    expect(() => studioTargetAgeSchema.parse(30)).toThrow();
  });
});

describe('project mode', () => {
  const project = {
    id: 'prj_one',
    title: '月亮',
    createdAt: '2026-08-18T10:00:00.000Z',
    updatedAt: '2026-08-18T10:00:00.000Z',
    currentVersionId: null,
    storeVersion: 1,
  };

  it('records the education surface and the child age', () => {
    const parsed = studioProjectSchema.parse({ ...project, mode: 'education', targetAge: 8 });
    expect(parsed.mode).toBe('education');
    expect(parsed.targetAge).toBe(8);
  });

  it('defaults a project stored before the education surface to general', () => {
    expect(studioProjectSchema.parse(project).mode).toBe('general');
  });
});

describe('storing an education version', () => {
  const at = '2026-08-18T10:00:00.000Z';
  const educationPlan = {
    ...base,
    knowledgePoints: ['距离越远，观察方向变化越小'],
    misconceptions: ['月亮真的在追着我们跑'],
  };

  it('accepts a version whose plan carries the education-only fields', () => {
    const version = studioVersionSchema.parse({
      id: 'ver_one',
      projectId: 'prj_one',
      parentVersionId: null,
      revision: 1,
      html: '<!doctype html><html><body>x</body></html>',
      summary: '第一版',
      appKind: 'creative',
      editMode: 'create',
      jobId: 'job_one',
      runtimeErrors: [],
      createdAt: at,
      plan: educationPlan,
    });
    expect(version.plan!.knowledgePoints).toEqual(['距离越远，观察方向变化越小']);
  });

  it('still accepts a general-mode version whose plan has neither field', () => {
    expect(
      studioVersionSchema.parse({
        id: 'ver_one',
        projectId: 'prj_one',
        parentVersionId: null,
        revision: 1,
        html: '<html><body>x</body></html>',
        summary: '第一版',
        appKind: 'tool',
        editMode: 'create',
        jobId: 'job_one',
        runtimeErrors: [],
        createdAt: at,
        plan: base,
      }).plan!.misconceptions,
    ).toBeUndefined();
  });
});
