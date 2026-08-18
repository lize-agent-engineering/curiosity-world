import { describe, expect, it } from 'vitest';

import { STUDIO_APP_KINDS, type StudioPlan } from '@/lib/studio/contracts';
import { STUDIO_EDIT_BLOCK_FORMAT } from '@/lib/studio/edit-blocks';
import {
  STUDIO_APP_KIND_GUIDE,
  STUDIO_CODER_CONTRACT,
  renderStudioCoderSystem,
  renderStudioCreatePrompt,
  renderStudioPatchPrompt,
  renderStudioPlannerPrompt,
  renderStudioReviewerPrompt,
  renderStudioRewritePrompt,
} from '@/lib/studio/prompts';
import { validateStudioHtml } from '@/lib/studio/validate';

const plan: StudioPlan = {
  appName: '番茄钟',
  appKind: 'tool',
  summary: '一个专注计时器。',
  changeNote: '首次生成番茄钟。',
  features: ['25 分钟倒计时', '完成次数统计'],
  layout: '居中单栏。',
  interactions: ['点击开始'],
  persistence: 'local-storage',
};

const html =
  '<!doctype html><html lang="zh-CN"><head><title>番茄钟</title></head><body><h1>番茄钟</h1></body></html>';

describe('the universal coder contract', () => {
  it('bans every way of reaching the network', () => {
    expect(STUDIO_CODER_CONTRACT).toContain('零外链');
    expect(STUDIO_CODER_CONTRACT).toContain('fetch');
  });

  it('names the sandbox behaviours that silently break generated pages', () => {
    expect(STUDIO_CODER_CONTRACT).toContain('alert');
    expect(STUDIO_CODER_CONTRACT).toContain('localStorage');
  });

  it('carries a concrete visual system rather than telling the model to be pretty', () => {
    expect(STUDIO_CODER_CONTRACT).toContain('--accent');
    expect(STUDIO_CODER_CONTRACT).toContain('focus-visible');
    expect(STUDIO_CODER_CONTRACT).toContain('system-ui');
  });
});

describe('app kind routing', () => {
  it('has substantial guidance for every kind, general included', () => {
    for (const kind of STUDIO_APP_KINDS) {
      const guide = STUDIO_APP_KIND_GUIDE[kind];
      expect(guide.split('\n').length).toBeGreaterThanOrEqual(5);
      expect(guide.length).toBeGreaterThan(120);
    }
  });

  it('gives a game the loop and input advice a game actually needs', () => {
    expect(STUDIO_APP_KIND_GUIDE.game).toContain('requestAnimationFrame');
    expect(STUDIO_APP_KIND_GUIDE.game).toContain('触控');
  });

  it('tells a dashboard to draw its own charts because libraries are unreachable', () => {
    expect(STUDIO_APP_KIND_GUIDE.dashboard).toContain('SVG');
  });

  it('demands a dashboard have data on screen at first paint', () => {
    expect(STUDIO_APP_KIND_GUIDE.dashboard).toContain('首屏必须有数据');
  });

  it('pins the game canvas aspect ratio so the board is not stretched', () => {
    expect(STUDIO_APP_KIND_GUIDE.game).toContain('aspect-ratio');
  });

  it('composes the system prompt from the contract plus the kind guidance', () => {
    const system = renderStudioCoderSystem('game');
    expect(system).toContain(STUDIO_CODER_CONTRACT);
    expect(system).toContain(STUDIO_APP_KIND_GUIDE.game);
  });

  it('falls back to the general guidance for an unrouted kind', () => {
    expect(renderStudioCoderSystem('general')).toContain(STUDIO_APP_KIND_GUIDE.general);
  });
});

describe('planner prompt', () => {
  it('passes the raw request through and asks for a concrete plan', () => {
    const prompt = renderStudioPlannerPrompt({ request: '做一个记录喝水的应用' });
    expect(prompt).toContain('做一个记录喝水的应用');
  });

  it('never invites the planner to refuse an odd request', () => {
    const prompt = renderStudioPlannerPrompt({ request: '做一个会占卜的土豆' });
    expect(prompt).toContain('general');
    expect(prompt).not.toContain('拒绝');
  });

  it('carries the existing app forward when the user is modifying it', () => {
    const prompt = renderStudioPlannerPrompt({
      request: '加一个今日完成计数',
      current: { plan, summary: '第一版番茄钟' },
    });
    expect(prompt).toContain('番茄钟');
    expect(prompt).toContain('加一个今日完成计数');
  });
});

describe('create prompt', () => {
  it('restates the plan features so the coder implements each one', () => {
    const prompt = renderStudioCreatePrompt({ request: '做个番茄钟', plan });
    expect(prompt).toContain('25 分钟倒计时');
    expect(prompt).toContain('完成次数统计');
    expect(prompt).toContain('做个番茄钟');
  });
});

describe('patch prompt', () => {
  const base = { request: '加今日完成计数，刷新不丢', plan, html };

  it('hands over the stored html and demands edit blocks back', () => {
    const prompt = renderStudioPatchPrompt(base);
    expect(prompt).toContain(html);
    expect(prompt).toContain(STUDIO_EDIT_BLOCK_FORMAT);
    expect(prompt).toContain('加今日完成计数，刷新不丢');
  });

  it('tells the coder to leave untouched regions alone', () => {
    expect(renderStudioPatchPrompt(base)).toContain('无关');
  });

  it('injects reviewer findings so the retry round is aimed', () => {
    const prompt = renderStudioPatchPrompt({
      ...base,
      findings: [{ severity: 'blocker', area: 'feature', detail: '计数没有写入 localStorage。' }],
    });
    expect(prompt).toContain('计数没有写入 localStorage。');
  });

  it('injects runtime errors captured from the previous preview', () => {
    const prompt = renderStudioPatchPrompt({
      ...base,
      runtimeErrors: [
        {
          errorKind: 'error',
          message: 'count is not defined',
          occurredAt: '2026-08-18T10:00:00.000Z',
        },
      ],
    });
    expect(prompt).toContain('count is not defined');
  });
});

describe('rewrite prompt', () => {
  it('asks for the whole document while keeping everything that already worked', () => {
    const prompt = renderStudioRewritePrompt({ request: '换个配色', plan, html });
    expect(prompt).toContain(html);
    expect(prompt).toContain('完整');
  });
});

describe('reviewer prompt', () => {
  it('gives the reviewer the feature checklist, the static report and the code', () => {
    const prompt = renderStudioReviewerPrompt({
      request: '做个番茄钟',
      plan,
      html,
      validation: validateStudioHtml(html),
    });
    expect(prompt).toContain('25 分钟倒计时');
    expect(prompt).toContain('静态校验');
    expect(prompt).toContain('<h1>番茄钟</h1>');
  });

  it('asks for revise only when something is actually wrong', () => {
    const prompt = renderStudioReviewerPrompt({
      request: '做个番茄钟',
      plan,
      html,
      validation: validateStudioHtml(html),
    });
    expect(prompt).toContain('revise');
    expect(prompt).toContain('pass');
  });
});
