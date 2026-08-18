import { describe, expect, it } from 'vitest';

import type { StudioPlan } from '@/lib/studio/contracts';
import {
  runStudioPipeline,
  StudioPipelineError,
  type StudioPipelineEvent,
  type StudioPipelineModels,
  type StudioTextModel,
} from '@/lib/studio/pipeline';

const planJson = (overrides: Partial<StudioPlan> = {}) =>
  JSON.stringify({
    appName: '番茄钟',
    appKind: 'tool',
    summary: '一个专注计时器。',
    changeNote: '首次生成番茄钟。',
    features: ['25 分钟倒计时', '完成次数统计'],
    layout: '居中单栏。',
    interactions: ['点击开始'],
    persistence: 'local-storage',
    ...overrides,
  });

const page = (body: string) =>
  `<!doctype html>\n<html lang="zh-CN">\n<head><meta charset="utf-8"><title>番茄钟</title></head>\n<body>\n${body}\n</body>\n</html>`;

const good = page('<h1>番茄钟</h1>\n<button id="start">开始</button>');
const reviewPass = JSON.stringify({ verdict: 'pass', findings: [] });
const reviewRevise = JSON.stringify({
  verdict: 'revise',
  findings: [{ severity: 'blocker', area: 'feature', detail: '完成次数没有实现。' }],
});

interface Recorded {
  system?: string;
  prompt: string;
}

function scripted(responses: string[]): StudioTextModel & { calls: Recorded[] } {
  const calls: Recorded[] = [];
  let index = 0;
  return {
    calls,
    route: { providerId: 'test', modelId: 'scripted' },
    async complete(input) {
      calls.push({ system: input.system, prompt: input.prompt });
      const response = responses[Math.min(index, responses.length - 1)]!;
      index += 1;
      if (input.onDelta) {
        for (const chunk of response.match(/[\s\S]{1,40}/g) ?? []) await input.onDelta(chunk);
      }
      return response;
    },
  };
}

function models(input: {
  planner: string[];
  coder: string[];
  reviewer?: string[];
}): StudioPipelineModels & {
  planner: ReturnType<typeof scripted>;
  coder: ReturnType<typeof scripted>;
  reviewer: ReturnType<typeof scripted>;
} {
  return {
    'studio.planner': scripted(input.planner),
    'studio.coder': scripted(input.coder),
    'studio.reviewer': scripted(input.reviewer ?? [reviewPass]),
  } as never;
}

const named = (bundle: ReturnType<typeof models>) => ({
  planner: bundle['studio.planner'] as ReturnType<typeof scripted>,
  coder: bundle['studio.coder'] as ReturnType<typeof scripted>,
  reviewer: bundle['studio.reviewer'] as ReturnType<typeof scripted>,
});

const currentPlan: StudioPlan = {
  appName: '番茄钟',
  appKind: 'tool',
  summary: '一个专注计时器。',
  changeNote: '首次生成番茄钟。',
  features: ['25 分钟倒计时'],
  layout: '居中单栏。',
  interactions: ['点击开始'],
  persistence: 'local-storage',
};

const editBlock = (search: string, replace: string) =>
  `<<<<<<< SEARCH\n${search}\n=======\n${replace}\n>>>>>>> REPLACE`;

