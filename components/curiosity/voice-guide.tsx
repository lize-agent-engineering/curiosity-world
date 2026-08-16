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
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm font-black transition hover:bg-white/10 disabled:opacity-50';

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
      className="border-b border-white/10 bg-[#102748] px-5 py-4 text-white"
    >
      <div className="mx-auto flex max-w-4xl items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#ffd76a] text-[#07152f] shadow-[0_0_24px_rgba(255,215,106,.3)]">
          <Volume2 className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black tracking-[.14em] text-[#9edcff]">探索伙伴</p>
          <p aria-live="polite" className="mt-1 text-base font-bold leading-7">
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
      <div className="mx-auto mt-3 flex max-w-4xl flex-wrap gap-2">
        {!started ? (
          <button
            type="button"
            className={`${controlClass} bg-[#ffd76a] text-[#07152f]`}
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
              className={`${controlClass} bg-[#ff8066] text-[#07152f]`}
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
