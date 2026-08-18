import { describe, expect, it } from 'vitest';

import {
  evaluateStudioSpike,
  STUDIO_SPIKE_CASES,
  STUDIO_SPIKE_GATE,
  type StudioSpikeRun,
} from '@/lib/studio/spike';

const run = (overrides: Partial<StudioSpikeRun>): StudioSpikeRun => ({
  caseId: 'tool-pomodoro',
  coderModel: 'openrouter:z-ai/glm-5.2',
  step: 'create',
  ok: true,
  durationMs: 60_000,
  codeAttempts: 1,
  narrates: true,
  ...overrides,
});

describe('the sample matrix', () => {
  it('asks real child questions across domains, not app requests', () => {
    expect(STUDIO_SPIKE_CASES.length).toBeGreaterThanOrEqual(6);
    for (const sample of STUDIO_SPIKE_CASES) {
      expect(sample.create).toMatch(/[？?]$/);
      expect(sample.patch.length).toBeGreaterThan(4);
    }
  });

  it('spans the supported ages, because the same question is a different brief', () => {
    const ages = STUDIO_SPIKE_CASES.map((sample) => sample.targetAge);
    expect(Math.min(...ages)).toBeLessThanOrEqual(6);
    expect(Math.max(...ages)).toBeGreaterThanOrEqual(10);
    expect(new Set(ages).size).toBeGreaterThanOrEqual(4);
  });

  it('goes beyond what the three hand-built scenes could render', () => {
    const questions = STUDIO_SPIKE_CASES.map((sample) => sample.create).join('');
    // Biology and chemistry had no scene renderer in the first pipeline.
    expect(questions).toContain('毛毛虫');
    expect(questions).toContain('海水');
  });
});

describe('evaluateStudioSpike', () => {
  const creates = (ok: number, total: number, model = 'a') =>
    Array.from({ length: total }, (_, index) =>
      run({ coderModel: model, ok: index < ok, codeAttempts: 1, narrates: true }),
    );
  const patches = (hits: number, total: number, model = 'a') =>
    Array.from({ length: total }, (_, index) =>
      run({
        coderModel: model,
        step: 'patch',
        ok: true,
        editMode: index < hits ? 'patch' : 'rewrite',
      }),
    );

  it('passes a model that clears every threshold', () => {
    const [report] = evaluateStudioSpike([...creates(10, 10), ...patches(8, 10)]);
    expect(report!.verdict).toBe('GO');
    expect(report!.failedCriteria).toEqual([]);
  });

  it('fails a model whose first-attempt rate is too low', () => {
    const [report] = evaluateStudioSpike([...creates(7, 10), ...patches(8, 10)]);
    expect(report!.verdict).toBe('NO-GO');
    expect(report!.failedCriteria[0]).toContain('firstAttemptRate');
  });

  it('counts a rewrite as a passing patch but not as a hit', () => {
    const [report] = evaluateStudioSpike([...creates(10, 10), ...patches(5, 10)]);
    expect(report!.patchPassRate).toBe(1);
    expect(report!.patchHitRate).toBe(0.5);
    expect(report!.failedCriteria.some((line) => line.includes('patchHitRate'))).toBe(true);
  });

  it('does not credit a repaired document as a first-attempt pass', () => {
    const [report] = evaluateStudioSpike([
      ...creates(9, 9),
      run({ coderModel: 'a', ok: true, codeAttempts: 2 }),
      ...patches(8, 10),
    ]);
    expect(report!.createPassRate).toBe(1);
    expect(report!.firstAttemptRate).toBe(0.9);
  });

  it('fails a model that is too slow even when everything else passes', () => {
    const slow = Array.from({ length: 10 }, () =>
      run({ durationMs: STUDIO_SPIKE_GATE.maxCreateP95Ms + 1_000 }),
    );
    const [report] = evaluateStudioSpike([...slow, ...patches(8, 10)]);
    expect(report!.failedCriteria.some((line) => line.includes('createP95Ms'))).toBe(true);
  });

  it('reports each candidate model separately', () => {
    const reports = evaluateStudioSpike([
      ...creates(10, 10, 'a'),
      ...patches(8, 10, 'a'),
      ...creates(4, 10, 'b'),
      ...patches(2, 10, 'b'),
    ]);
    expect(reports).toHaveLength(2);
    expect(reports.find((report) => report.coderModel === 'a')!.verdict).toBe('GO');
    expect(reports.find((report) => report.coderModel === 'b')!.verdict).toBe('NO-GO');
  });
});

describe('the narration criterion', () => {
  const run = (overrides: Partial<StudioSpikeRun>): StudioSpikeRun => ({
    caseId: 'moon-follows',
    coderModel: 'a',
    step: 'create',
    ok: true,
    durationMs: 60_000,
    codeAttempts: 1,
    narrates: true,
    ...overrides,
  });
  const patches = (total: number) =>
    Array.from({ length: total }, () =>
      run({ step: 'patch', editMode: 'patch' as const, narrates: true }),
    );

  it('fails a model whose pages a child cannot hear', () => {
    const creates = Array.from({ length: 10 }, (_, index) => run({ narrates: index < 5 }));
    const [report] = evaluateStudioSpike([...creates, ...patches(10)]);
    expect(report!.narrationRate).toBe(0.5);
    expect(report!.failedCriteria.some((line) => line.includes('narrationRate'))).toBe(true);
  });

  it('passes when nearly every page speaks', () => {
    const creates = Array.from({ length: 10 }, (_, index) => run({ narrates: index < 9 }));
    const [report] = evaluateStudioSpike([...creates, ...patches(10)]);
    expect(report!.verdict).toBe('GO');
  });
});
