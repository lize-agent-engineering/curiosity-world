import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { CuriosityHomeView } from '@/components/curiosity/home-view';
import { CuriosityRuntimeFrame } from '@/components/curiosity/runtime-frame';
import { CuriosityParentReview } from '@/components/curiosity/parent-review';
import { CollaborationProgress } from '@/components/curiosity/collaboration-progress';
import { ChildTaskShell } from '@/components/curiosity/child-task-shell';
import { CuriosityArchiveView } from '@/components/curiosity/archive-view';
import { VoiceGuide } from '@/components/curiosity/voice-guide';
import { createValidCuriositySpec } from './fixture';

describe('Curiosity parent creation view', () => {
  it('renders the question-first form and immediate generation state without legacy product language', () => {
    const html = renderToStaticMarkup(
      createElement(CuriosityHomeView, {
        values: {
          question: '为什么月亮看起来会跟着我们？',
          age: 8,
          interests: '散步、星空',
        },
        status: { step: 'scope_check', progress: 10, message: '正在检查支持范围' },
        recent: [],
        error: null,
        onChange: vi.fn(),
        onSubmit: vi.fn(),
        onOpenExperience: vi.fn(),
      }),
    );

    expect(html).toContain('把孩子的“为什么”');
    expect(html).toContain('孩子正在好奇什么？');
    expect(html).toContain('正在检查支持范围');
    expect(html).toContain('为什么月亮看起来会跟着我们？');
    expect(html).toContain('桥为什么不会倒？');
    expect(html).toContain('影子为什么会变长？');
    expect(html).not.toMatch(/课程大纲|教师|同学|幻灯片|白板|课堂 TTS|视频导出|PBL/);
  });

  it('frames the entry point as a real-world observation instead of an AI generation form', () => {
    const html = renderToStaticMarkup(
      createElement(CuriosityHomeView, {
        values: {
          question: '为什么月亮看起来会跟着我们？',
          age: 8,
          interests: '散步、星空',
        },
        status: null,
        recent: [],
        error: null,
        onChange: vi.fn(),
        onSubmit: vi.fn(),
        onOpenExperience: vi.fn(),
      }),
    );

    expect(html).toContain('今晚的观察');
    expect(html).toContain('从一个真问题出发');
    expect(html).not.toContain('把它编译成');
  });

  it('keeps a failed generation actionable without exposing pipeline diagnostics', () => {
    const html = renderToStaticMarkup(
      createElement(CuriosityHomeView, {
        values: {
          question: '为什么月亮看起来会跟着我们？',
          age: 8,
          interests: '散步、星空',
        },
        status: null,
        recent: [],
        error: 'INTERACTION_DESIGN_INVALID: variables.0:custom',
        onChange: vi.fn(),
        onSubmit: vi.fn(),
        onOpenExperience: vi.fn(),
      }),
    );

    expect(html).toContain('这次探索还没有生成完成，请重新生成。');
    expect(html).toContain('重新生成这次探索');
    expect(html).not.toContain('INTERACTION_DESIGN_INVALID');
    expect(html).not.toContain('variables.0:custom');
  });
});

describe('Curiosity structured collaboration', () => {
  it('shows story guidance as a real generation stage', () => {
    const html = renderToStaticMarkup(
      createElement(CollaborationProgress, {
        status: {
          step: 'story_design',
          progress: 74,
          message: '已完成故事阶段与引导设计',
          completedStages: [
            'question_modeling',
            'knowledge_design',
            'interaction_design',
            'story_design',
          ],
          artifacts: [],
        },
      }),
    );
    expect(html).toContain('故事引导');
    expect(html).toContain('已完成故事阶段与引导设计');
    expect(html).not.toContain('agent-chat-bubble');
  });

  it('shows the active specialist, live work state, and wait expectation', () => {
    const html = renderToStaticMarkup(
      createElement(CollaborationProgress, {
        status: {
          step: 'knowledge_design',
          progress: 25,
          message: '已确认核心问题与安全范围',
          completedStages: ['question_modeling'],
          artifacts: [],
        },
      }),
    );

    expect(html).toContain('知识研究员');
    expect(html).toContain('正在梳理科学原理、因果关系和常见误解');
    expect(html).toContain('仍在认真工作');
    expect(html).toContain('通常需要 2–4 分钟');
    expect(html).toContain('已完成 1 / 6');
    expect(html).toContain('问题侦探');
    expect(html).toContain('互动设计师');
    expect(html).toContain('故事引导员');
    expect(html).toContain('运行工程师');
    expect(html).toContain('体验质检员');
    expect(html).toContain('把抽象知识变成孩子可以操作的探索');
    expect(html).toContain('前一位交付结果，下一位接着完成');
  });

  it('renders verified stage conclusions instead of agent chat bubbles', () => {
    const html = renderToStaticMarkup(
      createElement(CollaborationProgress, {
        status: {
          step: 'knowledge_design',
          progress: 45,
          message: '已完成知识目标与误解边界设计',
          completedStages: ['question_modeling', 'knowledge_design'],
          artifacts: [],
        },
      }),
    );
    expect(html).toContain('核心问题');
    expect(html).toContain('知识边界');
    expect(html).not.toContain('agent-chat-bubble');
  });

  it('keeps the child shell focused on one current task without system vocabulary', () => {
    const html = renderToStaticMarkup(
      createElement(
        ChildTaskShell,
        {
          title: '月亮为什么像在跟着我？',
        },
        createElement('div', null, '互动区域'),
      ),
    );
    expect(html).toContain('现在只做一件事');
    expect(html).not.toMatch(/Agent|Schema|模型|版本/);
  });
});

