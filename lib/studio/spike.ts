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
  expectedKind: StudioAppKind;
  create: string;
  patch: string;
}

export const STUDIO_SPIKE_CASES: readonly StudioSpikeCase[] = [
  {
    id: 'tool-pomodoro',
    expectedKind: 'tool',
    create: '做一个番茄钟，25 分钟专注、5 分钟休息，可以开始、暂停和重置。',
    patch: '加一个今日完成次数统计，刷新之后不能丢。',
  },
  {
    id: 'game-snake',
    expectedKind: 'game',
    create: '做一个贪吃蛇小游戏，键盘和手机都要能玩。',
    patch: '加一个最高分记录，刷新之后还在。',
  },
  {
    id: 'dashboard-spending',
    expectedKind: 'dashboard',
    create: '做一个个人记账看板，展示本月各类支出占比和最近 7 天的趋势。',
    patch: '把趋势图改成柱状图，并加上与上月的对比。',
  },
  {
    id: 'content-solar-terms',
    expectedKind: 'content',
    create: '做一个介绍二十四节气的图文页面，可以按季节筛选。',
    patch: '加一个搜索框，可以按名字过滤节气。',
  },
  {
    id: 'form-signup',
    expectedKind: 'form',
    create: '做一个活动报名表单，包含姓名、手机号、场次选择和饮食忌口，提交后显示确认信息。',
    patch: '加一个人数上限提示：每场限 20 人，报满就不能提交。',
  },
  {
    id: 'creative-pixel',
    expectedKind: 'creative',
    create: '做一个像素画板，16×16 的格子，可以选颜色画画。',
    patch: '加一个撤销按钮，可以撤销最近 10 步。',
  },
  {
    id: 'general-potato',
    expectedKind: 'general',
    create: '做一个会占卜的土豆。',
    patch: '加一个历史记录，能看到之前占卜过的结果。',
  },
  {
    id: 'general-mood-color',
    expectedKind: 'general',
    create: '帮我做一个能测出我今天心情颜色的东西。',
    patch: '加一个分享文案，把今天的颜色变成一句话显示出来。',
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
      createP95Ms,
      medianSizeBytes,
      verdict: failedCriteria.length === 0 ? 'GO' : 'NO-GO',
      failedCriteria,
    };
  });
}
