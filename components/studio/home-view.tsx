'use client';

import type { FormEvent } from 'react';
import { ArrowRight, ChevronDown, Loader2, Moon } from 'lucide-react';

import type { StudioMode } from '@/lib/studio/contracts';
import type { StudioProjectSummary } from '@/lib/studio/client';
import { StudioSkyChart } from './sky-chart';

/**
 * Deliberately spread across domains — motion, biology, chemistry, light,
 * engineering, weather. The point of this version is that a child is no longer
 * limited to the three knowledge families the first pipeline could render.
 */
export const STUDIO_EXAMPLE_QUESTIONS = [
  '为什么月亮看起来会跟着我们？',
  '毛毛虫为什么会变成蝴蝶？',
  '海水为什么是咸的？',
  '影子为什么会变长又变短？',
  '飞机那么重，为什么能飞起来？',
  '彩虹是从哪里来的？',
] as const;

export const AGE_OPTIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export const STUDIO_EXAMPLE_PROMPTS = [
  '做一个番茄钟，25 分钟专注、5 分钟休息，可以暂停和重置',
  '做一个记账看板，展示本月各类支出占比和最近 7 天趋势',
  '做一个活动报名表单，提交后显示确认信息',
] as const;

export interface StudioHomeViewProps {
  mode: StudioMode;
  draft: string;
  targetAge: number;
  busy: boolean;
  error: string | null;
  projects: StudioProjectSummary[];
  onModeChange: (mode: StudioMode) => void;
  onDraftChange: (value: string) => void;
  onTargetAgeChange: (value: number) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onOpenProject: (projectId: string) => void;
}

