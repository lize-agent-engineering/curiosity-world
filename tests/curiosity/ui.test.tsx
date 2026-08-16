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
import { ExplorationTeamStrip } from '@/components/curiosity/exploration-team-strip';
import { ExplorationCompletion } from '@/components/curiosity/exploration-completion';
import { selectActiveTeamMember } from '@/lib/curiosity/team-speaker';
import { createValidCuriositySpec } from './fixture';

const generatedTeamArtifact = {
  artifactId: 'art_team_ui',
  runId: 'run_team_ui',
  createdAt: '2026-08-16T00:00:00.000Z',
  upstreamArtifactIds: ['art_question_ui', 'art_knowledge_ui', 'art_interaction_ui'],
  knowledgePackVersion: '1.0.0',
  agentRole: 'curiosity.team-assembler' as const,
  schemaVersion: '1.0' as const,
  teamName: '桥梁侦察队',
  rationale: '根据桥梁承重场景的科学边界与操作任务动态组队。',
  members: [
    {
      id: 'member_lead',
      name: '稳稳队长',
      role: 'lead' as const,
      persona: '负责串起承重问题和每一步观察，不提前泄露答案。',
      avatar: '🌉',
      color: '#4F7DA1',
      priority: 10,
      voiceStyle: '温暖清楚，语速舒缓',
    },
    {
      id: 'member_science',
      name: '支点博士',
      role: 'science' as const,
      persona: '专门核对支点与重心关系，守住桥梁实验的科学边界。',
      avatar: '⚖️',
      color: '#927236',
      priority: 8,
      voiceStyle: '沉稳准确，句子简短',
    },
    {
      id: 'member_interaction',
      name: '桥墩阿搭',
      role: 'interaction' as const,
      persona: '把承重规律变成可以移动桥墩和比较结果的动作。',
      avatar: '🧱',
      color: '#3F8066',
      priority: 7,
      voiceStyle: '活泼鼓励，节奏明快',
    },
  ],
};

describe('Curiosity parent creation view', () => {
  it('accepts the dynamic team stage while polling a real generation job', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/page.tsx'), 'utf8');
    expect(source).toContain("'team_assembly'");
  });

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
  it('keeps the generated team visible during the child experience', () => {
    const html = renderToStaticMarkup(
      createElement(ExplorationTeamStrip, { team: generatedTeamArtifact }),
    );
    expect(html).toContain('本次专属探索小队');
    expect(html).toContain('桥梁侦察队');
    expect(html).toContain('稳稳队长');
    expect(html).toContain('负责串起承重问题和每一步观察');
  });

  it('explains the team strip and marks the current speaker', () => {
    const active = selectActiveTeamMember(generatedTeamArtifact, 'guided-discovery', '继续比较。');
    const html = renderToStaticMarkup(
      createElement(ExplorationTeamStrip, {
        team: generatedTeamArtifact,
        activeMemberId: active.id,
      }),
    );

    expect(active.name).toBe('支点博士');
    expect(html).toContain('高亮的是正在引导你的伙伴');
    expect(html).toContain('正在说话');
    expect(html).toContain('aria-current="true"');
  });

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
    expect(html).toContain('故事编排');
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

    expect(html).toContain('知识设计');
    expect(html).toContain('正在梳理科学原理、因果关系和常见误解');
    expect(html).toContain('仍在认真工作');
    expect(html).toContain('通常需要 2–4 分钟');
    expect(html).toContain('已完成 1 / 7');
    expect(html).toContain('问题建模');
    expect(html).toContain('互动计划');
    expect(html).toContain('动态组队');
    expect(html).toContain('场景编译');
    expect(html).toContain('质量审查');
    expect(html).toContain('系统会为这个问题生成 3–5 位专属探索伙伴');
  });

  it('reveals only the team returned by the current generation artifact', () => {
    const html = renderToStaticMarkup(
      createElement(CollaborationProgress, {
        status: {
          step: 'story_design',
          progress: 78,
          message: '小队已组建',
          artifacts: [generatedTeamArtifact],
        },
      }),
    );

    expect(html).toContain('桥梁侦察队');
    expect(html).toContain('稳稳队长');
    expect(html).toContain('支点博士');
    expect(html).toContain('桥墩阿搭');
    expect(html).toContain('专门核对支点与重心关系');
    expect(html).not.toContain('空间观察研究员');
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
  it('closes a completed exploration with real evidence and two clear next actions', () => {
    const spec = createValidCuriositySpec();
    const html = renderToStaticMarkup(
      createElement(ExplorationCompletion, {
        spec,
        team: generatedTeamArtifact,
        speaker: generatedTeamArtifact.members[1],
        summary: {
          experienceId: spec.experienceId,
          versionId: spec.versionId,
          eventCount: 4,
          facts: [
            { kind: 'prediction', text: '孩子最初猜的是：“月亮会跟着走”。', eventIds: ['evt_1'] },
            {
              kind: 'exploration',
              text: '孩子移动观察者 2 次，比较了远近物体的视角变化。',
              eventIds: ['evt_2'],
            },
            {
              kind: 'explanation',
              text: '孩子最后选择的解释是：“距离越远，观察方向变化越小”。',
              eventIds: ['evt_3'],
            },
            { kind: 'completion', text: '孩子完成了本次探索。', eventIds: ['evt_4'] },
          ],
          recommendation: '散步时继续比较路灯和月亮。',
        },
        onNewQuestion: vi.fn(),
        onParentReview: vi.fn(),
      }),
    );

    expect(html).toContain('你把一个“为什么”变成了自己的发现');
    expect(html).toContain('你的发现轨迹');
    expect(html).toContain('你一开始猜的是：“月亮会跟着走”');
    expect(html).toContain('你移动观察者 2 次');
    expect(html).toContain('支点博士');
    expect(html).toContain('和家长一起回顾');
    expect(html).toContain('再探索一个问题');
    expect(html).not.toContain('evt_1');
  });

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

  it('shows who is speaking and makes microphone permission waiting explicit', () => {
    const html = renderToStaticMarkup(
      createElement(VoiceGuide, {
        narration: '再走一次，仔细比较。',
        started: true,
        listening: false,
        requestingMicrophone: true,
        speakerName: '观察小灵',
        speakerAvatar: '👀',
        status: '正在等待麦克风授权，请在浏览器提示中选择允许。',
        error: null,
        onStart: vi.fn(),
        onReplay: vi.fn(),
        onSkip: vi.fn(),
        onListen: vi.fn(),
      }),
    );

    expect(html).toContain('观察小灵正在引导');
    expect(html).toContain('正在等待麦克风授权');
    expect(html).toContain('等待授权…');
    expect(html).toContain('disabled=""');
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
    expect(html).toContain('rx="120"');
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

  it('initializes animated SVG geometry before Motion hydration', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'components/curiosity/scenes/family-experiment-scene.tsx'),
      'utf8',
    );

    expect(source).toContain('initial={{ rx: 120 }}');
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
