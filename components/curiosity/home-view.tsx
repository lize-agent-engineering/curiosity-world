'use client';

import type { FormEvent } from 'react';
import { ArrowRight, Clock3, MapPin, Moon, Telescope } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { CollaborationProgress } from './collaboration-progress';
import type {
  CuriosityPipelineArtifact,
  CuriosityPipelineStage,
} from '@/lib/curiosity/agent-pipeline';

export interface CuriosityHomeValues {
  question: string;
  age: number;
  interests: string;
}

export interface CuriosityGenerationStatus {
  step: string;
  progress: number;
  message: string;
  completedStages?: CuriosityPipelineStage[];
  artifacts?: CuriosityPipelineArtifact[];
}

export interface CuriosityHomeRecentItem {
  id: string;
  question: string;
  summary: string;
  age: number;
  updatedAt: string;
}

interface CuriosityHomeViewProps {
  values: CuriosityHomeValues;
  status: CuriosityGenerationStatus | null;
  recent: CuriosityHomeRecentItem[];
  error: string | null;
  onChange: <K extends keyof CuriosityHomeValues>(field: K, value: CuriosityHomeValues[K]) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onOpenExperience: (id: string) => void;
}

const presets = ['为什么月亮看起来会跟着我们？', '桥为什么不会倒？', '影子为什么会变长？'];

