'use client';

import type { StudioJobView } from '@/lib/studio/client';

const STAGES = [
  { id: 'planning', label: '规划', doing: '正在想清楚这次让孩子做什么' },
  { id: 'coding', label: '编码', doing: '正在写这个页面' },
  { id: 'reviewing', label: '审查', doing: '正在核对知识、互动和运行风险' },
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

/**
 * Three named stages, each with a sentence. The stage in flight is marked with
 * the proof colour — on this bench that colour means only one thing, "this is
 * happening right now", so a glance finds it without reading.
 */
export function StudioStageProgress({ job }: { job: StudioJobView }) {
  const active = stageIndex(job.stage);
  const failed = job.status === 'failed';

  return (
    <div>
      <ol className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {STAGES.map((stage, index) => {
          const done = job.done ? !failed : index < active;
          const running = index === active && !job.done;
          return (
            <li key={stage.id} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`size-2.5 ${
                  running ? 'bg-proof' : done ? 'bg-ink' : 'border border-rule bg-transparent'
                }`}
              />
              <span className={`label-machine ${running || done ? 'text-ink' : 'text-ink-soft'}`}>
                {stage.label}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-3 h-1 bg-rule-soft" aria-hidden="true">
        <div
          className={`h-full transition-[width] duration-500 ${failed ? 'bg-fail' : 'bg-spot'}`}
          style={{ width: `${Math.max(3, Math.min(100, job.progress))}%` }}
        />
      </div>
      <p className="mt-2 text-[13px] leading-5 text-ink-soft" role="status" aria-live="polite">
        {job.message || STAGES[Math.max(0, Math.min(2, active))]!.doing}
      </p>
    </div>
  );
}
