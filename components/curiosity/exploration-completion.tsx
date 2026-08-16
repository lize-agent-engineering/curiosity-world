'use client';

import { ArrowRight, Check, Home, Sparkles } from 'lucide-react';

import type { StoryDesignArtifactV1 } from '@/lib/curiosity/agent-contracts';
import type { CuriosityExperienceSpecV1 } from '@/lib/curiosity/contracts';
import type { CuriosityParentSummary } from '@/lib/curiosity/runtime';

interface ExplorationCompletionProps {
  spec: CuriosityExperienceSpecV1;
  presentation: StoryDesignArtifactV1;
  summary: CuriosityParentSummary;
  onNewQuestion: () => void;
  onParentReview: () => void;
}

export function ExplorationCompletion({
  spec,
  presentation,
  summary,
  onNewQuestion,
  onParentReview,
}: ExplorationCompletionProps) {
  const evidence = summary.facts.filter((fact) => fact.kind !== 'completion');
  return (
    <section
      aria-labelledby="exploration-complete-title"
      className="rounded-b-[2rem] bg-[#081a33] px-5 py-10 text-white sm:px-8"
    >
      <div className="mx-auto max-w-4xl">
        <div className="text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-[#ffd76a] text-[#173047]">
            <Check className="size-8" aria-hidden="true" />
          </span>
          <h2 id="exploration-complete-title" className="mt-5 text-3xl font-black">
            你把一个“为什么”变成了自己的发现
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-[#c9dcec]">
            {presentation.completion ?? spec.presentation.completion}
          </p>
        </div>
        <section className="mt-8 rounded-[1.75rem] border border-[#ffe08a]/25 bg-[#102d4b] p-6">
          <h3 className="flex items-center gap-2 text-lg font-black">
            <Sparkles className="size-5 text-[#ffe08a]" />
            你的发现轨迹
          </h3>
          <ol className="mt-5 space-y-3">
            {evidence.map((fact, index) => (
              <li key={`${fact.kind}-${index}`} className="text-sm font-bold">
                {index + 1}. {fact.text}
              </li>
            ))}
          </ol>
        </section>
        {presentation.discoveryPrompts.length > 0 && (
          <section className="mt-5 rounded-[1.75rem] border border-white/12 bg-white/[.06] p-6">
            <h3 className="font-black">还想发现什么？这些卡片都可以跳过</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {presentation.discoveryPrompts.map((card) => (
                <article key={card.id} className="rounded-2xl bg-[#163b5f] p-4 text-sm font-bold">
                  {card.prompt}
                </article>
              ))}
            </div>
          </section>
        )}
        <div className="mx-auto mt-8 grid max-w-2xl gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onParentReview}
            className="min-h-14 rounded-2xl bg-[#ffd76a] px-5 font-black text-[#173047]"
          >
            一起回顾 <ArrowRight className="ml-2 inline size-4" />
          </button>
          <button
            type="button"
            onClick={onNewQuestion}
            className="min-h-14 rounded-2xl border border-white/20 px-5 font-black"
          >
            <Home className="mr-2 inline size-5" />
            再探索一个问题
          </button>
        </div>
      </div>
    </section>
  );
}
