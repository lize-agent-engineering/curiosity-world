'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';

import type { StudioTurn, StudioTurnArtifacts } from '@/lib/studio/client';
import { StudioCodeStream } from './code-stream';
import { StudioStageProgress } from './stage-progress';

const EDIT_MODE_LABEL: Record<string, string> = {
  create: '全新生成',
  patch: '定点修改',
  rewrite: '整页重写',
};

function Disclosure({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-white/8 pt-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-1.5 text-left text-xs font-bold text-[#93aec0] transition hover:text-[#e6eef4]"
      >
        {open ? (
          <ChevronDown className="size-3.5" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3.5" aria-hidden="true" />
        )}
        {title}
      </button>
      {open && <div className="mt-2 text-xs leading-6 text-[#bcd3de]">{children}</div>}
    </div>
  );
}

function PlanDetails({ artifacts }: { artifacts: StudioTurnArtifacts }) {
  const plan = artifacts.plan;
  if (!plan) return null;
  return (
    <Disclosure title="方案（planner 的中间产物）">
      <p className="font-bold text-[#e6eef4]">
        {plan.appName} · {plan.appKind}
      </p>
      <p className="mt-1">{plan.summary}</p>
      <ul className="mt-2 list-disc space-y-1 pl-4">
        {plan.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <p className="mt-2 text-[#93aec0]">布局：{plan.layout}</p>
      <p className="text-[#93aec0]">
        数据留存：{plan.persistence === 'local-storage' ? 'localStorage，刷新不丢' : '不留存'}
      </p>
    </Disclosure>
  );
}

function ReviewDetails({ artifacts }: { artifacts: StudioTurnArtifacts }) {
  const review = artifacts.review;
  if (!review) return null;
  return (
    <Disclosure title={`审查结论（reviewer）：${review.verdict === 'pass' ? '通过' : '要求修改'}`}>
      {review.findings.length === 0 ? (
        <p>没有发现需要返工的问题。</p>
      ) : (
        <ul className="space-y-1">
          {review.findings.map((finding) => (
            <li key={finding.detail}>
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-[#ffe08a]">
                {finding.severity === 'blocker' ? '必改' : '建议'}
              </span>{' '}
              {finding.detail}
            </li>
          ))}
        </ul>
      )}
    </Disclosure>
  );
}

function EditDetails({ artifacts }: { artifacts: StudioTurnArtifacts }) {
  const editMode = artifacts.editMode;
  if (!editMode) return null;
  return (
    <Disclosure title={`修改方式：${EDIT_MODE_LABEL[editMode]}`}>
      {editMode === 'patch' && <p>编辑块直接命中，未改动无关代码。</p>}
      {editMode === 'rewrite' && <p>定点编辑块没有对上原文，已回退为整页重写并保留原有功能。</p>}
      {editMode === 'create' && <p>这是这个项目的第一版，整页生成。</p>}
      {artifacts.editBlockFailures && artifacts.editBlockFailures.length > 0 && (
        <p className="mt-1 text-[#93aec0]">失配原因：{artifacts.editBlockFailures.join('、')}</p>
      )}
    </Disclosure>
  );
}

interface StudioGenerationCardProps {
  turn: StudioTurn;
  onRetry?: () => void;
  onOpenVersion?: (versionId: string) => void;
}

export function StudioGenerationCard({ turn, onRetry, onOpenVersion }: StudioGenerationCardProps) {
  const job = turn.job;
  const failed = job?.status === 'failed';
  const artifacts = turn.artifacts ?? {};
  const hasArtifacts = Boolean(artifacts.plan || artifacts.review || artifacts.editMode);
  return (
    <article className="space-y-3">
      <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-[#ffe08a] px-4 py-2.5 text-sm font-semibold leading-6 text-[#26200c]">
        {turn.request}
      </p>

      {job && !job.done && (
        <div className="rounded-2xl border border-white/10 bg-[#0c1e35] p-4">
          <StudioStageProgress job={job} />
          <StudioCodeStream code={turn.code ?? ''} streaming={job.stage === 'coding'} />
          <PlanDetails artifacts={artifacts} />
        </div>
      )}

      {failed && job && (
        <div className="rounded-2xl border border-[#e08a7a]/40 bg-[#2b1512] p-4">
          <p className="flex items-center gap-2 text-sm font-black text-[#ffb9a6]">
            <AlertTriangle className="size-4" aria-hidden="true" /> 这一轮没有生成成功
          </p>
          <p className="mt-2 text-xs leading-6 text-[#f0cdc4]">{job.message}</p>
          {job.errorCode && (
            <p className="mt-1 font-mono text-[11px] text-[#c99a8e]">{job.errorCode}</p>
          )}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#e08a7a] px-3 text-xs font-black text-[#2b1512] transition hover:bg-[#eda495] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffe08a]"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" /> 用同样的要求再试一次
            </button>
          )}
        </div>
      )}

      {(turn.reply || (job?.done && !failed)) && (
        <div className="rounded-2xl border border-white/10 bg-[#0c1e35] p-4">
          <p className="text-sm font-semibold leading-6 text-[#e6eef4]">
            {turn.reply ?? job?.result?.summary}
          </p>
          {job?.done && !failed && <StudioCodeStream code={turn.code ?? ''} streaming={false} />}
          {hasArtifacts && !failed && (
            <div className="mt-3 space-y-2">
              <PlanDetails artifacts={artifacts} />
              <EditDetails artifacts={artifacts} />
              <ReviewDetails artifacts={artifacts} />
            </div>
          )}
          {turn.versionId && onOpenVersion && (
            <button
              type="button"
              onClick={() => onOpenVersion(turn.versionId!)}
              className="mt-3 text-xs font-bold text-[#ffe08a] underline-offset-4 hover:underline"
            >
              在预览里打开这一版
            </button>
          )}
        </div>
      )}
    </article>
  );
}
