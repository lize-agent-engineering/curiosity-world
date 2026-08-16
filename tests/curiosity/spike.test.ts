import { describe, expect, it } from 'vitest';

import {
  collectSuccessfulCuriosityRuns,
  evaluateCuriositySpikeReport,
  evaluateCuriosityWebGate,
  selectCuriosityLiveFamilies,
  type CuriosityWebLiveRun,
} from '@/lib/curiosity/spike';

const passingEngineeringEvidence = [
  { command: 'pnpm check', exitCode: 0 },
  { command: 'pnpm lint', exitCode: 0 },
];

function completeLiveRuns(): CuriosityWebLiveRun[] {
  const families = ['relative-motion', 'balance-support', 'light-path'] as const;
  const kinds = ['generation', 'revision', 'rejection'] as const;
  return families.flatMap((family) =>
    kinds.flatMap((kind) =>
      Array.from({ length: 5 }, (_, index) => ({
        family,
        kind,
        run: index + 1,
        modelRoute: 'openai:gpt-live',
        durationMs: 900,
        artifactHash: kind === 'rejection' ? undefined : `${family}-${kind}-${index}`,
        deterministicChecks: ['schema', 'family-boundary'],
        eventIds: kind === 'generation' ? [`event-${family}-${index}`] : [],
        failureCode: kind === 'rejection' ? 'UNSUPPORTED_OR_UNSAFE_QUESTION' : undefined,
      })),
    ),
  );
}

describe('real-model spike gate', () => {
  it('collects complete live samples across bounded request-level retries', async () => {
    let attempts = 0;
    const failures: string[] = [];
    const runs = await collectSuccessfulCuriosityRuns(
      2,
      4,
      async (run) => {
        attempts += 1;
        if (attempts <= 2) throw new Error(`transient-${attempts}`);
        return `run-${run}`;
      },
      (error) => failures.push(error instanceof Error ? error.message : String(error)),
    );

    expect(runs).toEqual(['run-1', 'run-2']);
    expect(attempts).toBe(4);
    expect(failures).toEqual(['transient-1', 'transient-2']);
    await expect(
      collectSuccessfulCuriosityRuns(1, 2, async () => {
        throw new Error('always-fails');
      }),
    ).rejects.toThrow('LIVE_ATTEMPT_LIMIT_EXCEEDED');
  });

  it('selects one diagnostic family without changing the full release gate default', () => {
    expect(selectCuriosityLiveFamilies(undefined)).toEqual([
      'relative-motion',
      'balance-support',
      'light-path',
    ]);
    expect(selectCuriosityLiveFamilies('balance-support')).toEqual(['balance-support']);
    expect(() => selectCuriosityLiveFamilies('unknown')).toThrow('INVALID_SPIKE_FAMILY');
  });

  it('keeps live status pending when no real-model evidence is supplied', () => {
    expect(
      evaluateCuriosityWebGate({ engineering: passingEngineeringEvidence, liveRuns: [] }),
    ).toMatchObject({ engineeringStatus: 'PASS', liveModelStatus: 'LIVE_MODEL_PENDING' });
    expect(
      evaluateCuriosityWebGate({
        engineering: [{ command: 'pnpm test', exitCode: 1 }],
        liveRuns: [],
      }),
    ).toMatchObject({
      engineeringStatus: 'FAIL',
      liveModelStatus: 'LIVE_MODEL_PENDING',
      failureCode: 'ENGINEERING_GATE_FAILED',
    });
  });

  it('requires 5 generations, 5 revisions and 5 boundary rejections for every preset', () => {
    const incomplete = completeLiveRuns().slice(0, -1);
    expect(
      evaluateCuriosityWebGate({ engineering: passingEngineeringEvidence, liveRuns: incomplete }),
    ).toMatchObject({
      engineeringStatus: 'PASS',
      liveModelStatus: 'FAIL',
      failureCode: 'INSUFFICIENT_LIVE_EVIDENCE',
    });
    expect(
      evaluateCuriosityWebGate({
        engineering: passingEngineeringEvidence,
        liveRuns: completeLiveRuns(),
      }),
    ).toMatchObject({ engineeringStatus: 'PASS', liveModelStatus: 'PASS' });
    expect(
      evaluateCuriosityWebGate({
        engineering: passingEngineeringEvidence,
        liveRuns: completeLiveRuns().filter((run) => run.family === 'balance-support'),
        requiredFamilies: ['balance-support'],
      }),
    ).toMatchObject({
      engineeringStatus: 'PASS',
      liveModelStatus: 'PASS',
      requiredFamilies: ['balance-support'],
    });
  });

  it('requires five playable generations, five valid revisions, five explicit rejections, and timing limits', () => {
    const passing = evaluateCuriositySpikeReport({
      generations: Array.from({ length: 5 }, (_, index) => ({
        run: index + 1,
        feedbackMs: 80,
        playableMs: 2_000,
        playable: true,
        specHash: `hash-${index}`,
        eventTypes: ['experiment_started'],
      })),
      revisions: Array.from({ length: 5 }, (_, index) => ({
        run: index + 1,
        elapsedMs: 1_000,
        valid: true,
        preservedRules: true,
        specHash: `revision-${index}`,
      })),
      rejections: Array.from({ length: 5 }, (_, index) => ({
        run: index + 1,
        errorCode: `REJECTED_${index}`,
        explicit: true,
      })),
    });
    expect(passing.status).toBe('PASS');

    const tooSlow = evaluateCuriositySpikeReport({
      ...passing.runs,
      generations: passing.runs.generations.map((run, index) =>
        index === 0 ? { ...run, feedbackMs: 1_001 } : run,
      ),
    });
    expect(tooSlow.status).toBe('VERIFICATION_FAILED');
  });
});