describe('creating an app', () => {
  it('plans, codes and reviews, returning a stored-ready version', async () => {
    const bundle = models({ planner: [planJson()], coder: [good] });
    const result = await runStudioPipeline({ request: '做个番茄钟' }, bundle);
    expect(result.editMode).toBe('create');
    expect(result.html).toContain('<h1>番茄钟</h1>');
    expect(result.plan.appKind).toBe('tool');
    expect(result.summary).toBe('首次生成番茄钟。');
    expect(result.review.verdict).toBe('pass');
    expect(result.validation.errors).toEqual([]);
  });

  it('streams code out while it is being written', async () => {
    const events: StudioPipelineEvent[] = [];
    const bundle = models({ planner: [planJson()], coder: [good] });
    await runStudioPipeline({ request: '做个番茄钟' }, bundle, {
      onEvent: (event) => {
        events.push(event);
      },
    });
    const stages = events.filter((event) => event.type === 'stage').map((event) => event.stage);
    expect(stages).toEqual(['planning', 'coding', 'reviewing']);
    const deltas = events.filter((event) => event.type === 'code-delta');
    expect(deltas.length).toBeGreaterThan(1);
    expect(deltas.map((event) => event.text).join('')).toBe(good);
    expect(events.some((event) => event.type === 'plan')).toBe(true);
  });

  it('unwraps a fenced code response', async () => {
    const bundle = models({
      planner: [planJson()],
      coder: ['当然，这是应用：\n```html\n' + good + '\n```'],
    });
    const result = await runStudioPipeline({ request: '做个番茄钟' }, bundle);
    expect(result.html.startsWith('<!doctype html>')).toBe(true);
  });

  it('routes an unknown app kind to general instead of failing', async () => {
    const bundle = models({ planner: [planJson({ appKind: '占卜' as never })], coder: [good] });
    const result = await runStudioPipeline({ request: '做一个会占卜的土豆' }, bundle);
    expect(result.plan.appKind).toBe('general');
    expect(named(bundle).coder.calls[0]!.system).toContain('通用要点');
  });

  it('retries once with the static findings when the first document is invalid', async () => {
    const withCdn = page('<script src="https://cdn.example.com/x.js"></script><h1>a</h1>');
    const bundle = models({ planner: [planJson()], coder: [withCdn, good] });
    const result = await runStudioPipeline({ request: '做个番茄钟' }, bundle);
    expect(result.codeAttempts).toBe(2);
    expect(named(bundle).coder.calls[1]!.prompt).toContain('HTML_EXTERNAL_RESOURCE');
  });

  it('fails explicitly when the document is still invalid after the repair round', async () => {
    const bundle = models({ planner: [planJson()], coder: ['这是一个番茄钟的说明。'] });
    await expect(runStudioPipeline({ request: '做个番茄钟' }, bundle)).rejects.toMatchObject({
      failureCode: 'CODE_INVALID',
    });
  });

  it('fails when the planner cannot produce a valid plan', async () => {
    const bundle = models({ planner: ['{"appName":""}'], coder: [good] });
    const error = await runStudioPipeline({ request: '做个番茄钟' }, bundle).catch(
      (cause) => cause,
    );
    expect(error).toBeInstanceOf(StudioPipelineError);
    expect((error as StudioPipelineError).failureCode).toBe('PLAN_INVALID');
    expect((error as StudioPipelineError).failedRole).toBe('studio.planner');
  });
});

