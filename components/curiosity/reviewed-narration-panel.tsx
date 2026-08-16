'use client';

import { Play, RotateCcw, SkipForward } from 'lucide-react';

interface ReviewedNarrationPanelProps {
  narration: string;
  started: boolean;
  error?: string | null;
  onStart: () => void;
  onReplay: () => void;
  onSkip: () => void;
}

const controlClass =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm font-black transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffe08a]';

export function ReviewedNarrationPanel({
  narration,
  started,
  error,
  onStart,
  onReplay,
  onSkip,
}: ReviewedNarrationPanelProps) {
  return (
    <section
      aria-label="审核旁白"
      className="border-b border-[#d9eef0]/12 bg-[#0d2643] px-5 py-4 text-white"
    >
      <div className="mx-auto max-w-4xl">
        <p className="text-xs font-black tracking-[.12em] text-[#a9d9df]">生成期已审核旁白</p>
        <p aria-live="polite" className="mt-1 text-base font-bold leading-7 text-[#fff9e7]">
          {narration}
        </p>
        {error && (
          <p role="alert" className="mt-2 text-sm font-bold text-[#ffb8a9]">
            {error}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2 border-t border-white/10 pt-3">
          {!started ? (
            <button
              type="button"
              className={`${controlClass} bg-[#fff0ae] text-[#173047]`}
              onClick={onStart}
            >
              <Play className="size-4" /> 开始探索
            </button>
          ) : (
            <>
              <button type="button" className={controlClass} onClick={onReplay}>
                <RotateCcw className="size-4" /> 重听
              </button>
              <button type="button" className={controlClass} onClick={onSkip}>
                <SkipForward className="size-4" /> 跳过
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