export function CuriosityHomeView({
  values,
  status,
  recent,
  error,
  onChange,
  onSubmit,
  onOpenExperience,
}: CuriosityHomeViewProps) {
  return (
    <main className="min-h-dvh overflow-x-hidden bg-[#08152d] text-[#f8f4e8]">
      <div className="relative isolate mx-auto min-h-dvh max-w-[1440px] px-5 pb-12 pt-5 sm:px-9 sm:pt-7 lg:px-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-90 [background-image:radial-gradient(circle_at_84%_11%,rgba(255,226,145,.16),transparent_17%),radial-gradient(circle_at_14%_68%,rgba(72,145,181,.16),transparent_32%),linear-gradient(150deg,#08152d_10%,#0f2747_55%,#07152b)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-[#e7c66c]/60 to-transparent"
        />

        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full border border-[#f6e9ba]/30 bg-[#f6e9ba]/10 text-[#ffe08a]">
              <Moon className="size-5 fill-current" aria-hidden="true" />
            </span>
            <div>
              <p className="font-[var(--font-curiosity-display)] text-lg leading-none text-[#fff4c7]">
                为什么世界
              </p>
              <p className="mt-1 text-[10px] font-bold tracking-[.22em] text-[#8fbed0]">
                CURIOUS BY NIGHT
              </p>
            </div>
          </div>
          <p className="hidden items-center gap-2 text-xs font-semibold text-[#b9d5df] sm:flex">
            <Telescope className="size-4 text-[#ffe08a]" aria-hidden="true" />
            一次只追一个为什么
          </p>
        </header>

        <section className="grid items-center gap-10 pb-10 pt-12 lg:grid-cols-[.96fr_1.04fr] lg:gap-16 lg:pb-16 lg:pt-20">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-sm font-bold tracking-[.16em] text-[#ffe08a]">
              <span className="h-px w-8 bg-current" /> 今晚的观察
            </p>
            <h1
              aria-label="把孩子的“为什么”变成亲手发现。"
              className="mt-5 max-w-xl font-[var(--font-curiosity-display)] text-[clamp(3.25rem,7vw,6rem)] leading-[.91] tracking-[-.055em] text-[#fff9e6]"
            >
              <span aria-hidden="true" className="block">
                把孩子的
                <br />
                “为什么”
              </span>
              <span aria-hidden="true" className="mt-3 block text-[.76em] text-[#ffdc72]">
                变成亲手发现。
              </span>
            </h1>
            <p className="mt-7 max-w-lg text-base leading-8 text-[#c7dbe3] sm:text-lg">
              从一个真问题出发，先猜一猜，再走一走、看一看。答案不急着说，发现会自己出现。
            </p>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-[#a9c9d5]">
              <span className="flex items-center gap-2">
                <MapPin className="size-4 text-[#ffdc72]" aria-hidden="true" /> 从身边的事开始
              </span>
              <span className="flex items-center gap-2">
                <Clock3 className="size-4 text-[#ffdc72]" aria-hidden="true" /> 一次只做一件事
              </span>
            </div>
          </div>

          <figure
            role="img"
            aria-label="月亮、路灯和散步中的孩子组成的夜间观察窗"
            className="relative mx-auto h-[330px] w-full max-w-[620px] overflow-hidden rounded-[2rem] border border-[#d5e7e9]/20 bg-[#102c4d] shadow-[0_30px_80px_rgba(0,0,0,.28)] sm:h-[390px]"
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 [background-image:radial-gradient(circle_at_14%_18%,rgba(241,249,252,.8)_0_1px,transparent_1.6px),radial-gradient(circle_at_42%_12%,rgba(241,249,252,.7)_0_1px,transparent_1.6px),radial-gradient(circle_at_68%_26%,rgba(241,249,252,.55)_0_1px,transparent_1.6px),linear-gradient(180deg,#173f68_0%,#0b2643_67%,#102d36_68%)]"
            />
            <div
              aria-hidden="true"
              className="absolute right-[13%] top-[13%] size-24 rounded-full bg-[#fff0ae] shadow-[0_0_0_14px_rgba(255,240,174,.06),0_0_60px_rgba(255,233,151,.35)] sm:size-32"
            />
            <div
              aria-hidden="true"
              className="absolute bottom-0 left-[-10%] h-[38%] w-[75%] rounded-t-[60%] bg-[#173d45]"
            />
            <div
              aria-hidden="true"
              className="absolute bottom-[-14%] right-[-7%] h-[43%] w-[83%] rotate-[-7deg] rounded-t-[55%] bg-[#1e4a50]"
            />
            <div
              aria-hidden="true"
              className="absolute bottom-0 left-[14%] h-[42%] w-3 rounded-t-full bg-[#172d39] before:absolute before:-left-7 before:top-0 before:h-7 before:w-16 before:rounded-full before:bg-[#ffe08a] before:shadow-[0_0_24px_rgba(255,224,138,.72)]"
            />
            <div
              aria-hidden="true"
              className="absolute bottom-[8%] left-[55%] h-16 w-9 rounded-t-[1rem] bg-[#e66e5b] before:absolute before:-top-6 before:left-1/2 before:size-7 before:-translate-x-1/2 before:rounded-full before:bg-[#f6c4a2]"
            />
            <div className="absolute bottom-5 left-5 rounded-full border border-white/15 bg-[#071b31]/70 px-3 py-2 text-[10px] font-bold tracking-[.17em] text-[#d7edf1] backdrop-blur-sm">
              LOOK CLOSELY
            </div>
          </figure>
        </section>

        <section className="mx-auto max-w-5xl space-y-8">
          <form
            data-home-creation="centered"
            onSubmit={onSubmit}
            className="relative mx-auto w-full overflow-hidden rounded-[1.8rem] border border-[#d8cda4]/40 bg-[#faf5e7] p-5 text-[#17283d] shadow-[0_24px_55px_rgba(0,0,0,.18)] sm:p-8 lg:p-10"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[#d6bd69]/60"
            />
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-xs font-bold tracking-[.16em] text-[#856c31]">
                  从一个真问题出发
                </p>
                <label
                  htmlFor="curiosity-question"
                  className="mt-2 block text-xl font-black tracking-tight sm:text-2xl"
                >
                  孩子正在好奇什么？
                </label>
              </div>
              <span className="hidden rounded-full border border-[#d8cda4] px-3 py-1 text-xs font-bold text-[#6f603b] sm:block">
                6–10 岁
              </span>
            </div>
            <textarea
              id="curiosity-question"
              value={values.question}
              onChange={(event) => onChange('question', event.target.value)}
              rows={3}
              required
              className="mt-5 w-full resize-none rounded-2xl border border-[#aebfc4] bg-white/70 px-4 py-4 text-lg font-semibold leading-7 outline-none transition placeholder:text-[#8b9a9e] focus:border-[#234d69] focus:ring-4 focus:ring-[#234d69]/10"
            />
            <div className="mt-3 flex flex-wrap gap-2" aria-label="试试这些问题">
              {presets.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => onChange('question', question)}
                  className="min-h-11 rounded-full border border-[#bcc8c6] bg-white/60 px-4 py-2 text-left text-sm font-bold text-[#294b60] transition hover:border-[#d0a936] hover:bg-[#fffdf5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#234d69]"
                >
                  {question}
                </button>
              ))}
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-bold text-[#314657]">
                孩子年龄
                <input
                  aria-label="孩子年龄"
                  type="number"
                  min={6}
                  max={10}
                  value={values.age}
                  onChange={(event) => onChange('age', Number(event.target.value))}
                  className="mt-2 h-12 w-full rounded-xl border border-[#aebfc4] bg-white/70 px-3 text-base outline-none transition focus:border-[#234d69] focus:ring-4 focus:ring-[#234d69]/10"
                />
              </label>
              <label className="text-sm font-bold text-[#314657]">
                最近感兴趣的事
                <input
                  aria-label="兴趣"
                  value={values.interests}
                  onChange={(event) => onChange('interests', event.target.value)}
                  placeholder="散步、星空"
                  className="mt-2 h-12 w-full rounded-xl border border-[#aebfc4] bg-white/70 px-3 text-base outline-none transition placeholder:text-[#8b9a9e] focus:border-[#234d69] focus:ring-4 focus:ring-[#234d69]/10"
                />
              </label>
            </div>
            {status && <CollaborationProgress status={status} />}
            {error && (
              <p
                role="alert"
                className="mt-5 rounded-xl border border-[#d98c79] bg-[#fff0e9] p-4 text-sm font-bold text-[#9b3e2e]"
              >
                这次探索还没有生成完成，请重新生成。
              </p>
            )}
            <Button
              type="submit"
              disabled={Boolean(status)}
              className="mt-6 h-14 w-full rounded-2xl bg-[#d87355] text-base font-black text-white shadow-[0_5px_0_#a94d3a] transition hover:translate-y-[1px] hover:bg-[#c9644a] hover:shadow-[0_4px_0_#a94d3a]"
            >
              {error ? '重新生成这次探索' : '开始这次探索'} <ArrowRight className="size-5" />
            </Button>
          </form>

          <aside
            data-home-history="stacked"
            className="rounded-[1.8rem] border border-white/12 bg-[#102543]/70 p-5 backdrop-blur-sm sm:p-7 lg:p-8"
          >
            <p className="text-xs font-bold tracking-[.16em] text-[#a9d5df]">探索记录</p>
            <h2 className="mt-2 text-2xl font-black text-[#fff7dc]">继续上次发现</h2>
            {recent.length === 0 ? (
              <p className="mt-4 max-w-sm text-sm leading-7 text-[#bed4dc]">
                第一次探索完成后，你可以回到这里，沿着刚才的发现继续往下走。
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                {recent.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => onOpenExperience(item.id)}
                    className="group flex min-h-28 w-full items-center justify-between gap-5 rounded-2xl border border-white/10 bg-white/[.06] p-5 text-left transition hover:border-[#ffe08a]/45 hover:bg-white/[.1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffe08a] sm:p-6"
                  >
                    <span className="min-w-0">
                      <span className="block text-lg font-black leading-7 text-[#fff8e7] sm:text-xl">
                        {item.summary}
                      </span>
                      <span className="mt-2 block text-sm text-[#bdd2da]">
                        原问题：{item.question}
                      </span>
                      <span className="mt-2 block text-xs text-[#89afbf]">
                        {item.age} 岁 · {new Date(item.updatedAt).toLocaleDateString('zh-CN')}
                      </span>
                    </span>
                    <ArrowRight
                      className="size-5 shrink-0 text-[#ffe08a] transition-transform group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}
