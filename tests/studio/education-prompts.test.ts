import { describe, expect, it } from 'vitest';

import type { StudioPlan } from '@/lib/studio/contracts';
import {
  renderStudioCoderSystem,
  renderStudioEducationPlannerPrompt,
  renderStudioEducationReviewerPrompt,
  STUDIO_APP_KIND_GUIDE,
  STUDIO_CODER_CONTRACT,
  STUDIO_EDUCATION_GUIDE,
  STUDIO_EDUCATION_PLANNER_SYSTEM,
  STUDIO_EDUCATION_REVIEWER_SYSTEM,
} from '@/lib/studio/prompts';
import { runStudioPipeline } from '@/lib/studio/pipeline';
import { validateStudioHtml } from '@/lib/studio/validate';

const plan: StudioPlan = {
  appName: '月亮为什么跟着我',
  appKind: 'creative',
  summary: '比较远近物体的视角变化。',
  changeNote: '首次生成。',
  features: ['拖动小朋友走动'],
  layout: '夜空场景在上，控制条在下。',
  interactions: ['拖动观察者'],
  persistence: 'none',
  knowledgePoints: ['距离越远，观察方向变化越小'],
  misconceptions: ['月亮真的在追着我们跑'],
};

describe('the education coder guide', () => {
  it('demands interaction that changes state, not page turning', () => {
    expect(STUDIO_EDUCATION_GUIDE).toContain('两种会真正改变画面状态的交互');
    expect(STUDIO_EDUCATION_GUIDE).toContain('纯翻页');
  });

  it('puts the experience before the explanation', () => {
    expect(STUDIO_EDUCATION_GUIDE).toContain('不要先把答案写出来');
    expect(STUDIO_EDUCATION_GUIDE).toContain('预测');
  });

  it('requires a transfer challenge, an ending and a note for the parent', () => {
    expect(STUDIO_EDUCATION_GUIDE).toContain('迁移小挑战');
    expect(STUDIO_EDUCATION_GUIDE).toContain('结束画面');
    expect(STUDIO_EDUCATION_GUIDE).toContain('给家长看');
  });

  it('holds a knowledge floor instead of letting the model improvise science', () => {
    expect(STUDIO_EDUCATION_GUIDE).toContain('科学家还在研究');
    expect(STUDIO_EDUCATION_GUIDE).toContain('不要编');
  });

  it('replaces the app-kind craft notes rather than stacking on top of them', () => {
    const system = renderStudioCoderSystem('creative', true);
    expect(system).toContain(STUDIO_CODER_CONTRACT);
    expect(system).toContain(STUDIO_EDUCATION_GUIDE);
    expect(system).not.toContain(STUDIO_APP_KIND_GUIDE.creative);
  });

  it('leaves general mode untouched', () => {
    const system = renderStudioCoderSystem('creative');
    expect(system).toContain(STUDIO_APP_KIND_GUIDE.creative);
    expect(system).not.toContain(STUDIO_EDUCATION_GUIDE);
  });
});

describe('the education planner prompt', () => {
  it('passes the child question through and states the age', () => {
    const prompt = renderStudioEducationPlannerPrompt({
      question: '为什么月亮看起来会跟着我们？',
      targetAge: 8,
    });
    expect(prompt).toContain('为什么月亮看起来会跟着我们？');
    expect(prompt).toContain('8 岁');
  });

  it('scales the language budget with the age instead of using one rule for all', () => {
    const five = renderStudioEducationPlannerPrompt({
      question: '影子为什么会变长？',
      targetAge: 5,
    });
    const eleven = renderStudioEducationPlannerPrompt({
      question: '影子为什么会变长？',
      targetAge: 11,
    });
    expect(five).toContain('几乎不识字');
    expect(eleven).toContain('完整句子');
  });

  it('keeps the plan small enough to be written in one pass, with fixed parts out of it', () => {
    const prompt = renderStudioEducationPlannerPrompt({
      question: '海水为什么是咸的？',
      targetAge: 8,
    });
    expect(prompt).toContain('只写 **3 条**');
    expect(prompt).toContain('一屏之内');
    expect(prompt).toContain('固定组成部分');
  });

  it('carries the existing exploration forward on a modification', () => {
    const prompt = renderStudioEducationPlannerPrompt({
      question: '再简单一点',
      targetAge: 6,
      current: { plan, summary: '第一版' },
    });
    expect(prompt).toContain('拖动小朋友走动');
    expect(prompt).toContain('再简单一点');
  });

  it('defines changeNote as parent-facing copy', () => {
    expect(STUDIO_EDUCATION_PLANNER_SYSTEM).toContain('绝不能提到模型、JSON、格式');
  });

  it('refuses to let the planner hand-wave uncertain science', () => {
    expect(STUDIO_EDUCATION_PLANNER_SYSTEM).toContain('知识必须站得住');
  });
});

