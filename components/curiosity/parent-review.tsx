'use client';

import type { FormEvent } from 'react';
import { FlaskConical, History, Link2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { CuriosityExperienceSpecV1 } from '@/lib/curiosity/contracts';
import type { CuriosityParentSummary } from '@/lib/curiosity/runtime';
import type { CuriosityVersionStatus } from '@/lib/curiosity/repository';
import type { ChildVoiceEventV1, RevisionImpactArtifactV1 } from '@/lib/curiosity/agent-contracts';
import type { CuriosityArchive } from '@/lib/curiosity/archive';
import { CuriosityArchiveView } from './archive-view';

interface CuriosityParentReviewProps {
  spec: CuriosityExperienceSpecV1;
  summary: CuriosityParentSummary;
  voiceEvents?: ChildVoiceEventV1[];
  archive?: CuriosityArchive;
  revisionImpact?: Pick<RevisionImpactArtifactV1, 'summary' | 'changedFields' | 'preservedFields'>;
  versions: Array<{
    id: string;
    revision: number;
    status: CuriosityVersionStatus;
    createdAt: string;
  }>;
  revisionInstruction: string;
  revising: boolean;
  regenerating: boolean;
  error: string | null;
  onRevisionInstructionChange: (value: string) => void;
  onSubmitRevision: (event: FormEvent<HTMLFormElement>) => void;
  onRegenerate: () => void;
  onSelectVersion: (versionId: string) => void;
}

export function CuriosityParentReview({
  spec,
  summary,
  voiceEvents = [],
  archive,
  revisionImpact,
  versions,
  revisionInstruction,
  revising,
  regenerating,
  error,
  onRevisionInstructionChange,
  onSubmitRevision,
  onRegenerate,
  onSelectVersion,
}: CuriosityParentReviewProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
      <section className="rounded-[1.75rem] bg-[#f5faff] p-6 text-[#07152f] sm:p-8">
        <p className="text-xs font-black tracking-[.18em] text-[#1b4d80]">
          PARENT RECAP · 版本 {spec.revision}
        </p>
        <h2 className="mt-3 text-3xl font-black">孩子实际做了什么</h2>
        <p className="mt-2 text-sm text-[#48647d]">这里只归约行为事实，不推断孩子的能力或结论。</p>
        <div className="mt-6 space-y-3">
          {summary.facts.length === 0 ? (
            <p className="rounded-2xl bg-white p-4 text-sm">还没有收到互动事件。</p>
          ) : (
            summary.facts.map((fact) => (
              <article
                key={`${fact.kind}-${fact.eventIds.join('-')}`}
                className="rounded-2xl border border-[#cfdeea] bg-white p-4"
              >
                <p className="font-bold">{fact.text}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {fact.eventIds.map((id) => (
                    <code
                      key={id}
                      className="rounded-full bg-[#e7f2fb] px-2 py-1 text-[11px] text-[#315773]"
                    >
                      <Link2 className="mr-1 inline size-3" />
                      {id}
                    </code>
                  ))}
                </div>
              </article>
            ))
          )}
        </div>
        {voiceEvents.length > 0 && (
          <section className="mt-6 rounded-2xl border border-[#cfdeea] bg-white p-5">
            <h3 className="font-black">语音识别记录</h3>
            <p className="mt-1 text-xs text-[#48647d]">
              这里只记录识别文字，不据此判断孩子的表现。
            </p>
            <div className="mt-3 space-y-3">
              {voiceEvents.map((event) => (
                <article key={event.eventId}>
                  <p className="font-bold">“{event.transcript}”</p>
                  <code className="mt-2 inline-block rounded-full bg-[#e7f2fb] px-2 py-1 text-[11px] text-[#315773]">
                    <Link2 className="mr-1 inline size-3" />
                    {event.eventId}
                  </code>
                </article>
              ))}
            </div>
          </section>
        )}
        {archive ? (
          <CuriosityArchiveView archive={archive} />
        ) : (
          <div className="mt-6 rounded-2xl border border-[#ffd76a] bg-[#fff8d9] p-5">
            <p className="flex items-center gap-2 text-sm font-black">
              <FlaskConical className="size-4" />
              来自知识包的现实观察建议
            </p>
            <p className="mt-2 leading-7">{summary.recommendation}</p>
            {spec.tabletopExperiment && (
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
                {spec.tabletopExperiment.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
          </div>
        )}
      </section>
      <div className="space-y-6">
        <section className="rounded-[1.75rem] border border-[#80d8ff]/35 bg-[#1b4d80]/35 p-6">
          <h2 className="text-xl font-black">还没听懂？换一种讲法</h2>
          <p className="mt-2 text-sm leading-6 text-[#c8dbef]">
            重新召集各个 Agent，从不同生活情境设计一套新的互动探索；当前版本会保留在历史中。
          </p>
          <Button
            type="button"
            disabled={regenerating || revising}
            onClick={onRegenerate}
            className="mt-4 h-12 w-full rounded-xl bg-[#80d8ff] font-black text-[#07152f] hover:bg-[#a4e4ff]"
          >
            <RefreshCw className={`size-4 ${regenerating ? 'animate-spin' : ''}`} />
            {regenerating ? '正在换一个角度' : '换个角度再讲一遍'}
          </Button>
        </section>
        {revisionImpact && (
          <section className="rounded-[1.75rem] border border-[#ffd76a]/35 bg-[#ffd76a]/10 p-6">
            <p className="text-xs font-black tracking-[.16em] text-[#ffd76a]">修改影响</p>
            <p className="mt-2 font-bold">{revisionImpact.summary}</p>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <p className="font-black text-[#ffcf67]">已改变</p>
                <ul className="mt-2 space-y-1 text-[#e7f2fb]">
                  {revisionImpact.changedFields.map((field) => (
                    <li key={field}>{field}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-black text-[#9fd8b8]">保持不变</p>
                <ul className="mt-2 space-y-1 text-[#e7f2fb]">
                  {revisionImpact.preservedFields.map((field) => (
                    <li key={field}>{field}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}
        <form
          onSubmit={onSubmitRevision}
          className="rounded-[1.75rem] border border-white/12 bg-white/[.07] p-6"
        >
          <h2 className="text-xl font-black">做一个受控修改</h2>
          <p className="mt-2 text-sm leading-6 text-[#b8cde2]">
            支持年龄适配、精简文字、调整白名单任务与加入桌上远近实验。
          </p>
          <textarea
            aria-label="修改要求"
            value={revisionInstruction}
            onChange={(event) => onRevisionInstructionChange(event.target.value)}
            required
            rows={4}
            placeholder="例如：改成适合 6 岁，并加入桌上远近实验"
            className="mt-4 w-full resize-none rounded-2xl border border-white/15 bg-[#091d3b] p-4 text-white outline-none focus:border-[#ffd76a]"
          />
          {error && (
            <p role="alert" className="mt-3 text-sm font-bold text-[#ff9d89]">
              {error}
            </p>
          )}
          <Button
            disabled={revising}
            className="mt-4 h-12 w-full rounded-xl bg-[#ffd76a] font-black text-[#07152f] hover:bg-[#ffe397]"
          >
            <RefreshCw className={`size-4 ${revising ? 'animate-spin' : ''}`} />
            {revising ? '正在校验候选版本' : '生成候选版本'}
          </Button>
        </form>
        <section className="rounded-[1.75rem] border border-white/12 bg-white/[.07] p-6">
          <h2 className="flex items-center gap-2 font-black">
            <History className="size-4" />
            探索历史
          </h2>
          <div className="mt-4 space-y-2">
            {versions.map((version) => (
              <button
                type="button"
                key={version.id}
                onClick={() => onSelectVersion(version.id)}
                className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-[#091d3b] px-4 py-3 text-left text-sm"
              >
                <span>回看版本 {version.revision}</span>
                <span className="text-xs text-[#9fc0dd]">{version.status}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
