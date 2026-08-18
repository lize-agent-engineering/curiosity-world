'use client';

import { useEffect, useRef, type FormEvent } from 'react';
import { ArrowLeft, SendHorizontal } from 'lucide-react';

import type { StudioMode, StudioRuntimeError } from '@/lib/studio/contracts';
import type { StudioProjectView, StudioTurn, StudioVersionView } from '@/lib/studio/client';
import { StudioGenerationCard } from './generation-card';
import { StudioPreviewPanel } from './preview-panel';

export interface StudioWorkbenchProps {
  view: StudioProjectView | null;
  turns: StudioTurn[];
  draft: string;
  busy: boolean;
  error: string | null;
  selectedVersionId: string | null;
  html: string | null;
  htmlLoading: boolean;
  runtimeErrors: StudioRuntimeError[];
  onDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSelectVersion: (versionId: string) => void;
  onRollback: (versionId: string) => void;
  onRetry: () => void;
  onRuntimeErrors?: (errors: Array<Pick<StudioRuntimeError, 'errorKind' | 'message'>>) => void;
  onBack: () => void;
}

function versionsOf(view: StudioProjectView | null): StudioVersionView[] {
  return view?.versions ?? [];
}

export function StudioWorkbench(props: StudioWorkbenchProps) {
  const threadRef = useRef<HTMLDivElement>(null);
  const mode: StudioMode = props.view?.project.mode ?? 'general';
  const education = mode === 'education';
  const lastTurn = props.turns.at(-1);
  const streaming = Boolean(lastTurn?.job && !lastTurn.job.done);

  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [props.turns.length, streaming]);

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-[#061223] text-[#e6eef4]">
      <header className="flex items-center gap-3 border-b border-white/8 px-4 py-3">
        <button
          type="button"
          onClick={props.onBack}
          className="grid size-9 place-items-center rounded-lg border border-white/12 text-[#93aec0] transition hover:text-[#e6eef4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffe08a]"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span className="sr-only">回到首页</span>
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-base font-black leading-tight">
            {props.view?.project.title ?? '正在载入…'}
          </h1>
          <p className="mt-0.5 text-[11px] font-bold tracking-[.14em] text-[#7f9cae]">
            {education ? '为什么世界' : 'CURIOSITY STUDIO'} · {versionsOf(props.view).length} 个版本
            {education && props.view?.project.targetAge
              ? ` · ${props.view.project.targetAge} 岁`
              : ''}
          </p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col-reverse lg:grid lg:grid-cols-[minmax(340px,420px)_1fr]">
        <section className="flex min-h-0 flex-1 flex-col border-white/8 lg:border-r">
          <div ref={threadRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5">
            {props.turns.map((turn) => (
              <StudioGenerationCard
                key={turn.id}
                turn={turn}
                onRetry={turn.job?.status === 'failed' ? props.onRetry : undefined}
                onOpenVersion={props.onSelectVersion}
              />
            ))}
            {props.error && (
              <p
                role="alert"
                className="rounded-xl border border-[#e08a7a]/40 bg-[#2b1512] p-3 text-xs font-bold leading-6 text-[#ffb9a6]"
              >
                {props.error}
              </p>
            )}
          </div>

          <form onSubmit={props.onSubmit} className="border-t border-white/8 p-3">
            <div className="flex items-end gap-2 rounded-2xl border border-white/12 bg-[#0c1e35] p-2 focus-within:border-[#ffe08a]/60">
              <textarea
                value={props.draft}
                onChange={(event) => props.onDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                rows={2}
                aria-label={education ? '继续修改这次探索' : '继续修改这个应用'}
                placeholder={
                  props.busy
                    ? '正在生成，稍等一下…'
                    : education
                      ? '接着说要改什么，例如：他只有 6 岁，再直观一点'
                      : '继续说要改什么，例如：加一个今日完成计数'
                }
                className="min-h-11 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-6 outline-none placeholder:text-[#6b8699]"
              />
              <button
                type="submit"
                disabled={props.busy || props.draft.trim().length === 0}
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#ffe08a] text-[#26200c] transition hover:bg-[#ffd45f] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffe08a]"
              >
                <SendHorizontal className="size-4" aria-hidden="true" />
                <span className="sr-only">发送</span>
              </button>
            </div>
            <p className="mt-1.5 px-1 text-[11px] text-[#6b8699]">⌘/Ctrl + Enter 发送</p>
          </form>
        </section>

        <StudioPreviewPanel
          versions={versionsOf(props.view)}
          selectedVersionId={props.selectedVersionId}
          currentVersionId={props.view?.project.currentVersionId ?? null}
          html={props.html}
          loading={props.htmlLoading}
          runtimeErrors={props.runtimeErrors}
          downloadName={`${(props.view?.project.title ?? 'app').replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 40)}.html`}
          onSelectVersion={props.onSelectVersion}
          onRollback={props.onRollback}
          onRuntimeErrors={props.onRuntimeErrors}
        />
      </div>
    </main>
  );
}
