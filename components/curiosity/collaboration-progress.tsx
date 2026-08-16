'use client';

import { Check, Circle, LoaderCircle } from 'lucide-react';
import { motion } from 'motion/react';

import type {
  CuriosityPipelineArtifact,
  CuriosityPipelineStage,
} from '@/lib/curiosity/agent-pipeline';

const baseStages: Array<{
  id: CuriosityPipelineStage;
  role: string;
  label: string;
  conclusion: string;
  doing: string;
  intro: string;
  initials: string;
  color: string;
}> = [
  {
    id: 'question_modeling',
    role: '问题侦探',
    label: '核心问题',
    conclusion: '确认问题、安全范围和知识方向',
    doing: '正在理解孩子真正好奇的核心问题',
    intro: '把孩子随口问出的为什么，整理成一个值得亲手验证的问题。',
    initials: '问',
    color: '#4f7da1',
  },
  {
    id: 'knowledge_design',
    role: '知识研究员',
    label: '知识边界',
    conclusion: '确定目标、因果关系和常见误解',
    doing: '正在梳理科学原理、因果关系和常见误解',
    intro: '守住科学边界，找出孩子能观察到的证据和容易产生的误解。',
    initials: '知',
    color: '#927236',
  },
  {
    id: 'interaction_design',
    role: '互动设计师',
    label: '设计玩法',
    conclusion: '确定变量、任务和反馈',
    doing: '正在把知识变成孩子可以亲手尝试的任务',
    intro: '把抽象知识变成孩子可以操作的探索，让发现发生在动作之后。',
    initials: '动',
    color: '#3f8066',
  },
  {
    id: 'story_design',
    role: '故事引导员',
    label: '组织引导',
    conclusion: '组织连续阶段、旁白和提示层级',
    doing: '正在组织旁白、提问和连续探索阶段',
    intro: '安排故事节奏和提示顺序，只在需要的时候推孩子一小步。',
    initials: '故',
    color: '#825f91',
  },
  {
    id: 'deterministic_compile',
    role: '运行工程师',
    label: '搭建场景',
    conclusion: '编译受限互动并检查事件协议',
    doing: '正在搭建互动场景并检查每个操作是否可运行',
    intro: '把设计搭成真正能点击、移动和恢复的互动场景。',
    initials: '建',
    color: '#426d88',
  },
  {
    id: 'quality_review',
    role: '体验质检员',
    label: '最后检查',
    conclusion: '逐项检查年龄、知识和迁移任务',
    doing: '正在检查年龄适配、知识准确性和探索完整性',
    intro: '最后从孩子视角验收，粗糙、超龄或讲不明白都会退回重做。',
    initials: '验',
    color: '#9a5b4d',
  },
];

interface CollaborationProgressProps {
  question?: string;
  status: {
    step: string;
    progress: number;
    message: string;
    completedStages?: CuriosityPipelineStage[];
    artifacts?: CuriosityPipelineArtifact[];
  };
}

function artifactConclusion(artifact: CuriosityPipelineArtifact | undefined): string | undefined {
  if (!artifact) return undefined;
  if ('coreQuestion' in artifact) return artifact.coreQuestion;
  if ('objectives' in artifact) return `${artifact.packId} · ${artifact.objectives[0]}`;
  if ('taskSequence' in artifact)
    return `${artifact.variables.length} 个变量 · ${artifact.taskSequence.length} 个任务`;
  if ('stages' in artifact) return `${artifact.stages.length} 个连续探索阶段`;
  if ('verdict' in artifact) return artifact.verdict === 'pass' ? '全部检查通过' : '检查拒绝';
  return undefined;
}

function assembleStages(question: string, artifacts: CuriosityPipelineArtifact[]) {
  const serialized = JSON.stringify(artifacts);
  const family = /balance-support|桥|承重|支点|重心/.test(`${serialized}${question}`)
    ? 'balance-support'
    : /light-path|影子|手电筒|光源/.test(`${serialized}${question}`)
      ? 'light-path'
      : 'relative-motion';
  const specialist =
    family === 'balance-support'
      ? {
          knowledge: ['结构与承重研究员', '研究支撑', '梳理重心、支点与承重之间可观察的关系。', '承'],
          interaction: ['桥梁实验设计师', '设计承重实验', '把桥墩位置和载荷变成能亲手测试的变量。', '桥'],
        }
      : family === 'light-path'
        ? {
            knowledge: ['光路观察研究员', '研究光影', '梳理光源、遮挡物与影子变化的关系。', '光'],
            interaction: ['影子实验设计师', '设计光影实验', '把光源位置和影子长度变成能亲手比较的任务。', '影'],
          }
        : {
            knowledge: ['空间观察研究员', '研究视差', '梳理远近物体在移动观察中的视角变化。', '空'],
            interaction: ['移动实验设计师', '设计观察', '把视差原理变成可以移动和比较的任务。', '移'],
          };
  return baseStages.map((stage) => {
    const replacement =
      stage.id === 'knowledge_design'
        ? specialist.knowledge
        : stage.id === 'interaction_design'
          ? specialist.interaction
          : null;
    return replacement
      ? { ...stage, role: replacement[0], label: replacement[1], intro: replacement[2], initials: replacement[3] }
      : stage;
  });
}

