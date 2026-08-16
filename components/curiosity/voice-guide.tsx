'use client';

import { Mic, Play, RotateCcw, SkipForward, Volume2 } from 'lucide-react';

interface VoiceGuideProps {
  narration: string;
  started: boolean;
  listening: boolean;
  error: string | null;
  transcript?: string | null;
  onStart: () => void;
  onReplay: () => void;
  onSkip: () => void;
  onListen: () => void;
}

const controlClass =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm font-black transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffe08a] disabled:cursor-not-allowed disabled:opacity-50';

export function VoiceGuide({
  narration,
  started,
  listening,
  error,
  transcript,
  onStart,
  onReplay,
  onSkip,
  onListen,
}: VoiceGuideProps) {
  return (
    <section
      aria-label="语音探索伙伴"
      className="border-b border-[#d9eef0]/12 bg-[#0d2643] px-5 py-4 text-white"
    >
      <div className="mx-auto flex max-w-4xl items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full border border-[#fff2bd]/50 bg-[#fff0ae] text-[#183047] shadow-[0_0_0_6px_rgba(255,240,174,.07)]">
          <Volume2 className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black tracking-[.15em] text-[#a9d9df]">先听，再做</p>
          <p aria-live="polite" className="mt-1 text-base font-bold leading-7 text-[#fff9e7]">
            {narration}
          </p>
          {transcript && <p className="mt-2 text-sm text-[#b9d7ef]">我听到：{transcript}</p>}
          {error && (
            <p role="alert" className="mt-2 text-sm font-bold text-[#ffb8a9]">
              {error}
            </p>
          )}
        </div>
      </div>
      <div className="mx-auto mt-3 flex max-w-4xl flex-wrap gap-2 border-t border-white/10 pt-3">
        {!started ? (
          <button
            type="button"
            className={`${controlClass} bg-[#fff0ae] text-[#173047] shadow-[0_3px_0_#c99d38] hover:bg-[#fff5c9]`}
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
            <button
              type="button"
              className={`${controlClass} bg-[#d87355] text-white shadow-[0_3px_0_#9f4637] hover:bg-[#c96349]`}
              onClick={onListen}
            >
              <Mic className="size-4" />{' '}
              {listening ? '点击结束' : error ? '重新说一次' : '点击说话'}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
