'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Moon, Play, ScrollText } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { z } from 'zod';

import { CuriosityParentReview } from '@/components/curiosity/parent-review';
import { ReviewedNarrationPanel } from '@/components/curiosity/reviewed-narration-panel';
import { CuriosityRuntimeFrame } from '@/components/curiosity/runtime-frame';
import { Button } from '@/components/ui/button';
import { buildCuriosityArchive } from '@/lib/curiosity/archive';
import {
  getCuriosityApiHeaders,
  getCuriosityRepository,
  hydrateCuriosityExperience,
  readApiJson,
  syncCuriosityExperience,
} from '@/lib/curiosity/client';
import {
  curiosityExperienceSpecV3Schema,
  type CuriosityEventTypeV3,
  type CuriosityEventV3,
} from '@/lib/curiosity/experience-spec-v3';
import {
  CURIOSITY_GENERATION_POLL_INTERVAL_MS,
  CURIOSITY_GENERATION_TIMEOUT_MS,
  curiosityGenerationPollLimit,
} from '@/lib/curiosity/live-timing';
import { selectReviewedNarration } from '@/lib/curiosity/narration-library';
import type { CuriosityExperienceAggregate } from '@/lib/curiosity/repository';
import { summarizeCuriosityEvents } from '@/lib/curiosity/runtime';
import { restoreCuriositySceneState } from '@/lib/curiosity/scenes/registry';

type Mode = 'child' | 'parent';
const storedRowsSchema = z.array(z.record(z.string(), z.unknown()));