describe('Curiosity child runtime frame', () => {
  it('requires an explicit start gesture and exposes child-sized voice controls', () => {
    const html = renderToStaticMarkup(
      createElement(VoiceGuide, {
        narration: '先猜一猜，谁变化得更快？',
        started: false,
        listening: false,
        error: null,
        onStart: vi.fn(),
        onReplay: vi.fn(),
        onSkip: vi.fn(),
        onListen: vi.fn(),
      }),
    );
    expect(html).toContain('开始探索');
    expect(html).toContain('先猜一猜，谁变化得更快？');
    expect(html).toContain('先听，再做');
    expect(html).not.toMatch(/API Key|服务商|模型设置/);
  });

  it('tells a child how to finish an active recording', () => {
    const html = renderToStaticMarkup(
      createElement(VoiceGuide, {
        narration: '说说你发现了什么。',
        started: true,
        listening: true,
        error: null,
        onStart: vi.fn(),
        onReplay: vi.fn(),
        onSkip: vi.fn(),
        onListen: vi.fn(),
      }),
    );
    expect(html).toContain('点击结束');
    expect(html).not.toContain('disabled=""');
  });

  it('renders the deterministic child scene as React SVG instead of an iframe runtime', () => {
    const spec = createValidCuriositySpec();
    const html = renderToStaticMarkup(
      createElement(CuriosityRuntimeFrame, {
        spec,
        onReady: vi.fn(),
        onEvent: vi.fn(),
        onRuntimeFailure: vi.fn(),
      }),
    );

    expect(html).not.toContain('<iframe');
    expect(html).toContain('<svg');
    expect(html).toContain('aria-label="远近物体视角变化实验"');
    expect(html).toContain('data-scene-layer="near-lamp"');
    expect(html).toContain('data-scene-layer="far-mountain"');
    expect(html).toContain('data-scene-layer="moon"');
    expect(html).toContain('让小朋友往前走');
    expect(html).not.toContain('观察者位置');
  });

  it('renders a runnable bridge balance scene for the balance-support family', () => {
    const spec = createValidCuriositySpec();
    spec.knowledge = { family: 'balance-support', packId: 'balance-support.bridge.v1' };
    spec.simulation.preset = 'balance-support-v1';
    const html = renderToStaticMarkup(
      createElement(CuriosityRuntimeFrame, {
        spec,
        activeStageKind: 'exploration',
        onReady: vi.fn(),
        onEvent: vi.fn(),
        onRuntimeFailure: vi.fn(),
      }),
    );

    expect(html).toContain('aria-label="桥梁支撑与重心实验"');
    expect(html).toContain('移动桥墩做承重测试');
    expect(html).not.toContain('RUNTIME_FAILED');
  });

  it('renders a runnable light and shadow scene for the light-path family', () => {
    const spec = createValidCuriositySpec();
    spec.knowledge = { family: 'light-path', packId: 'light-path.shadow-length.v1' };
    spec.simulation.preset = 'light-path-v1';
    const html = renderToStaticMarkup(
      createElement(CuriosityRuntimeFrame, {
        spec,
        activeStageKind: 'exploration',
        onReady: vi.fn(),
        onEvent: vi.fn(),
        onRuntimeFailure: vi.fn(),
      }),
    );

    expect(html).toContain('aria-label="光源位置与影子长度实验"');
    expect(html).toContain('移动手电筒观察影子');
    expect(html).not.toContain('RUNTIME_FAILED');
  });

  it('uses labeled vector discovery states rather than decorative emoji', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'components/curiosity/scenes/relative-motion-scene.tsx'),
      'utf8',
    );

    expect(source).not.toMatch(/[✨🌙]/);
  });

  it('does not animate SVG path data through Motion interpolation', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'components/curiosity/scenes/family-experiment-scene.tsx'),
      'utf8',
    );

    expect(source).not.toContain('<motion.path');
  });

  it.each([
    ['prediction', '你觉得谁移动得最明显？', '近处路灯'],
    ['exploration', '拖动小朋友，观察三种物体在视野中的变化。', '让小朋友往前走'],
    ['guided-discovery', '再走一次，仔细比较', '近处和远处'],
    ['transfer', '哪个距离会让物体看起来移动得更少？', '更远'],
    ['explanation', '选择最合理的解释。', '月亮很远'],
  ] as const)('shows one clear action for the %s stage', (activeStageKind, prompt, action) => {
    const html = renderToStaticMarkup(
      createElement(CuriosityRuntimeFrame, {
        spec: createValidCuriositySpec(),
        activeStageKind,
        onReady: vi.fn(),
        onEvent: vi.fn(),
        onRuntimeFailure: vi.fn(),
      }),
    );

    expect(html).toContain(prompt);
    expect(html).toContain(action);
  });
});

