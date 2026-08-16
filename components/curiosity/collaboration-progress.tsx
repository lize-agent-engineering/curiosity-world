'use client';

import { Check, LoaderCircle } from 'lucide-react';

import type {
  CuriosityPipelineArtifact,
  CuriosityPipelineStage,
} from '@/lib/curiosity/agent-pipeline';

const stages: Array<{
  id: CuriosityPipelineStage;
  label: string;
  doing: string;
}> = [
  { id: 'question', label: '理解问题', doing: '正在确认孩子真正想问的现象' },
  { id: 'knowledge', label: '建立知识', doing: '正在核对事实、关系、误解和不确定性' },
  { id: 'scene', label: '设计场景', doing: '正在把知识放进受控互动场景' },
  { id: 'presentation', label: '准备表达', doing: '正在生成旁白库、即时反馈和发现卡' },
  { id: 'quality', label: '质量审核', doing: '正在逐项审核知识、场景和全部儿童文案' },
];

interface CollaborationProgressProps {
  status: {
    step: string;
    progress: number;
    message: string;
    completedStages?: CuriosityPipelineStage[];
    artifacts?: CuriosityPipelineArtifact[];
  };
}

export function CollaborationProgress({ status }: CollaborationProgressProps) {
  const completed = new Set(status.completedStages ?? []);
  const active =
    stages.find((stage) => stage.id === status.step) ??
    stages.find((stage) => !completed.has(stage.id)) ??
    stages.at(-1)!;

  return (
    <section
      role="status"
      aria-live="polite"
      className="mt-5 overflow-hidden rounded-2xl border border-[#d8cda4] bg-[#f3ead2]"
    >
      <div className="bg-[#173d5a] px-5 py-5 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[.14em] text-[#ffe08a]">正在准备这次探索</p>
            <p className="mt-2 flex items-center gap-2 text-lg font-black">
              <LoaderCircle className="size-5 animate-spin text-[#ffe08a] motion-reduce:animate-none" />
              {active.label}
            </p>
            <p className="mt-2 text-sm leading-6 text-[#dceaf5]">{active.doing}</p>
          </div>
          <span className="font-mono text-sm font-black text-[#ffe08a]">{status.progress}%</span>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
          <div
            className="h-full rounded-full bg-[#ffe08a] transition-[width]"
            style={{ width: `${Math.max(4, Math.min(100, status.progress))}%` }}
          />
        </div>
      </div>
      <ol className="grid gap-2 p-4 sm:grid-cols-5">
        {stages.map((stage) => {
          const done = completed.has(stage.id);
          return (
            <li
              key={stage.id}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-[#314657]"
            >
              <span
                className={`grid size-6 place-items-center rounded-full ${done ? 'bg-[#3f8066] text-white' : 'border border-[#9aa9ac]'}`}
              >
                {done ? <Check className="size-3.5" /> : stages.indexOf(stage) + 1}
              </span>
              {stage.label}
            </li>
          );
        })}
      </ol>
      <p className="px-5 pb-5 text-sm font-bold text-[#5c6c75]">{status.message}</p>
    </section>
  );
}