describe('modifying an app', () => {
  const current = { html: good, plan: currentPlan, summary: '第一版', runtimeErrors: [] };

  it('applies edit blocks and touches nothing else', async () => {
    const bundle = models({
      planner: [planJson({ changeNote: '加上今日完成计数。' })],
      coder: [editBlock('<h1>番茄钟</h1>', '<h1>番茄钟</h1>\n<p id="done">今日 0 次</p>')],
    });
    const result = await runStudioPipeline({ request: '加今日完成计数', current }, bundle);
    expect(result.editMode).toBe('patch');
    expect(result.html).toContain('今日 0 次');
    expect(result.html).toContain('<button id="start">开始</button>');
    expect(result.summary).toBe('加上今日完成计数。');
  });

  it('feeds the stored html and the previous runtime errors to the coder', async () => {
    const bundle = models({
      planner: [planJson()],
      coder: [editBlock('<h1>番茄钟</h1>', '<h1>专注钟</h1>')],
    });
    await runStudioPipeline(
      {
        request: '改标题',
        current: {
          ...current,
          runtimeErrors: [
            {
              errorKind: 'error',
              message: 'start is not defined',
              occurredAt: '2026-08-18T10:00:00.000Z',
            },
          ],
        },
      },
      bundle,
    );
    const prompt = named(bundle).coder.calls[0]!.prompt;
    expect(prompt).toContain('<button id="start">开始</button>');
    expect(prompt).toContain('start is not defined');
  });

  it('falls back to a full rewrite when the edit blocks do not match', async () => {
    const bundle = models({
      planner: [planJson()],
      coder: [editBlock('<h1>不存在的标题</h1>', '<h1>x</h1>'), page('<h1>专注钟</h1>')],
    });
    const result = await runStudioPipeline({ request: '改标题', current }, bundle);
    expect(result.editMode).toBe('rewrite');
    expect(result.html).toContain('专注钟');
    expect(named(bundle).coder.calls[1]!.prompt).toContain('完整');
  });

  it('reports the edit-block failure it fell back from', async () => {
    const bundle = models({
      planner: [planJson()],
      coder: [editBlock('<h1>不存在</h1>', '<h1>x</h1>'), page('<h1>专注钟</h1>')],
    });
    const result = await runStudioPipeline({ request: '改标题', current }, bundle);
    expect(result.editBlockFailures).toEqual(['EDIT_BLOCK_NOT_FOUND']);
  });

  it('fails clearly when both the patch and the rewrite fail', async () => {
    const bundle = models({
      planner: [planJson()],
      coder: [editBlock('<h1>不存在</h1>', '<h1>x</h1>'), '我改不了。'],
    });
    await expect(runStudioPipeline({ request: '改标题', current }, bundle)).rejects.toMatchObject({
      failureCode: 'PATCH_FAILED',
    });
  });

  it('carries the current app into the planner so unrelated features survive', async () => {
    const bundle = models({
      planner: [planJson()],
      coder: [editBlock('<h1>番茄钟</h1>', '<h1>专注钟</h1>')],
    });
    await runStudioPipeline({ request: '改标题', current }, bundle);
    expect(named(bundle).planner.calls[0]!.prompt).toContain('25 分钟倒计时');
  });
});

describe('the reviewer', () => {
  it('sends the code back once with its findings and keeps the repaired result', async () => {
    const repaired = page('<h1>番茄钟</h1><p id="done">今日 0 次</p>');
    const bundle = models({
      planner: [planJson()],
      coder: [good, repaired],
      reviewer: [reviewRevise, reviewPass],
    });
    const result = await runStudioPipeline({ request: '做个番茄钟' }, bundle);
    expect(result.reviewRetryCount).toBe(1);
    expect(result.html).toContain('今日 0 次');
    expect(result.review.verdict).toBe('pass');
    expect(named(bundle).coder.calls[1]!.prompt).toContain('完成次数没有实现。');
  });

  it('delivers the app rather than failing when the second review still wants changes', async () => {
    const bundle = models({
      planner: [planJson()],
      coder: [good, page('<h1>番茄钟</h1><p>x</p>')],
      reviewer: [reviewRevise, reviewRevise],
    });
    const result = await runStudioPipeline({ request: '做个番茄钟' }, bundle);
    expect(result.review.verdict).toBe('revise');
    expect(result.html).toContain('<h1>番茄钟</h1>');
  });

  it('delivers the app when the reviewer itself cannot answer', async () => {
    const bundle = models({ planner: [planJson()], coder: [good], reviewer: ['我觉得还行'] });
    const result = await runStudioPipeline({ request: '做个番茄钟' }, bundle);
    expect(result.reviewSkipped).toBe(true);
    expect(result.html).toContain('<h1>番茄钟</h1>');
  });

  it('gives the reviewer the static report alongside the code', async () => {
    const bundle = models({ planner: [planJson()], coder: [good] });
    await runStudioPipeline({ request: '做个番茄钟' }, bundle);
    expect(named(bundle).reviewer.calls[0]!.prompt).toContain('静态校验');
    expect(named(bundle).reviewer.calls[0]!.prompt).toContain('25 分钟倒计时');
  });
});
