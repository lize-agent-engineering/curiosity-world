export interface CuriositySpikeGenerationRun {
  run: number;
  feedbackMs: number;
  playableMs: number;
  playable: boolean;
  specHash: string;
  eventTypes: string[];
  errorCode?: string;
}

export interface CuriositySpikeRevisionRun {
  run: number;
  elapsedMs: number;
  valid: boolean;
  preservedRules: boolean;
  specHash: string;
  errorCode?: string;
}

export interface CuriositySpikeRejectionRun {
  run: number;
  errorCode: string;
  explicit: boolean;
}

export interface CuriositySpikeRuns {
  generations: CuriositySpikeGenerationRun[];
  revisions: CuriositySpikeRevisionRun[];
  rejections: CuriositySpikeRejectionRun[];
}

export interface CuriositySpikeReport {
  status: 'PASS' | 'VERIFICATION_FAILED';
  failures: string[];
  runs: CuriositySpikeRuns;
}

export const CURIOSITY_LIVE_FAMILIES = [
  'relative-motion',
  'balance-support',
  'light-path',
] as const;

export type CuriosityWebLiveFamily = (typeof CURIOSITY_LIVE_FAMILIES)[number];

export function selectCuriosityLiveFamilies(value: string | undefined): CuriosityWebLiveFamily[] {
  if (value === undefined) return [...CURIOSITY_LIVE_FAMILIES];
  if (!CURIOSITY_LIVE_FAMILIES.includes(value as CuriosityWebLiveFamily)) {
    throw new Error(`INVALID_SPIKE_FAMILY: ${value}`);
  }
  return [value as CuriosityWebLiveFamily];
}

export async function collectSuccessfulCuriosityRuns<T>(
  requiredRuns: number,
  maxAttempts: number,
  execute: (run: number, attempt: number) => Promise<T>,
  onFailure: (error: unknown, attempt: number) => void = () => undefined,
): Promise<T[]> {
  if (requiredRuns < 1 || maxAttempts < requiredRuns) {
    throw new Error('INVALID_LIVE_ATTEMPT_LIMIT');
  }
  const completed: T[] = [];
  for (let attempt = 1; attempt <= maxAttempts && completed.length < requiredRuns; attempt += 1) {
    try {
      completed.push(await execute(completed.length + 1, attempt));
    } catch (error) {
      onFailure(error, attempt);
    }
  }
  if (completed.length !== requiredRuns) {
    throw new Error(
      `LIVE_ATTEMPT_LIMIT_EXCEEDED: completed ${completed.length}/${requiredRuns} in ${maxAttempts} attempts`,
    );
  }
  return completed;
}

export type CuriosityWebLiveRunKind = 'generation' | 'revision' | 'rejection';

export interface CuriosityEngineeringEvidence {
  command: string;
  exitCode: number;
  timestamp?: string;
  testCount?: number;
}

export interface CuriosityWebLiveRun {
  family: CuriosityWebLiveFamily;
  kind: CuriosityWebLiveRunKind;
  run: number;
  modelRoute: string;
  durationMs: number;
  artifactHash?: string;
  deterministicChecks: string[];
  eventIds: string[];
  failureCode?: string;
}

export interface CuriosityWebGateReport {
  engineeringStatus: 'PASS' | 'FAIL';
  liveModelStatus: 'PASS' | 'FAIL' | 'LIVE_MODEL_PENDING';
  failureCode?: 'ENGINEERING_GATE_FAILED' | 'INSUFFICIENT_LIVE_EVIDENCE';
  engineering: CuriosityEngineeringEvidence[];
  liveRuns: CuriosityWebLiveRun[];
  requiredFamilies?: CuriosityWebLiveFamily[];
}

const liveKinds: CuriosityWebLiveRunKind[] = ['generation', 'revision', 'rejection'];

function hasCompleteLiveRun(run: CuriosityWebLiveRun): boolean {
  if (!run.modelRoute || run.durationMs < 0 || run.deterministicChecks.length === 0) return false;
  if (run.kind === 'rejection') return Boolean(run.failureCode);
  if (!run.artifactHash) return false;
  return run.kind !== 'generation' || run.eventIds.length > 0;
}

export function evaluateCuriosityWebGate(input: {
  engineering: CuriosityEngineeringEvidence[];
  liveRuns: CuriosityWebLiveRun[];
  requiredFamilies?: CuriosityWebLiveFamily[];
}): CuriosityWebGateReport {
  const engineeringStatus =
    input.engineering.length > 0 && input.engineering.every((evidence) => evidence.exitCode === 0)
      ? 'PASS'
      : 'FAIL';
  if (input.liveRuns.length === 0) {
    return {
      ...input,
      engineeringStatus,
      liveModelStatus: 'LIVE_MODEL_PENDING',
      ...(engineeringStatus === 'FAIL' ? { failureCode: 'ENGINEERING_GATE_FAILED' as const } : {}),
    };
  }
  const requiredFamilies = input.requiredFamilies ?? CURIOSITY_LIVE_FAMILIES;
  const complete = requiredFamilies.every((family) =>
    liveKinds.every(
      (kind) =>
        input.liveRuns.filter(
          (run) => run.family === family && run.kind === kind && hasCompleteLiveRun(run),
        ).length >= 5,
    ),
  );
  if (engineeringStatus === 'FAIL') {
    return {
      ...input,
      engineeringStatus,
      liveModelStatus: complete ? 'PASS' : 'FAIL',
      failureCode: 'ENGINEERING_GATE_FAILED',
    };
  }
  return complete
    ? { ...input, engineeringStatus, liveModelStatus: 'PASS' }
    : {
        ...input,
        engineeringStatus,
        liveModelStatus: 'FAIL',
        failureCode: 'INSUFFICIENT_LIVE_EVIDENCE',
      };
}

export function evaluateCuriositySpikeReport(runs: CuriositySpikeRuns): CuriositySpikeReport {
  const failures: string[] = [];
  if (runs.generations.length !== 5) failures.push('GENERATION_RUN_COUNT');
  if (runs.revisions.length !== 5) failures.push('REVISION_RUN_COUNT');
  if (runs.rejections.length !== 5) failures.push('REJECTION_RUN_COUNT');
  if (runs.generations.some((run) => !run.playable)) failures.push('GENERATION_NOT_PLAYABLE');
  if (runs.generations.some((run) => run.feedbackMs >= 1_000)) {
    failures.push('FEEDBACK_SLOWER_THAN_1S');
  }
  if (runs.generations.some((run) => run.playableMs >= 60_000)) {
    failures.push('PLAYABLE_SLOWER_THAN_60S');
  }
  if (runs.revisions.some((run) => !run.valid || !run.preservedRules)) {
    failures.push('REVISION_INVALID');
  }
  if (runs.rejections.some((run) => !run.explicit || !run.errorCode)) {
    failures.push('REJECTION_NOT_EXPLICIT');
  }
  return { status: failures.length === 0 ? 'PASS' : 'VERIFICATION_FAILED', failures, runs };
}
