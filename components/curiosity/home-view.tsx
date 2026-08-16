'use client';

import type { FormEvent } from 'react';
import { ArrowRight, Moon, Sparkles } from 'lucide-react';

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

interface CuriosityHomeViewProps {
  values: CuriosityHomeValues;
  status: CuriosityGenerationStatus | null;
  recent: Array<{ id: string; question: string; age: number; updatedAt: string }>;
  error: string | null;
  onChange: <K extends keyof CuriosityHomeValues>(field: K, value: CuriosityHomeValues[K]) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onOpenExperience: (id: string) => void;
}

export function CuriosityHomeView({
  values,
  status,
  recent,
  error,
  onChange,
  onSubmit,
  onOpenExperience,
}: CuriosityHomeViewProps) {
  const presets = ['为什么月亮看起来会跟着我们？', '桥为什么不会倒？', '影子为什么会变长？'];
  return (
    <main className="min-h-screen overflow-hidden bg-[#07152f] text-[#f5faff]">
      <div className="relative isolate mx-auto min-h-screen max-w-[1500px] px-5 pb-16 pt-5 sm:px-9 lg:px-14">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_78%_18%,rgba(46,102,162,.55),transparent_30%),radial-gradient(circle_at_12%_80%,rgba(255,128,102,.12),transparent_32%)]" />
        <header className="flex items-center">
          <div className="flex items-center gap-3 text-sm font-black tracking-[.18em] text-[#9edcff]">
            <span className="grid size-10 place-items-center rounded-full border border-white/15 bg-white/10">
              <Moon className="size-5 fill-[#ffd76a] text-[#ffd76a]" />
            </span>
            为什么世界
          </div>
        </header>

        <section className="grid items-center gap-10 pb-14 pt-12 lg:grid-cols-[1.03fr_.97fr] lg:pt-20">
          <div>
            <p className="mb-5 flex items-center gap-2 text-sm font-bold text-[#ffd76a]">
              <Sparkles className="size-4" /> 一次只认真回答一个为什么
            </p>
            <h1 className="max-w-3xl font-[var(--font-curiosity-display)] text-5xl font-black leading-[1.02] tracking-tight sm:text-7xl xl:text-[5.6rem]">
              把孩子的“为什么”
              <br />
              <span className="text-[#ffd76a]">变成亲手发现。</span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-8 text-[#c8dbef] sm:text-lg">
              输入一个真实问题，我们会把它编译成可预测、可操作、可迁移的探索。当前支持远近运动、平衡支撑与影子光路。
            </p>
          </div>

          <div
            className="relative mx-auto h-[360px] w-full max-w-xl overflow-hidden rounded-[2.2rem] border border-white/15 bg-gradient-to-b from-[#1b4d80] to-[#102b43] shadow-2xl shadow-black/35"
            aria-hidden="true"
          >
            <div className="absolute right-[17%] top-14 size-24 rounded-full bg-[#fff4bc] shadow-[0_0_55px_rgba(255,244,188,.55)]" />
            <div className="absolute -bottom-14 left-[14%] h-52 w-96 rotate-6 rounded-[50%] bg-[#163d49]" />
            <div className="absolute bottom-12 left-[22%] h-44 w-3 rounded-full bg-[#111c2d] before:absolute before:-left-6 before:-top-2 before:h-8 before:w-14 before:rounded-full before:bg-[#ffd76a] before:shadow-[0_0_25px_#ffd76a]" />
            <div className="absolute bottom-8 left-[58%] h-16 w-8 rounded-2xl bg-[#ff8066] before:absolute before:-top-5 before:left-1 before:size-6 before:rounded-full before:bg-[#ffd0ad]" />
            <div className="absolute bottom-0 h-10 w-full bg-[#0b201d]" />
            <p className="absolute bottom-5 right-7 text-xs font-black tracking-[.18em] text-white/60">
              MOVE · NOTICE · EXPLAIN
            </p>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
          <form
            onSubmit={onSubmit}
            className="rounded-[2rem] border border-white/12 bg-[#f5faff] p-6 text-[#07152f] shadow-2xl shadow-black/25 sm:p-8"
          >
            <label htmlFor="curiosity-question" className="text-lg font-black">
              孩子正在好奇什么？
            </label>
            <textarea
              id="curiosity-question"
              value={values.question}
              onChange={(event) => onChange('question', event.target.value)}
              rows={3}
              required
              className="mt-3 w-full resize-none rounded-2xl border border-[#adc5d9] bg-white px-4 py-4 text-lg font-semibold outline-none transition focus:border-[#1b4d80] focus:ring-4 focus:ring-[#1b4d80]/10"
            />
            <div className="mt-3 flex flex-wrap gap-2" aria-label="试试这些问题">
              {presets.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => onChange('question', question)}
                  className="min-h-11 rounded-full border border-[#adc5d9] bg-white px-4 py-2 text-left text-sm font-bold text-[#173d5d] transition hover:border-[#1b4d80] hover:bg-[#eaf4fb]"
                >
                  {question}
                </button>
              ))}
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-bold">
                孩子年龄（6–10 岁）
                <input
                  aria-label="孩子年龄"
                  type="number"
                  min={6}
                  max={10}
                  value={values.age}
                  onChange={(event) => onChange('age', Number(event.target.value))}
                  className="mt-2 h-12 w-full rounded-xl border border-[#adc5d9] px-3 outline-none focus:border-[#1b4d80]"
                />
              </label>
              <label className="text-sm font-bold">
                最近感兴趣的事
                <input
                  aria-label="兴趣"
                  value={values.interests}
                  onChange={(event) => onChange('interests', event.target.value)}
                  placeholder="散步、星空"
                  className="mt-2 h-12 w-full rounded-xl border border-[#adc5d9] px-3 outline-none focus:border-[#1b4d80]"
                />
              </label>
            </div>
            {status && <CollaborationProgress status={status} />}
            {error && (
              <p
                role="alert"
                className="mt-5 rounded-2xl bg-[#fff0ec] p-4 text-sm font-bold text-[#a33824]"
              >
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={Boolean(status)}
              className="mt-6 h-14 w-full rounded-2xl bg-[#ff8066] text-base font-black text-[#07152f] hover:bg-[#ff947d]"
            >
              生成这次探索 <ArrowRight className="size-5" />
            </Button>
          </form>

          <aside className="rounded-[2rem] border border-white/12 bg-white/[.07] p-6 sm:p-8">
            <h2 className="text-lg font-black">继续上次发现</h2>
            {recent.length === 0 ? (
              <p className="mt-3 text-sm leading-7 text-[#b8cde2]">
                第一次探索完成后，会在这台设备上恢复当前版本与行为摘要。
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {recent.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => onOpenExperience(item.id)}
                    className="w-full rounded-2xl border border-white/10 bg-white/[.06] p-4 text-left transition hover:border-[#ffd76a]/50 hover:bg-white/10"
                  >
                    <span className="block font-bold">{item.question}</span>
                    <span className="mt-2 block text-xs text-[#9fc0dd]">
                      {item.age} 岁 · {new Date(item.updatedAt).toLocaleDateString('zh-CN')}
                    </span>
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
