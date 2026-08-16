'use client';

import { Mic, Play, RotateCcw, SkipForward } from 'lucide-react';

interface VoiceGuideProps {
  narration: string;
  started: boolean;
  listening: boolean;
  requestingMicrophone?: boolean;
  speakerName?: string;
  speakerAvatar?: string;
  status?: string | null;
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
  requestingMicrophone = false,
  speakerName = '探索伙伴',
  speakerAvatar = '🌙',
  status,
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
        <span className="relative grid size-12 shrink-0 place-items-center rounded-full border border-[#fff2bd]/50 bg-[#fff0ae] text-xl text-[#183047] shadow-[0_0_0_6px_rgba(255,240,174,.07)]">
          <span aria-hidden="true">{speakerAvatar}</span>
          <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-[#0d2643] bg-[#6de3a4]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black tracking-[.12em] text-[#a9d9df]">
            {speakerName}正在引导 · 先听，再做
          </p>
          <p aria-live="polite" className="mt-1 text-base font-bold leading-7 text-[#fff9e7]">
            {narration}
          </p>
          {transcript && <p className="mt-2 text-sm text-[#b9d7ef]">我听到：{transcript}</p>}
          {status && (
            <p role="status" aria-live="polite" className="mt-2 text-sm font-bold text-[#ffe08a]">
              {status}
            </p>
          )}
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
              disabled={requestingMicrophone}
            >
              <Mic className="size-4" />{' '}
              {listening
                ? '点击结束'
                : requestingMicrophone
                  ? '等待授权…'
                  : error
                    ? '重新说一次'
                    : '点击说话'}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
