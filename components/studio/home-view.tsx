'use client';

import type { FormEvent } from 'react';
import { ArrowRight, Loader2, Moon, Sparkles, Wand2 } from 'lucide-react';

import type { StudioAppKind } from '@/lib/studio/contracts';
import type { StudioProjectSummary } from '@/lib/studio/client';

export const STUDIO_EXAMPLE_PROMPTS = [
  '做一个番茄钟，25 分钟专注、5 分钟休息，可以暂停和重置',
  '做一个贪吃蛇小游戏，键盘和手机都能玩',
  '做一个记账看板，展示本月各类支出占比和最近 7 天趋势',
  '做一个活动报名表单，提交后显示确认信息',
] as const;

const APP_KIND_LABEL: Record<StudioAppKind, string> = {
  tool: '工具',
  game: '游戏',
  dashboard: '看板',
  content: '内容',
  form: '表单',
  creative: '创作',
  general: '其它',
};

export interface StudioHomeViewProps {
  draft: string;
  busy: boolean;
  error: string | null;
  projects: StudioProjectSummary[];
  onDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onOpenProject: (projectId: string) => void;
  onOpenCuriosity: () => void;
}

export function StudioHomeView({
  draft,
  busy,
  error,
  projects,
  onDraftChange,
  onSubmit,
  onOpenProject,
  onOpenCuriosity,
}: StudioHomeViewProps) {
  return (
    <main className="min-h-dvh overflow-x-hidden bg-[#08152d] text-[#f2f7fa]">
      <div className="relative isolate mx-auto min-h-dvh max-w-[1180px] px-5 pb-16 pt-6 sm:px-9">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 [background-image:radial-gradient(circle_at_82%_8%,rgba(255,226,145,.14),transparent_20%),radial-gradient(circle_at_10%_62%,rgba(72,145,181,.16),transparent_34%),linear-gradient(150deg,#08152d_10%,#0f2747_55%,#07152b)]"
        />

        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full border border-[#f6e9ba]/30 bg-[#f6e9ba]/10 text-[#ffe08a]">
              <Wand2 className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-lg font-black leading-none text-[#fff4c7]">Curiosity Studio</p>
              <p className="mt-1 text-[10px] font-bold tracking-[.22em] text-[#8fbed0]">
                描述它 · 智能体生成 · 继续改
              </p>
            </div>
          </div>
        </header>

        <section className="pb-8 pt-14 sm:pt-20">
          <h1 className="max-w-3xl text-[clamp(2.4rem,5.6vw,4.2rem)] font-black leading-[1.04] tracking-[-.03em] text-[#fff9e6]">
            说出你想要的应用，
            <br />
            <span className="text-[#ffdc72]">这里直接把它做出来。</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-[#c7dbe3]">
            规划、编码、审查三个智能体接力完成一个能直接运行的网页应用。生成过程里代码是可见的，做完之后继续对话就能改——每一次修改都会留成一个版本，随时回滚。
          </p>

          <form onSubmit={onSubmit} className="mt-9 max-w-3xl">
            <div className="rounded-[1.4rem] border border-white/12 bg-[#0c1e35]/90 p-3 shadow-[0_24px_60px_rgba(0,0,0,.35)] focus-within:border-[#ffe08a]/60">
              <label htmlFor="studio-prompt" className="sr-only">
                描述你想要的应用
              </label>
              <textarea
                id="studio-prompt"
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                rows={3}
                required
                placeholder="例如：做一个记录每天喝水的应用，能看到本周完成情况，刷新不丢"
                className="w-full resize-none bg-transparent px-3 py-3 text-base leading-7 outline-none placeholder:text-[#6b8699]"
              />
              <div className="flex items-center justify-between gap-3 px-1 pb-1">
                <p className="text-xs text-[#7f9cae]">⌘/Ctrl + Enter 开始</p>
                <button
                  type="submit"
                  disabled={busy || draft.trim().length === 0}
                  className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#ffe08a] px-5 text-sm font-black text-[#26200c] transition hover:bg-[#ffd45f] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffe08a]"
                >
                  {busy ? (
                    <>
                      <Loader2
                        className="size-4 animate-spin motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                      正在创建
                    </>
                  ) : (
                    <>
                      开始生成 <ArrowRight className="size-4" aria-hidden="true" />
                    </>
                  )}
                </button>
              </div>
            </div>
            {error && (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-[#e08a7a]/40 bg-[#2b1512] p-3 text-sm font-bold text-[#ffb9a6]"
              >
                {error}
              </p>
            )}
          </form>

          <div className="mt-7 flex flex-wrap gap-2" aria-label="示例需求">
            {STUDIO_EXAMPLE_PROMPTS.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => onDraftChange(example)}
                className="min-h-11 rounded-full border border-white/12 bg-white/[.04] px-4 text-left text-sm font-semibold text-[#c7dbe3] transition hover:border-[#ffe08a]/50 hover:text-[#fff4c7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffe08a]"
              >
                {example}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-4">
          <h2 className="text-xs font-bold tracking-[.18em] text-[#8fbed0]">现成的模板</h2>
          <button
            type="button"
            onClick={onOpenCuriosity}
            className="group mt-3 flex w-full items-center gap-4 rounded-2xl border border-white/12 bg-[#102543]/70 p-5 text-left transition hover:border-[#ffe08a]/45 hover:bg-white/[.07] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffe08a] sm:max-w-xl"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f6e9ba]/10 text-[#ffe08a]">
              <Moon className="size-5 fill-current" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-black text-[#fff8e7]">
                为什么世界 · 儿童科普探索
              </span>
              <span className="mt-1 block text-sm leading-6 text-[#bdd2da]">
                另一条专用管线：把孩子的“为什么”变成可亲手操作的互动场景。
              </span>
            </span>
            <ArrowRight
              className="size-5 shrink-0 text-[#ffe08a] transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </button>
        </section>

        <section className="mt-12">
          <h2 className="text-xs font-bold tracking-[.18em] text-[#8fbed0]">最近的项目</h2>
          {projects.length === 0 ? (
            <p className="mt-3 max-w-xl text-sm leading-7 text-[#9fbccb]">
              还没有项目。三步就能跑完一次：在上面写一句你想要的应用（或点一个示例）→
              看着规划、编码、审查三个智能体把它做出来 → 继续对话让它改。第一版通常两到四分钟，
              中途代码是一行行写出来的。想先看看成品，就点上面的「为什么世界」模板。
            </p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onOpenProject(project.id)}
                  className="group flex min-h-32 flex-col rounded-2xl border border-white/10 bg-white/[.05] p-4 text-left transition hover:border-[#ffe08a]/45 hover:bg-white/[.09] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffe08a]"
                >
                  <span className="flex items-center gap-2">
                    <span className="rounded-full bg-[#ffe08a]/15 px-2 py-0.5 text-[10px] font-black text-[#ffe08a]">
                      {project.appKind ? APP_KIND_LABEL[project.appKind] : '生成中'}
                    </span>
                    {project.revision > 0 && (
                      <span className="text-[10px] font-bold text-[#7f9cae]">
                        v{project.revision}
                      </span>
                    )}
                  </span>
                  <span className="mt-2 line-clamp-2 text-base font-black leading-6 text-[#fff8e7]">
                    {project.title}
                  </span>
                  <span className="mt-1 line-clamp-2 text-xs leading-5 text-[#9fbccb]">
                    {project.summary ?? '还在生成第一版'}
                  </span>
                  <span className="mt-auto pt-3 text-[11px] text-[#6f8ea0]">
                    {new Date(project.updatedAt).toLocaleString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <footer className="mt-16 flex items-center gap-2 text-xs text-[#6f8ea0]">
          <Sparkles className="size-3.5" aria-hidden="true" />
          生成的应用是一份自包含的单文件网页，在隔离沙箱里预览。
        </footer>
      </div>
    </main>
  );
}
