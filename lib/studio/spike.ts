/**
 * The sample matrix and gate criteria for the real-model spike.
 *
 * Kept in `lib/` rather than inside the script so the gate is a testable pure
 * function: the script gathers evidence, this decides whether it is good enough
 * to build a UI on top of.
 */

import type { StudioAppKind, StudioEditMode } from './contracts';

export interface StudioSpikeCase {
  id: string;
  /** The child's question, as a parent would type it. */
  create: string;
  targetAge: number;
  /** The follow-up a parent would actually ask for next. */
  patch: string;
}

/**
 * The matrix exercises the product's main flow: a child's question at a real
 * age, then the kind of change a parent asks for next. The questions
 * deliberately span domains no hand-built scene renderer covered — that breadth
 * is the thing the current pipeline claims and the previous one could not do —
 * and the ages span the range, because a five-year-old and an eleven-year-old
 * are different briefs for the same question.
 */
export const STUDIO_SPIKE_CASES: readonly StudioSpikeCase[] = [
  {
    id: 'moon-follows',
    create: '为什么月亮看起来会跟着我们？',
    targetAge: 8,
    patch: '他只有 6 岁，再直观一点，字少一些。',
  },
  {
    id: 'caterpillar',
    create: '毛毛虫为什么会变成蝴蝶？',
    targetAge: 6,
    patch: '加一个小挑战，让他把四个阶段排出顺序。',
  },
  {
    id: 'salty-sea',
    create: '海水为什么是咸的？',
    targetAge: 9,
    patch: '加一个可以在家做的小实验的说明。',
  },
  {
    id: 'shadow-length',
    create: '影子为什么会变长又变短？',
    targetAge: 7,
    patch: '让他可以自己拖太阳的位置。',
  },
  {
    id: 'rainbow',
    create: '彩虹是从哪里来的？',
    targetAge: 5,
    patch: '他还不认字，多用图形和声音。',
  },
  {
    id: 'plane-lift',
    create: '飞机那么重，为什么能飞起来？',
    targetAge: 11,
    patch: '再加一层：让他试试改变机翼角度会怎样。',
  },
] as const;

export interface StudioSpikeRun {
  caseId: string;
  coderModel: string;
  step: 'create' | 'patch';
  ok: boolean;
  durationMs: number;
  sizeBytes?: number;
  appKind?: StudioAppKind;
  editMode?: StudioEditMode;
  codeAttempts?: number;
  reviewVerdict?: 'pass' | 'revise';
  reviewRetryCount?: number;
  reviewSkipped?: boolean;
  planFallback?: boolean;
  /** Whether the generated page actually speaks — a page a child cannot hear. */
  narrates?: boolean;
  editBlockFailures?: string[];
  warnings?: string[];
  error?: string;
}

export interface StudioSpikeModelReport {
  coderModel: string;
  createSamples: number;
  /** Share of create runs that produced a document passing static validation. */
  createPassRate: number;
  /** Share of create runs that passed on the FIRST coding attempt. */
  firstAttemptRate: number;
  patchSamples: number;
  /** Share of patch runs where the edit blocks applied directly (no rewrite). */
  patchHitRate: number;
  patchPassRate: number;
  /** Share of create runs whose page calls curiositySay at all. */
  narrationRate: number;
  createP95Ms: number;
  medianSizeBytes: number;
  verdict: 'GO' | 'NO-GO';
  failedCriteria: string[];
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1);
  return sorted[Math.max(0, index)]!;
}

/** GO thresholds, fixed before the run so the numbers cannot be rationalized after it. */
export const STUDIO_SPIKE_GATE = {
  minFirstAttemptRate: 0.8,
  minPatchHitRate: 0.6,
  minPatchPassRate: 0.8,
  /** A page a young child cannot hear does not do this product's job. */
  minNarrationRate: 0.8,
  maxCreateP95Ms: 4 * 60_000,
} as const;

export function evaluateStudioSpike(runs: StudioSpikeRun[]): StudioSpikeModelReport[] {
  const models = [...new Set(runs.map((run) => run.coderModel))];
  return models.map((coderModel) => {
    const own = runs.filter((run) => run.coderModel === coderModel);
    const creates = own.filter((run) => run.step === 'create');
    const patches = own.filter((run) => run.step === 'patch');
    const share = (subset: StudioSpikeRun[], total: number) =>
      total === 0 ? 0 : subset.length / total;
    const createPassRate = share(
      creates.filter((run) => run.ok),
      creates.length,
    );
    const firstAttemptRate = share(
      creates.filter((run) => run.ok && run.codeAttempts === 1),
      creates.length,
    );
    const patchHitRate = share(
      patches.filter((run) => run.ok && run.editMode === 'patch'),
      patches.length,
    );
    const patchPassRate = share(
      patches.filter((run) => run.ok),
      patches.length,
    );
    const narrationRate = share(
      creates.filter((run) => run.ok && run.narrates),
      creates.length,
    );
    const createP95Ms = quantile(
      creates.filter((run) => run.ok).map((run) => run.durationMs),
      0.95,
    );
    const medianSizeBytes = quantile(
      creates.filter((run) => run.ok).map((run) => run.sizeBytes ?? 0),
      0.5,
    );
    const failedCriteria: string[] = [];
    if (firstAttemptRate < STUDIO_SPIKE_GATE.minFirstAttemptRate) {
      failedCriteria.push(
        `firstAttemptRate ${(firstAttemptRate * 100).toFixed(0)}% < ${STUDIO_SPIKE_GATE.minFirstAttemptRate * 100}%`,
      );
    }
    if (patchHitRate < STUDIO_SPIKE_GATE.minPatchHitRate) {
      failedCriteria.push(
        `patchHitRate ${(patchHitRate * 100).toFixed(0)}% < ${STUDIO_SPIKE_GATE.minPatchHitRate * 100}%`,
      );
    }
    if (patchPassRate < STUDIO_SPIKE_GATE.minPatchPassRate) {
      failedCriteria.push(
        `patchPassRate ${(patchPassRate * 100).toFixed(0)}% < ${STUDIO_SPIKE_GATE.minPatchPassRate * 100}%`,
      );
    }
    if (narrationRate < STUDIO_SPIKE_GATE.minNarrationRate) {
      failedCriteria.push(
        `narrationRate ${(narrationRate * 100).toFixed(0)}% < ${STUDIO_SPIKE_GATE.minNarrationRate * 100}%`,
      );
    }
    if (createP95Ms > STUDIO_SPIKE_GATE.maxCreateP95Ms) {
      failedCriteria.push(`createP95Ms ${Math.round(createP95Ms / 1000)}s > 240s`);
    }
    return {
      coderModel,
      createSamples: creates.length,
      createPassRate,
      firstAttemptRate,
      patchSamples: patches.length,
      patchHitRate,
      patchPassRate,
      narrationRate,
      createP95Ms,
      medianSizeBytes,
      verdict: failedCriteria.length === 0 ? 'GO' : 'NO-GO',
      failedCriteria,
    };
  });
}