describe('Curiosity parent review', () => {
  it('shows evidence ids for behavior facts and separates the knowledge-pack recommendation', () => {
    const html = renderToStaticMarkup(
      createElement(CuriosityParentReview, {
        spec: createValidCuriositySpec(),
        summary: {
          experienceId: 'cur_moon_demo',
          versionId: 'ver_moon_demo_1',
          eventCount: 2,
          facts: [
            {
              kind: 'exploration',
              text: '孩子移动观察者 2 次。',
              eventIds: ['evt_1', 'evt_2'],
            },
          ],
          recommendation: '散步时比较近处路灯和远处月亮。',
        },
        voiceEvents: [
          {
            schemaVersion: '1.0',
            eventId: 'evt_voice_1',
            experienceId: 'cur_moon_demo',
            versionId: 'ver_moon_demo_1',
            stageId: 'predict',
            status: 'accepted',
            transcript: '我猜路灯变化更快',
            confidence: 0.92,
            occurredAt: '2026-08-15T04:00:00.000Z',
          },
        ],
        revisionImpact: {
          summary: '将表达调整为适合六岁。',
          changedFields: ['profile.age'],
          preservedFields: ['knowledge.packId', 'knowledge.packVersion'],
        },
        versions: [
          { id: 'ver_moon_demo_1', revision: 1, status: 'active', createdAt: '2026-08-15' },
        ],
        revisionInstruction: '',
        revising: false,
        regenerating: false,
        error: null,
        onRevisionInstructionChange: vi.fn(),
        onSubmitRevision: vi.fn(),
        onRegenerate: vi.fn(),
        onSelectVersion: vi.fn(),
      }),
    );

    expect(html).toContain('evt_1');
    expect(html).toContain('evt_2');
    expect(html).toContain('语音识别记录');
    expect(html).toContain('我猜路灯变化更快');
    expect(html).toContain('evt_voice_1');
    expect(html).toContain('来自知识包的现实观察建议');
    expect(html).toContain('修改影响');
    expect(html).toContain('profile.age');
    expect(html).toContain('knowledge.packId');
    expect(html).toContain('换个角度再讲一遍');
    expect(html).toContain('探索历史');
    expect(html).toContain('回看版本 1');
    expect(html).not.toMatch(/掌握度|能力标签|mastery/i);
  });
});

describe('Curiosity archive view', () => {
  it('separates evidence, observation guidance and pack-bounded next questions', () => {
    const html = renderToStaticMarkup(
      createElement(CuriosityArchiveView, {
        archive: {
          experienceId: 'cur_moon_demo',
          versionId: 'ver_moon_demo_1',
          question: '为什么月亮跟着我？',
          facts: [],
          observationSuggestions: ['散步时比较路灯和月亮。'],
          ageGuidance: '先让孩子预测，再要求用一次观察证据解释选择。',
          nextQuestions: ['远山为什么移动得慢？', '车窗近景为什么移动得快？'],
        },
      }),
    );
    expect(html).toContain('现实观察');
    expect(html).toContain('陪伴提示');
    expect(html).toContain('下一次可以继续问');
    expect(html).toContain('远山为什么移动得慢？');
  });
});
