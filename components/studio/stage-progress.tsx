'use client';

import { Check, LoaderCircle } from 'lucide-react';

import type { StudioJobView } from '@/lib/studio/client';

const STAGES = [
  { id: 'planning', label: '规划', doing: '正在规划功能与结构' },
  { id: 'coding', label: '编码', doing: '正在编写代码' },
  { id: 'reviewing', label: '审查', doing: '正在审查功能与运行风险' },
] as const;

function stageIndex(stage: StudioJobView['stage']): number {
  switch (stage) {
    case 'queued':
      return -1;
    case 'planning':
      return 0;
    case 'coding':
      return 1;
    case 'reviewing':
      return 2;
    default:
      return 3;
  }
}

/** Three named stages with a concrete sentence each — never an unlabelled spinner. */
export function StudioStageProgress({ job }: { job: StudioJobView }) {
  const active = stageIndex(job.stage);
  const failed = job.status === 'failed';
  return (
    <div>
      <ol className="flex items-center gap-2" aria-label="生成阶段">
        {STAGES.map((stage, index) => {
          const done = job.done ? !failed : index < active;
          const current = index === active && !job.done;
          return (
            <li key={stage.id} className="flex flex-1 items-center gap-2">
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                  done
                    ? 'bg-[#3f8066] text-white'
                    : current
                      ? 'bg-[#ffe08a] text-[#28210c]'
                      : 'border border-white/20 text-[#7f9cae]'
                }`}
              >
                {done ? (
                  <Check className="size-3.5" aria-hidden="true" />
                ) : current ? (
                  <LoaderCircle
                    className="size-3.5 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={`text-xs font-bold ${current ? 'text-[#ffe08a]' : done ? 'text-[#a9d5c4]' : 'text-[#7f9cae]'}`}
              >
                {stage.label}
              </span>
              {index < STAGES.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`h-px flex-1 ${index < active ? 'bg-[#3f8066]' : 'bg-white/12'}`}
                />
              )}
            </li>
          );
        })}
      </ol>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${failed ? 'bg-[#e08a7a]' : 'bg-[#ffe08a]'}`}
          style={{ width: `${Math.max(3, Math.min(100, job.progress))}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-[#93aec0]" role="status" aria-live="polite">
        {job.message || STAGES[Math.max(0, Math.min(2, active))]!.doing}
      </p>
    </div>
  );
}
