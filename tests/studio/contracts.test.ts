import { describe, expect, it } from 'vitest';

import {
  STUDIO_APP_KINDS,
  normalizeStudioAppKind,
  parseStudioPlan,
  studioPlannerOutputSchema,
  studioReviewSchema,
  studioSnapshotSchema,
} from '@/lib/studio/contracts';

const plan = {
  appName: '番茄钟',
  appKind: 'tool',
  summary: '一个可以专注 25 分钟的计时器。',
  changeNote: '首次生成番茄钟。',
  features: ['25 分钟倒计时', '开始与暂停', '完成次数统计'],
  layout: '居中单栏，计时器在上，控制按钮在下。',
  interactions: ['点击开始', '点击重置'],
  persistence: 'local-storage',
};

describe('appKind routing', () => {
  it('keeps every known kind', () => {
    for (const kind of STUDIO_APP_KINDS) expect(normalizeStudioAppKind(kind)).toBe(kind);
  });

  it('falls back to general instead of rejecting an unknown kind', () => {
    expect(normalizeStudioAppKind('roguelike')).toBe('general');
    expect(normalizeStudioAppKind(undefined)).toBe('general');
    expect(normalizeStudioAppKind(42)).toBe('general');
  });

  it('is case and whitespace tolerant', () => {
    expect(normalizeStudioAppKind(' Game ')).toBe('game');
  });
});

describe('parseStudioPlan', () => {
  it('accepts a well formed plan', () => {
    expect(parseStudioPlan(plan).appKind).toBe('tool');
  });

  it('never fails on classification alone', () => {
    expect(parseStudioPlan({ ...plan, appKind: '解谜' }).appKind).toBe('general');
  });

  it('still enforces the fields the coder depends on', () => {
    expect(() => parseStudioPlan({ ...plan, features: [] })).toThrow();
    expect(() => parseStudioPlan({ ...plan, appName: '' })).toThrow();
  });

  it('exposes a strict schema for structured model output', () => {
    expect(studioPlannerOutputSchema.parse(plan).appKind).toBe('tool');
    expect(() => studioPlannerOutputSchema.parse({ ...plan, extra: 1 })).toThrow();
  });
});

describe('studioReviewSchema', () => {
  it('accepts a pass verdict with no findings', () => {
    expect(studioReviewSchema.parse({ verdict: 'pass', findings: [] }).verdict).toBe('pass');
  });

  it('accepts a revise verdict with actionable findings', () => {
    const review = studioReviewSchema.parse({
      verdict: 'revise',
      findings: [{ severity: 'blocker', area: 'feature', detail: '完成次数没有实现。' }],
    });
    expect(review.findings).toHaveLength(1);
  });

  it('rejects an unknown verdict', () => {
    expect(() => studioReviewSchema.parse({ verdict: 'maybe', findings: [] })).toThrow();
  });
});

describe('studioSnapshotSchema', () => {
  const createdAt = '2026-08-18T10:00:00.000Z';
  const snapshot = {
    project: {
      id: 'prj_abc123',
      title: '番茄钟',
      createdAt,
      updatedAt: createdAt,
      currentVersionId: 'ver_abc123',
      storeVersion: 1,
    },
    versions: [
      {
        id: 'ver_abc123',
        projectId: 'prj_abc123',
        parentVersionId: null,
        revision: 1,
        html: '<!doctype html><html><body>x</body></html>',
        summary: '第一版番茄钟。',
        appKind: 'tool',
        editMode: 'create',
        jobId: 'job_abc123',
        runtimeErrors: [],
        createdAt,
      },
    ],
    messages: [
      { id: 'msg_abc123', projectId: 'prj_abc123', role: 'user', text: '做个番茄钟', createdAt },
    ],
  };

  it('accepts a complete snapshot', () => {
    expect(studioSnapshotSchema.parse(snapshot).versions[0]!.editMode).toBe('create');
  });

  it('rejects a version whose id does not match the id shape', () => {
    expect(() =>
      studioSnapshotSchema.parse({
        ...snapshot,
        versions: [{ ...snapshot.versions[0], id: 'nope' }],
      }),
    ).toThrow();
  });

  it('keeps runtime errors attached to the version that produced them', () => {
    const parsed = studioSnapshotSchema.parse({
      ...snapshot,
      versions: [
        {
          ...snapshot.versions[0],
          runtimeErrors: [
            { errorKind: 'error', message: 'x is not defined', occurredAt: createdAt },
          ],
        },
      ],
    });
    expect(parsed.versions[0]!.runtimeErrors[0]!.message).toBe('x is not defined');
  });
});
