'use client';

import { ArrowRight, Check, Home, Sparkles, Users } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

import type { TeamAssemblyArtifactV1 } from '@/lib/curiosity/agent-contracts';
import type { CuriosityExperienceSpecV1 } from '@/lib/curiosity/contracts';
import type { CuriosityParentSummary } from '@/lib/curiosity/runtime';

interface ExplorationCompletionProps {
  spec: CuriosityExperienceSpecV1;
  team: TeamAssemblyArtifactV1;
  speaker: TeamAssemblyArtifactV1['members'][number];
  summary: CuriosityParentSummary;
  onNewQuestion: () => void;
  onParentReview: () => void;
}

function toChildFacingFact(text: string): string {
  return text
    .replace('孩子最初猜的是', '你一开始猜的是')
    .replace('孩子最后选择的解释是', '你最后确认')
    .replace(/^孩子/, '你');
}

export function ExplorationCompletion({
  spec,
  team,
  speaker,
  summary,
  onNewQuestion,
  onParentReview,
}: ExplorationCompletionProps) {
  const reducedMotion = useReducedMotion();
  const evidence = summary.facts
    .filter((fact) => fact.kind !== 'completion')
    .map((fact) => toChildFacingFact(fact.text));

  return (
    <section
      aria-labelledby="exploration-complete-title"
      className="relative isolate overflow-hidden rounded-b-[2rem] bg-[#081a33] px-5 py-10 text-white sm:px-8 sm:py-14"
    >
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-8 -z-10 size-64 -translate-x-1/2 rounded-full bg-[#ffd76a]/12 blur-3xl"
      />
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 140, damping: 22 }}
        className="mx-auto max-w-4xl"
      >
        <div className="text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full border-2 border-[#ffe08a] bg-[#ffd76a] text-[#173047] shadow-[0_0_0_10px_rgba(255,215,106,.08)]">
            <Check className="size-8" strokeWidth={3} aria-hidden="true" />
          </span>
          <p className="mt-6 text-xs font-black tracking-[.18em] text-[#ffe08a]">这次探索完成了</p>
          <h2
            id="exploration-complete-title"
            className="mx-auto mt-3 max-w-2xl text-balance text-3xl font-black leading-tight sm:text-5xl"
          >
            你把一个“为什么”变成了自己的发现
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#c9dcec]">
            {spec.presentation.completion}
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
          <section className="rounded-[1.75rem] border border-[#ffe08a]/25 bg-[#102d4b] p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <Sparkles className="size-5 text-[#ffe08a]" aria-hidden="true" />
              <h3 className="text-lg font-black">你的发现轨迹</h3>
            </div>
            <ol className="relative mt-6 space-y-5 before:absolute before:bottom-3 before:left-[11px] before:top-3 before:w-px before:bg-[#ffe08a]/30">
              {evidence.map((fact, index) => (
                <li key={fact} className="relative flex gap-4">
                  <span className="relative z-10 mt-1 grid size-6 shrink-0 place-items-center rounded-full border border-[#ffe08a]/60 bg-[#173b5e] text-[11px] font-black text-[#ffe08a]">
                    {index + 1}
                  </span>
                  <p className="text-sm font-bold leading-6 text-[#eef7ff]">{fact}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="flex flex-col justify-between rounded-[1.75rem] border border-white/12 bg-white/[.06] p-6 sm:p-8">
            <div>
              <p className="text-xs font-black tracking-[.14em] text-[#9ed9de]">
                {speaker.name}的最后一句话
              </p>
              <p className="mt-4 text-xl font-black leading-8 text-[#fff8dc]">
                “你没有直接背答案，而是先猜、再观察，最后用证据找到了原因。”
              </p>
            </div>
            <div className="mt-8 border-t border-white/10 pt-5">
              <p className="flex items-center gap-2 text-xs font-black text-[#c8dceb]">
                <Users className="size-4" aria-hidden="true" />
                {team.teamName}和你一起完成
              </p>
              <div className="mt-3 flex -space-x-1" aria-label="完成探索的小队成员">
                {team.members.map((member) => (
                  <span
                    key={member.id}
                    title={member.name}
                    className="grid size-10 place-items-center rounded-full border-2 border-[#10243e] text-lg"
                    style={{ backgroundColor: member.color }}
                  >
                    <span aria-hidden="true">{member.avatar}</span>
                    <span className="sr-only">{member.name}</span>
                  </span>
                ))}
              </div>
            </div>
          </section>
        </div>

        <div className="mx-auto mt-8 grid max-w-2xl gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onParentReview}
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-[#fff0a8] bg-[#ffd76a] px-5 text-base font-black text-[#173047] shadow-[0_5px_0_#b87d24] transition hover:bg-[#ffe393] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ffe08a] active:translate-y-0.5 active:shadow-[0_3px_0_#b87d24]"
          >
            <Users className="size-5" aria-hidden="true" />
            和家长一起回顾
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onNewQuestion}
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/[.07] px-5 text-base font-black text-white transition hover:bg-white/[.12] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ffe08a] active:bg-white/[.16]"
          >
            <Home className="size-5" aria-hidden="true" />
            再探索一个问题
          </button>
        </div>
      </motion.div>
    </section>
  );
}
