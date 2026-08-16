import { describe, expect, it } from 'vitest';

import {
  CURIOSITY_LIVE_CASES,
  CURIOSITY_LIVE_RUNS_PER_CASE,
  CURIOSITY_LIVE_TIMEOUT_MS,
  evaluateCuriosityLiveGate,
  type CuriosityLiveRun,
} from '@/lib/curiosity/spike';

function completeRuns(): CuriosityLiveRun[] {
  return CURIOSITY_LIVE_CASES.flatMap((testCase) =>
    Array.from({ length: CURIOSITY_LIVE_RUNS_PER_CASE }, (_, index) => ({
      caseId: testCase.id,
      run: index + 1,
      terminal: testCase.expected,
      durationMs: 80_000,
      sceneOperable: testCase.expected === 'candidate_ready',
      regenerationPassed: testCase.expected === 'candidate_ready',
      recoveryPassed: testCase.expected === 'candidate_ready',
      qualityRetryCount: index === 0 ? 1 : 0,
    })),
  );
}

describe('Curiosity 60-run live gate', () => {
  it('defines 12 cross-domain cases and requires 5 runs each', () => {
    expect(CURIOSITY_LIVE_CASES).toHaveLength(12);
    expect(completeRuns()).toHaveLength(60);
    expect(new Set(CURIOSITY_LIVE_CASES.map((item) => item.id)).size).toBe(12);
  });

  it('passes only complete expected terminals with operable safe scenes', () => {
    expect(
      evaluateCuriosityLiveGate({
        engineering: [{ command: 'pnpm test', exitCode: 0 }],
        liveRuns: completeRuns(),
      }),
    ).toMatchObject({ engineeringStatus: 'PASS', liveModelStatus: 'PASS', failures: [] });
  });

  it('fails missing, slow, wrong-terminal and over-budget runs', () => {
    const runs = completeRuns();
    runs.pop();
    runs[0] = {
      ...runs[0],
      terminal: 'failed',
      durationMs: CURIOSITY_LIVE_TIMEOUT_MS + 1,
      qualityRetryCount: 2,
    };
    const result = evaluateCuriosityLiveGate({
      engineering: [{ command: 'pnpm test', exitCode: 0 }],
      liveRuns: runs,
    });
    expect(result.liveModelStatus).toBe('FAIL');
    expect(result.failures).toEqual(
      expect.arrayContaining([
        'curated-motion:TERMINAL',
        'curated-motion:TIMEOUT',
        'curated-motion:RETRY_BUDGET',
        'clarification:RUN_COUNT',
      ]),
    );
  });
});
