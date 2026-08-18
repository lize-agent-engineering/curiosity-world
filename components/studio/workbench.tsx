'use client';

import { useEffect, useRef, type FormEvent } from 'react';
import { ArrowLeft, SendHorizontal } from 'lucide-react';

import { RegistrationMark } from './registration-mark';

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
    <main className="flex h-dvh flex-col overflow-hidden bg-bench text-ink">
      <header className="flex items-center gap-3 border-b border-rule bg-sheet px-4 py-3">
        <button
          type="button"
          onClick={props.onBack}
          className="grid size-9 place-items-center rounded-edge border border-rule text-ink-soft transition hover:bg-bench hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spot"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span className="sr-only">回到首页</span>
        </button>
        <RegistrationMark className="size-5 shrink-0 text-spot" />
        <div className="min-w-0">
          <h1 className="truncate text-base font-black leading-tight">
            {props.view?.project.title ?? '正在载入…'}
          </h1>
          <p className="label-machine mt-1 text-ink-soft">
            {education ? '为什么世界' : 'GENERAL'} · {versionsOf(props.view).length} 个版本
            {education && props.view?.project.targetAge
              ? ` · ${props.view.project.targetAge} 岁`
              : ''}
          </p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col-reverse lg:grid lg:grid-cols-[minmax(340px,420px)_1fr]">
        <section className="flex min-h-0 flex-1 flex-col border-rule bg-bench lg:border-r">
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
                className="rounded-plate border border-fail/30 bg-fail-wash p-3 text-[13px] font-bold leading-6 text-fail"
              >
                {props.error}
              </p>
            )}
          </div>

          <form onSubmit={props.onSubmit} className="border-t border-rule bg-sheet p-3">
            <div className="flex items-end gap-2 rounded-plate border border-rule bg-sheet-raised p-2 focus-within:border-spot">
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
                className="min-h-11 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-6 outline-none placeholder:text-ink-faint"
              />
              <button
                type="submit"
                disabled={props.busy || props.draft.trim().length === 0}
                className="grid size-10 shrink-0 place-items-center rounded-edge bg-spot text-spot-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spot"
              >
                <SendHorizontal className="size-4" aria-hidden="true" />
                <span className="sr-only">发送</span>
              </button>
            </div>
            <p className="label-machine mt-2 px-1 text-ink-soft">⌘ + ENTER 发送</p>
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