export function CollaborationProgress({ status, question = '' }: CollaborationProgressProps) {
  const stages = assembleStages(question, status.artifacts ?? []);
  const completed = new Set(status.completedStages ?? []);
  const artifacts = status.artifacts ?? [];
  const activeStage =
    stages.find((stage) => stage.id === status.step) ??
    stages.find((stage) => !completed.has(stage.id)) ??
    stages.at(-1)!;
  return (
    <section
      role="status"
      aria-live="polite"
      className="mt-5 overflow-hidden rounded-2xl border border-[#d8cda4] bg-[#f3ead2]"
    >
      <div className="border-b border-[#d8cda4] bg-[#173d5a] px-5 py-5 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[.14em] text-[#ffe08a]">探索小队正在协作</p>
            <div className="mt-2 flex items-center gap-2">
              <LoaderCircle className="size-5 shrink-0 animate-spin text-[#ffe08a] motion-reduce:animate-none" />
              <p className="text-lg font-black">{activeStage.role}</p>
              <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-bold text-[#dceaf5]">
                仍在认真工作
              </span>
            </div>
            <p className="mt-2 max-w-prose text-sm leading-6 text-[#dceaf5]">{activeStage.doing}</p>
          </div>
          <span className="shrink-0 font-mono text-sm font-black text-[#ffe08a]">
            {status.progress}%
          </span>
        </div>
        <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
          <motion.div
            className="h-full rounded-full bg-[#ffe08a] transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${Math.max(4, Math.min(100, status.progress))}%` }}
            initial={{ opacity: 0.65 }}
            animate={{ opacity: [0.65, 1, 0.65] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
        <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-[#bcd1e2]">
          <span>已完成 {completed.size} / {stages.length}</span>
          <span>通常需要 2–4 分钟，请保持页面开启</span>
        </div>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-2 px-5 pt-4">
        <div>
          <p className="text-xs font-black tracking-[.14em] text-[#856c31]">今晚的探索小队</p>
          <p className="mt-1 text-sm font-bold text-[#314657]">前一位交付结果，下一位接着完成</p>
        </div>
        <p className="text-xs text-[#657381]">{status.message}</p>
      </div>
      <ol className="grid grid-cols-2 gap-2.5 px-5 pb-5 pt-4 sm:grid-cols-3">
        {stages.map((stage, index) => {
          const done = completed.has(stage.id);
          const active = status.step === stage.id;
          const conclusion = artifactConclusion(artifacts[index]);
          return (
            <motion.li
              key={stage.id}
              className={`relative min-h-36 overflow-hidden rounded-2xl border p-3.5 ${
                active
                  ? 'border-[#c8a84f] bg-white shadow-[0_10px_24px_rgba(80,65,28,.14)]'
                  : done
                    ? 'border-[#c9d8d0] bg-white/70'
                    : 'border-[#d8cda4]/70 bg-[#efe6cf]/65'
              }`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0, scale: active ? 1.015 : 1 }}
              transition={{ duration: 0.35, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-start justify-between gap-2">
                <motion.span
                  className="grid size-10 shrink-0 place-items-center rounded-full border-2 bg-[#fffdf7] text-sm font-black shadow-sm"
                  style={{ borderColor: stage.color, color: stage.color }}
                  animate={active ? { boxShadow: [`0 0 0 0 ${stage.color}55`, `0 0 0 7px ${stage.color}00`] } : {}}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
                >
                  {stage.initials}
                </motion.span>
                <span
                  className={`grid size-6 place-items-center rounded-full ${done ? 'bg-[#234d69] text-white' : active ? 'bg-[#ffe08a] text-[#173047]' : 'bg-[#ddd6bd] text-[#7f7454]'}`}
                  aria-label={done ? '已完成' : active ? '正在进行' : '等待中'}
                >
                  {done ? <Check className="size-3.5" /> : <Circle className="size-2.5 fill-current" />}
                </span>
              </div>
              <p className="mt-3 text-sm font-black text-[#253d50]">{stage.role}</p>
              <p className="mt-0.5 text-[11px] font-bold tracking-wide" style={{ color: stage.color }}>
                {stage.label}
              </p>
              <p className="mt-2 text-xs leading-5 text-[#657381]">
                {done && conclusion ? conclusion : stage.intro}
              </p>
              {active && (
                <motion.div
                  className="absolute inset-x-3 bottom-0 h-0.5 rounded-full"
                  style={{ backgroundColor: stage.color }}
                  initial={{ scaleX: 0, transformOrigin: 'left' }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 1.2, ease: 'easeOut' }}
                />
              )}
            </motion.li>
          );
        })}
      </ol>
    </section>
  );
}