export function StudioHomeView({
  mode,
  draft,
  targetAge,
  busy,
  error,
  projects,
  onModeChange,
  onDraftChange,
  onTargetAgeChange,
  onSubmit,
  onOpenProject,
}: StudioHomeViewProps) {
  const education = mode === 'education';
  const examples = education ? STUDIO_EXAMPLE_QUESTIONS : STUDIO_EXAMPLE_PROMPTS;

  return (
    <main
      data-surface="night"
      className="min-h-dvh overflow-x-hidden bg-night text-star selection:bg-moon selection:text-moon-ink"
    >
      <div className="relative isolate mx-auto min-h-dvh max-w-[980px] px-5 pb-14 pt-6 sm:px-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 [background-image:radial-gradient(circle_at_78%_-4%,rgba(255,217,122,.13),transparent_36%),radial-gradient(circle_at_8%_54%,rgba(64,132,168,.14),transparent_42%)]"
        />

        <header className="flex items-baseline justify-between gap-4">
          <span className="flex items-center gap-2.5">
            <Moon className="size-4 fill-current text-moon" aria-hidden="true" />
            <span className="font-[family-name:var(--font-curiosity-display)] text-base leading-none text-star">
              为什么世界
            </span>
          </span>
          <span className="label-machine text-star-faint">CURIOUS BY NIGHT</span>
        </header>

        <section className="pt-16 sm:pt-24">
          <p className="text-sm font-bold text-moon">课堂未必讲，家长不一定会</p>
          <h1 className="mt-4 font-[family-name:var(--font-curiosity-display)] text-[clamp(2.1rem,5.4vw,3.4rem)] leading-[1.15] tracking-[-.01em] text-star">
            {education ? '孩子最近在问什么？' : '你想要一个什么应用？'}
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-7 text-star-soft">
            {education
              ? '写下他的原话就行。三个智能体会当场规划、写代码、验收，做出一个他能亲手玩的页面——先猜一猜，动手试，再看懂为什么。'
              : '同一套智能体，去掉领域指引就是通用生成器。产物一样是可运行、可继续改的单文件网页。'}
          </p>

          <form onSubmit={onSubmit} className="mt-8">
            <label htmlFor="studio-prompt" className="sr-only">
              {education ? '孩子在好奇什么' : '描述你想要的应用'}
            </label>
            <div className="rounded-2xl border border-night-rule bg-night-raised/80 transition focus-within:border-moon/55">
              <textarea
                id="studio-prompt"
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                rows={2}
                required
                placeholder={education ? '为什么天是蓝的？' : '做一个记录每天喝水的应用，刷新不丢'}
                className="w-full resize-none bg-transparent px-5 pt-5 font-[family-name:var(--font-curiosity-display)] text-[clamp(1.15rem,2.4vw,1.6rem)] leading-[1.6] outline-none placeholder:text-star-faint/70"
              />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-night-rule px-4 py-3">
                {education ? (
                  /* A setting, not a second question: quiet, and remembered
                     between visits so a parent sets it once. */
                  <label className="flex items-center gap-1 text-[13px] text-star-faint">
                    做给
                    <span className="relative inline-flex items-center">
                      <select
                        value={targetAge}
                        onChange={(event) => onTargetAgeChange(Number(event.target.value))}
                        aria-label="孩子年龄"
                        className="cursor-pointer appearance-none rounded bg-transparent py-1 pl-1 pr-4 text-[13px] text-star-soft underline decoration-dotted underline-offset-4 outline-none transition hover:text-star focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moon"
                      >
                        {AGE_OPTIONS.map((age) => (
                          <option key={age} value={age} className="bg-night-raised text-star">
                            {age} 岁
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        className="pointer-events-none absolute right-0 size-3 text-star-faint"
                        aria-hidden="true"
                      />
                    </span>
                    的孩子
                  </label>
                ) : (
                  <span className="label-machine text-star-faint">⌘ + ENTER</span>
                )}
                <button
                  type="submit"
                  disabled={busy || draft.trim().length === 0}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-moon px-5 text-sm font-black text-moon-ink transition hover:bg-[color-mix(in_srgb,var(--moon)_86%,white)] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moon"
                >
                  {busy ? (
                    <>
                      <Loader2
                        className="size-4 animate-spin motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                      正在交给智能体
                    </>
                  ) : (
                    <>
                      {education ? '做给他看' : '开始生成'}
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </>
                  )}
                </button>
              </div>
            </div>
            {error && (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-[#e08a7a]/40 bg-[#2b1512] px-4 py-3 text-sm font-bold text-[#ffb9a6]"
              >
                {error}
              </p>
            )}
          </form>

          <ul
            className="mt-5 flex flex-wrap gap-x-5 gap-y-2"
            aria-label={education ? '试试这些问题' : '试试这些需求'}
          >
            {examples.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  onClick={() => onDraftChange(example)}
                  className="rounded text-[13px] text-star-faint underline-offset-4 transition hover:text-moon hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moon"
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-20 border-t border-night-rule pt-7">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="label-machine text-star-faint">问过的问题</h2>
            {projects.length > 0 && (
              <span className="label-machine text-star-faint">
                {projects.length > 8
                  ? `最近 8 个 · 共 ${projects.length}`
                  : `${projects.length} 个`}{' '}
                · 越亮改得越多
              </span>
            )}
          </div>
          {projects.length === 0 ? (
            <p className="mt-4 max-w-md text-sm leading-7 text-star-soft">
              第一颗星还没有亮。写下孩子最近问的一个问题，两三分钟后这里会多一次探索——之后每问一个，
              夜空就多一颗。
            </p>
          ) : (
            <div className="mt-5">
              <StudioSkyChart projects={projects} onOpenProject={onOpenProject} />
            </div>
          )}
        </section>

        <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-night-rule pt-5">
          <p className="text-xs text-star-faint">
            生成的页面是一份自包含的单文件网页，在隔离沙箱里预览，可以整页下载带走。
          </p>
          <button
            type="button"
            onClick={() => onModeChange(education ? 'general' : 'education')}
            className="rounded text-xs font-bold text-star-faint underline-offset-4 transition hover:text-star hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moon"
          >
            {education ? '也可以生成任意网页应用 →' : '← 回到孩子的问题'}
          </button>
        </footer>
      </div>
    </main>
  );
}