export default function CuriosityExperiencePage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const experienceId = params.id;
  const initialCandidateId = search.get('candidate');
  const [aggregate, setAggregate] = useState<CuriosityExperienceAggregate | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialCandidateId);
  const [events, setEvents] = useState<CuriosityEventV3[]>([]);
  const [mode, setMode] = useState<Mode>('child');
  const [instruction, setInstruction] = useState('');
  const [reflection, setReflection] = useState('');
  const [revising, setRevising] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [narrationStarted, setNarrationStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (preferredId?: string) => {
      let next = await getCuriosityRepository().getExperience(experienceId);
      if (!next && (await hydrateCuriosityExperience(experienceId))) {
        next = await getCuriosityRepository().getExperience(experienceId);
      }
      if (!next) throw new Error('EXPERIENCE_NOT_FOUND: 这台设备上没有该体验。');
      let picked =
        next.versions.find((version) => version.id === preferredId) ??
        next.versions.find((version) => version.id === next!.experience.activeVersionId) ??
        next.versions.at(-1);
      if (!picked) throw new Error('VERSION_NOT_FOUND: 体验没有可用版本。');
      if (picked.status === 'candidate') {
        await getCuriosityRepository().activateVersion(experienceId, picked.id);
        await syncCuriosityExperience(experienceId);
        next = (await getCuriosityRepository().getExperience(experienceId))!;
        picked = next.versions.find((version) => version.id === picked!.id)!;
      }
      setAggregate(next);
      setSelectedId(picked.id);
      setEvents(await getCuriosityRepository().listEvents(experienceId, picked.id));
    },
    [experienceId],
  );

  useEffect(() => {
    void refresh(initialCandidateId ?? undefined).catch((cause) =>
      setError(cause instanceof Error ? cause.message : String(cause)),
    );
  }, [initialCandidateId, refresh]);

  const selected = aggregate?.versions.find((version) => version.id === selectedId) ?? null;
  const summary = useMemo(
    () =>
      selected
        ? summarizeCuriosityEvents(
            { experienceId, versionId: selected.id, spec: selected.spec },
            events,
          )
        : null,
    [events, experienceId, selected],
  );
  const archive = useMemo(
    () =>
      selected && aggregate ? buildCuriosityArchive(aggregate, selected.id, events) : undefined,
    [aggregate, events, selected],
  );
  const restoredState = useMemo(() => restoreCuriositySceneState(events), [events]);
  const latestEvent = events.at(-1);
  const narration = selected
    ? (selectReviewedNarration(
        selected.spec.narrationLibrary,
        latestEvent ?? { type: 'exploration_started', action: '*' },
      ) ?? selected.spec.narrationLibrary[0])
    : null;

  const emit = useCallback(
    async (type: CuriosityEventTypeV3, action: string, payload: Record<string, unknown> = {}) => {
      if (!selected) return;
      const event: CuriosityEventV3 = {
        source: 'curiosity-world',
        protocolVersion: '3.0',
        eventId: `evt_${crypto.randomUUID()}`,
        experienceId,
        versionId: selected.id,
        type,
        action,
        occurredAt: new Date().toISOString(),
        payload,
      };
      await getCuriosityRepository().appendEvent(event);
      setEvents((current) => [...current, event]);
      await syncCuriosityExperience(experienceId);
    },
    [experienceId, selected],
  );

  const handleRuntimeEvent = async (event: CuriosityEventV3) => {
    await getCuriosityRepository().appendEvent(event);
    setEvents((current) =>
      current.some((item) => item.eventId === event.eventId) ? current : [...current, event],
    );
    await syncCuriosityExperience(experienceId);
  };

  const addCandidateFromResult = async (
    result: Record<string, unknown>,
    artifacts: unknown,
    agentRuns: unknown,
  ) => {
    const spec = curiosityExperienceSpecV3Schema.parse(result.spec);
    const versionId = String(result.versionId);
    await getCuriosityRepository().addCandidateVersion({
      experienceId,
      versionId,
      revision: Number(result.revision),
      createdAt: String(result.createdAt),
      spec,
      artifacts: storedRowsSchema.parse(artifacts),
      agentRuns: storedRowsSchema.parse(agentRuns),
    });
    await getCuriosityRepository().activateVersion(experienceId, versionId);
    await syncCuriosityExperience(experienceId);
    await refresh(versionId);
  };

  const handleRevision = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    setRevising(true);
    setError(null);
    try {
      const body = await readApiJson(
        await fetch(`/api/curiosity/experiences/${experienceId}/revisions`, {
          method: 'POST',
          headers: getCuriosityApiHeaders('curiosity.revision-planner'),
          body: JSON.stringify({ baseVersionId: selected.id, instruction }),
        }),
      );
      await addCandidateFromResult(body, body.artifacts, body.agentRuns);
      setInstruction('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRevising(false);
    }
  };

  const handleRegenerate = async () => {
    if (!selected) return;
    setRegenerating(true);
    setError(null);
    try {
      const created = await readApiJson(
        await fetch(`/api/curiosity/experiences/${experienceId}/regenerations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            baseVersionId: selected.id,
            targetAge: selected.spec.targetAge,
            directive: '换一种方式呈现',
          }),
        }),
      );
      for (let attempt = 0; attempt < curiosityGenerationPollLimit(); attempt += 1) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, CURIOSITY_GENERATION_POLL_INTERVAL_MS),
        );
        const job = await readApiJson(await fetch(String(created.pollUrl), { cache: 'no-store' }));
        if (job.status === 'failed')
          throw new Error(`${String(job.errorCode)}: ${String(job.error)}`);
        if (job.status === 'candidate_ready') {
          await addCandidateFromResult(
            job.result as Record<string, unknown>,
            job.artifacts,
            job.agentRuns,
          );
          return;
        }
      }
      throw new Error(
        `GENERATION_TIMEOUT: 生成未在 ${CURIOSITY_GENERATION_TIMEOUT_MS / 60_000} 分钟内完成。`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRegenerating(false);
    }
  };

  const selectVersion = async (versionId: string) => {
    try {
      await getCuriosityRepository().activateVersion(experienceId, versionId);
      await syncCuriosityExperience(experienceId);
      await refresh(versionId);
      setMode('parent');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  if (!aggregate || !selected || !summary) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#07152f] text-white">
        <p role="status">正在恢复这次探索…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07152f] px-4 py-5 text-white sm:px-6">
      <header className="mx-auto mb-5 flex max-w-[1450px] items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => router.push('/')} className="text-white">
          <ArrowLeft className="size-4" />
          新的问题
        </Button>
        <span className="hidden items-center gap-2 text-sm font-black text-[#fff4c7] sm:flex">
          <Moon className="size-4 fill-[#ffe08a] text-[#ffe08a]" />
          为什么世界
        </span>
        <div className="flex rounded-xl border border-white/10 bg-white/[.06] p-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setMode('child')}
            className={mode === 'child' ? 'bg-[#ffd76a] text-[#07152f]' : 'text-white'}
          >
            <Play className="size-4" />
            儿童探索
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setMode('parent')}
            className={mode === 'parent' ? 'bg-[#ffd76a] text-[#07152f]' : 'text-white'}
          >
            <ScrollText className="size-4" />
            家长复盘
          </Button>
        </div>
      </header>
      <div className="mx-auto max-w-[1450px]">
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-2xl border border-[#ff8066]/40 bg-[#ff8066]/10 p-4 text-sm font-bold text-[#ffb8a9]"
          >
            {error}
          </p>
        )}
        {mode === 'child' ? (
          <>
            {narration && (
              <ReviewedNarrationPanel
                narration={narration.text}
                started={narrationStarted}
                onStart={() => {
                  setNarrationStarted(true);
                  if (!events.some((event) => event.type === 'exploration_started'))
                    void emit('exploration_started', 'start');
                }}
                onReplay={() => undefined}
                onSkip={() => undefined}
              />
            )}
            <CuriosityRuntimeFrame
              key={selected.id}
              experienceId={experienceId}
              versionId={selected.id}
              spec={selected.spec}
              restoredState={restoredState}
              onEvent={handleRuntimeEvent}
              onStateChange={() => undefined}
            />
            <section className="mx-auto mt-5 grid max-w-4xl gap-4 rounded-2xl border border-white/10 bg-white/[.06] p-5 sm:grid-cols-2">
              <div>
                <h2 className="font-black text-[#ffe08a]">试试看</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selected.spec.discoveryPrompts.map((prompt) => (
                    <button
                      key={prompt.id}
                      type="button"
                      className="min-h-11 rounded-full border border-white/15 px-4 text-sm font-bold"
                      onClick={() =>
                        void emit('discovery_prompt_opened', 'open_prompt', { promptId: prompt.id })
                      }
                    >
                      {prompt.prompt}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="font-black text-[#ffe08a]" htmlFor="reflection">
                  记录我的发现
                </label>
                <textarea
                  id="reflection"
                  value={reflection}
                  onChange={(event) => setReflection(event.target.value)}
                  className="mt-3 min-h-24 w-full rounded-xl border border-white/15 bg-[#091d3b] p-3"
                />
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    disabled={!reflection.trim()}
                    onClick={() =>
                      void emit('reflection_recorded', 'record_reflection', {
                        text: reflection.trim(),
                      })
                    }
                  >
                    保存发现
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      void emit('exploration_ended', 'end').then(() => setMode('parent'))
                    }
                  >
                    结束探索
                  </Button>
                </div>
              </div>
            </section>
          </>
        ) : (
          <CuriosityParentReview
            spec={selected.spec}
            revision={selected.revision}
            summary={summary}
            voiceEvents={[]}
            archive={archive}
            versions={aggregate.versions.map(({ id, revision, status, createdAt }) => ({
              id,
              revision,
              status,
              createdAt,
            }))}
            revisionInstruction={instruction}
            revising={revising}
            regenerating={regenerating}
            error={error}
            onRevisionInstructionChange={setInstruction}
            onSubmitRevision={handleRevision}
            onRegenerate={() => void handleRegenerate()}
            onSelectVersion={(versionId) => void selectVersion(versionId)}
          />
        )}
      </div>
    </main>
  );
}
