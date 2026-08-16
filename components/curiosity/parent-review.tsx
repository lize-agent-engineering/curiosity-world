'use client';

import type { FormEvent } from 'react';
import { History, Link2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { CuriosityArchive } from '@/lib/curiosity/archive';
import type { CuriosityExperienceSpecV3 } from '@/lib/curiosity/experience-spec-v3';
import type { CuriosityVersionStatus, CuriosityVoiceEvidence } from '@/lib/curiosity/repository';
import type { CuriosityParentSummary } from '@/lib/curiosity/runtime';
import { CuriosityArchiveView } from './archive-view';

interface CuriosityParentReviewProps {
  spec: CuriosityExperienceSpecV3;
  revision: number;
  summary: CuriosityParentSummary;
  voiceEvents?: CuriosityVoiceEvidence[];
  archive?: CuriosityArchive;
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
  revision,
  summary,
  voiceEvents = [],
  archive,
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
      <section className="rounded-[1.75rem] border border-[#d8cda4]/40 bg-[#faf5e7] p-6 text-[#17283d] shadow-[0_18px_45px_rgba(0,0,0,.15)] sm:p-8">
        <p className="text-xs font-black tracking-[.18em] text-[#856c31]">
          观察回看 · 版本 {revision}
        </p>
        <h2 className="mt-3 text-3xl font-black">孩子实际做了什么</h2>
        <p className="mt-2 text-sm text-[#48647d]">这里只记录真实操作，不推断能力或掌握程度。</p>
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
            {voiceEvents.map((event) => (
              <p key={event.eventId} className="mt-3 font-bold">
                “{event.transcript}”
              </p>
            ))}
          </section>
        )}
        {archive && <CuriosityArchiveView archive={archive} />}
      </section>
      <div className="space-y-6">
        <section className="rounded-[1.75rem] border border-[#ffe08a]/25 bg-[#133657] p-6">
          <h2 className="text-xl font-black">换一种方式呈现</h2>
          <p className="mt-2 text-sm leading-6 text-[#c8dbef]">
            完整重生成会保留当前知识和历史版本。
          </p>
          <Button
            type="button"
            disabled={regenerating || revising}
            onClick={onRegenerate}
            className="mt-4 h-12 w-full rounded-xl bg-[#fff0ae] font-black text-[#173047] hover:bg-[#fff5c9]"
          >
            <RefreshCw className={`size-4 ${regenerating ? 'animate-spin' : ''}`} />
            {regenerating ? '正在换一种方式' : '换一种方式呈现'}
          </Button>
        </section>
        <form
          onSubmit={onSubmitRevision}
          className="rounded-[1.75rem] border border-white/12 bg-white/[.07] p-6"
        >
          <h2 className="text-xl font-black">做一个小修改</h2>
          <p className="mt-2 text-sm leading-6 text-[#b8cde2]">
            只修改年龄、提示、旁白、发现卡或限制说明；知识与场景类型保持不变。
          </p>
          <textarea
            aria-label="修改要求"
            value={revisionInstruction}
            onChange={(event) => onRevisionInstructionChange(event.target.value)}
            required
            rows={4}
            className="mt-4 w-full resize-none rounded-2xl border border-white/15 bg-[#091d3b] p-4 text-white"
          />
          {error && (
            <p role="alert" className="mt-3 text-sm font-bold text-[#ff9d89]">
              {error}
            </p>
          )}
          <Button
            disabled={revising}
            className="mt-4 h-12 w-full rounded-xl bg-[#d87355] font-black text-white hover:bg-[#c96349]"
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
          <p className="mt-4 text-xs text-[#9fc0dd]">当前限制：{spec.limitations[0]}</p>
        </section>
      </div>
    </div>
  );
}