describe('the education reviewer', () => {
  it('puts knowledge correctness first and calls it a blocker', () => {
    expect(STUDIO_EDUCATION_REVIEWER_SYSTEM).toContain('知识是否正确');
    expect(STUDIO_EDUCATION_REVIEWER_SYSTEM).toContain('blocker');
  });

  it('checks for real interaction and for experience-before-answer', () => {
    expect(STUDIO_EDUCATION_REVIEWER_SYSTEM).toContain('是不是真互动');
    expect(STUDIO_EDUCATION_REVIEWER_SYSTEM).toContain('先体验后结论');
  });

  it('hands over the child question, the age, the causal points and the wrong explanations', () => {
    const prompt = renderStudioEducationReviewerPrompt({
      question: '为什么月亮看起来会跟着我们？',
      targetAge: 8,
      plan,
      html: '<!doctype html><html><body><h1>月亮</h1></body></html>',
      validation: validateStudioHtml('<!doctype html><html><body><h1>月亮</h1></body></html>'),
    });
    expect(prompt).toContain('为什么月亮看起来会跟着我们？');
    expect(prompt).toContain('8 岁');
    expect(prompt).toContain('距离越远，观察方向变化越小');
    expect(prompt).toContain('月亮真的在追着我们跑');
    expect(prompt).toContain('静态校验');
  });
});

describe('the pipeline in education mode', () => {
  const educationPlan = JSON.stringify({
    appName: '月亮为什么跟着我',
    appKind: 'creative',
    summary: '比较远近物体的视角变化。',
    changeNote: '做了一次月亮跟随的探索。',
    features: ['拖动小朋友走动', '比较路灯和月亮'],
    layout: '夜空场景在上，控制条在下。',
    interactions: ['拖动观察者'],
    persistence: 'none',
    knowledgePoints: ['距离越远，观察方向变化越小'],
    misconceptions: ['月亮真的在追着我们跑'],
  });
  const page =
    '<!doctype html>\n<html lang="zh-CN"><head><title>月亮</title></head>\n<body><h1>月亮</h1></body>\n</html>';

  function scripted(responses: string[]) {
    const calls: Array<{ system?: string; prompt: string }> = [];
    let index = 0;
    return {
      calls,
      route: { providerId: 'test', modelId: 'scripted' },
      async complete(input: { system?: string; prompt: string; onDelta?: (c: string) => void }) {
        calls.push({ system: input.system, prompt: input.prompt });
        const response = responses[Math.min(index, responses.length - 1)]!;
        index += 1;
        await input.onDelta?.(response);
        return response;
      },
    };
  }

  it('routes all three roles through the education prompts', async () => {
    const planner = scripted([educationPlan]);
    const coder = scripted([page]);
    const reviewer = scripted([JSON.stringify({ verdict: 'pass', findings: [] })]);
    const result = await runStudioPipeline(
      { request: '为什么月亮看起来会跟着我们？', education: { targetAge: 8 } },
      {
        'studio.planner': planner,
        'studio.coder': coder,
        'studio.reviewer': reviewer,
      } as never,
    );
    expect(planner.calls[0]!.system).toBe(STUDIO_EDUCATION_PLANNER_SYSTEM);
    expect(coder.calls[0]!.system).toContain(STUDIO_EDUCATION_GUIDE);
    expect(reviewer.calls[0]!.system).toBe(STUDIO_EDUCATION_REVIEWER_SYSTEM);
    expect(result.plan.knowledgePoints).toEqual(['距离越远，观察方向变化越小']);
  });

  it('passes the causal points and the wrong explanations down to the coder', async () => {
    const coder = scripted([page]);
    await runStudioPipeline(
      { request: '为什么月亮看起来会跟着我们？', education: { targetAge: 8 } },
      {
        'studio.planner': scripted([educationPlan]),
        'studio.coder': coder,
        'studio.reviewer': scripted([JSON.stringify({ verdict: 'pass', findings: [] })]),
      } as never,
    );
    expect(coder.calls[0]!.prompt).toContain('距离越远，观察方向变化越小');
    expect(coder.calls[0]!.prompt).toContain('月亮真的在追着我们跑');
  });

  it('keeps general mode on the general prompts', async () => {
    const planner = scripted([educationPlan]);
    const coder = scripted([page]);
    await runStudioPipeline({ request: '做一个番茄钟' }, {
      'studio.planner': planner,
      'studio.coder': coder,
      'studio.reviewer': scripted([JSON.stringify({ verdict: 'pass', findings: [] })]),
    } as never);
    expect(planner.calls[0]!.system).not.toBe(STUDIO_EDUCATION_PLANNER_SYSTEM);
    expect(coder.calls[0]!.system).not.toContain(STUDIO_EDUCATION_GUIDE);
  });
});

describe('narration', () => {
  it('tells the coder how to speak and how to stay speakable when downloaded', () => {
    expect(STUDIO_EDUCATION_GUIDE).toContain('curiositySay');
    expect(STUDIO_EDUCATION_GUIDE).toContain('SpeechSynthesisUtterance');
    // The `||` guard is what lets the host swap in the better voice.
    expect(STUDIO_EDUCATION_GUIDE).toContain('window.curiositySay || function');
  });

  it('asks for short lines and no autoplay lecture', () => {
    expect(STUDIO_EDUCATION_GUIDE).toContain('不超过 40 个字');
    expect(STUDIO_EDUCATION_GUIDE).toContain('不要自动播放');
  });
});
