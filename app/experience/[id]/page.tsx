'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Moon, Play, ScrollText } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { z } from 'zod';

import { ExplorationCompletion } from '@/components/curiosity/exploration-completion';
import { CuriosityParentReview } from '@/components/curiosity/parent-review';
import { ReviewedNarrationPanel } from '@/components/curiosity/reviewed-narration-panel';
import { CuriosityRuntimeFrame } from '@/components/curiosity/runtime-frame';
import { Button } from '@/components/ui/button';
import { buildCuriosityArchive } from '@/lib/curiosity/archive';
import {
  curiosityAgentRunSchema,
  curiosityExperienceSpecV2Schema,
  interactionDesignArtifactV1Schema,
  knowledgeDesignArtifactV1Schema,
  revisionImpactArtifactV1Schema,
  storyDesignArtifactV1Schema,
  type ChildVoiceEventV1,
  type RevisionImpactArtifactV1,
  type StoryDesignArtifactV1,
} from '@/lib/curiosity/agent-contracts';
import { curiosityPipelineArtifactSchema } from '@/lib/curiosity/agent-pipeline';
import {
  getCuriosityApiHeaders,
  getCuriosityRepository,
  hydrateCuriosityExperience,
  readApiJson,
  syncCuriosityExperience,
} from '@/lib/curiosity/client';
import { isExperienceComplete } from '@/lib/curiosity/completion';
import { curiosityExperienceSpecSchema, type CuriosityEventV1 } from '@/lib/curiosity/contracts';
import {
  describeExperienceFailure,
  selectRegenerationBase,
} from '@/lib/curiosity/experience-recovery';
import {
  CURIOSITY_GENERATION_POLL_INTERVAL_MS,
  CURIOSITY_GENERATION_TIMEOUT_MS,
  curiosityGenerationPollLimit,
} from '@/lib/curiosity/live-timing';
import { selectReviewedNarration } from '@/lib/curiosity/narration-library';
import type { CuriosityExperienceAggregate } from '@/lib/curiosity/repository';
import { summarizeCuriosityEvents } from '@/lib/curiosity/runtime';
import { ReviewedNarrationPlayer } from '@/lib/curiosity/voice-client';

type Mode = 'child' | 'parent';
type NarrationLine = StoryDesignArtifactV1['narrationLibrary'][number];

export default function CuriosityExperiencePage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const experienceId = params.id;
  const initialCandidateId = search.get('candidate');
  const activationRef = useRef<Promise<void>>(Promise.resolve());
  const activatedCandidateIdsRef = useRef(new Set<string>());
  const narrationPlayerRef = useRef<ReviewedNarrationPlayer | null>(null);
  const [aggregate, setAggregate] = useState<CuriosityExperienceAggregate | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialCandidateId);
  const [pendingCandidateId, setPendingCandidateId] = useState<string | null>(initialCandidateId);
  const [events, setEvents] = useState<CuriosityEventV1[]>([]);
  const [voiceEvents, setVoiceEvents] = useState<ChildVoiceEventV1[]>([]);
  const [mode, setMode] = useState<Mode>('child');
  const [instruction, setInstruction] = useState('');
  const [revising, setRevising] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revisionImpact, setRevisionImpact] = useState<RevisionImpactArtifactV1>();
  const [narrationStarted, setNarrationStarted] = useState(false);
  const [narrationError, setNarrationError] = useState<string | null>(null);
  const [currentNarration, setCurrentNarration] = useState<NarrationLine | null>(null);

  const refresh = useCallback(
    async (preferredId?: string) => {
      let next = await getCuriosityRepository().getExperience(experienceId);
      if (!next && (await hydrateCuriosityExperience(experienceId))) {
        next = await getCuriosityRepository().getExperience(experienceId);
      } else if (next) {
        await syncCuriosityExperience(experienceId);
      }
      if (!next) throw new Error('EXPERIENCE_NOT_FOUND: 这台设备上没有该体验。');
      const picked =
        next.versions.find((version) => version.id === preferredId) ??
        next.versions.find((version) => version.id === next.experience.activeVersionId) ??
        next.versions.at(-1);
      if (!picked) throw new Error('VERSION_NOT_FOUND: 体验没有可用版本。');
      setAggregate(next);
      setSelectedId(picked.id);
      if (!next.experience.activeVersionId && picked.status === 'candidate')
        setPendingCandidateId(picked.id);
      setEvents(await getCuriosityRepository().listEvents(experienceId, picked.id));
      setVoiceEvents(await getCuriosityRepository().listVoiceEvents(experienceId, picked.id));
    },
    [experienceId],
  );

  useEffect(() => {
    refresh(initialCandidateId ?? undefined).catch((cause) =>
      setError(cause instanceof Error ? cause.message : String(cause)),
    );
  }, [initialCandidateId, refresh]);
  useEffect(() => () => narrationPlayerRef.current?.stop(), []);

  const selected = aggregate?.versions.find((version) => version.id === selectedId) ?? null;
  const presentation = useMemo(() => {
    const artifact = selected?.artifacts.find(
      (candidate) => candidate.agentRole === 'curiosity.presentation-designer',
    );
    return artifact ? storyDesignArtifactV1Schema.parse(artifact) : null;
  }, [selected]);
  const interaction = useMemo(() => {
    const artifact = selected?.artifacts.find(
      (candidate) =>
        candidate.agentRole === 'curiosity.interaction-designer' &&
        candidate.schemaVersion === '1.0',
    );
    return artifact ? interactionDesignArtifactV1Schema.parse(artifact) : null;
  }, [selected]);

  useEffect(() => {
    if (!presentation) return;
    const opening = selectReviewedNarration(presentation.narrationLibrary, {
      type: 'experiment_started',
      action: 'start',
    });
    setCurrentNarration(
      opening ??
        presentation.narrationLibrary.toSorted((a, b) => a.id.localeCompare(b.id))[0] ??
        null,
    );
    setNarrationStarted(false);
    setNarrationError(null);
  }, [presentation, selectedId]);

  const summary = useMemo(
    () => (selected ? summarizeCuriosityEvents(selected.spec, events) : null),
    [events, selected],
  );
  const archive = useMemo(
    () => (selected && aggregate ? buildCuriosityArchive(aggregate, selected.id, events) : null),
    [aggregate, events, selected],
  );
  const visibleRevisionImpact = useMemo(() => {
    if (revisionImpact) return revisionImpact;
    const artifact = selected?.artifacts.findLast(
      (candidate) =>
        candidate.agentRole === 'curiosity.revision-planner' &&
        candidate.schemaVersion === '1.0' &&
        'changedFields' in candidate,
    );
    return artifact ? revisionImpactArtifactV1Schema.parse(artifact) : undefined;
  }, [revisionImpact, selected]);

  const playNarration = useCallback(async (line: NarrationLine | null) => {
    if (!line) return;
    setNarrationError(null);
    try {
      narrationPlayerRef.current ??= new ReviewedNarrationPlayer();
      await narrationPlayerRef.current.play(line);
    } catch (cause) {
      setNarrationError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const handleReady = useCallback(() => {
    if (!pendingCandidateId || activatedCandidateIdsRef.current.has(pendingCandidateId)) return;
    const candidateId = pendingCandidateId;
    activatedCandidateIdsRef.current.add(candidateId);
    const operation = getCuriosityRepository()
      .activateVersion(experienceId, candidateId)
      .then(async () => {
        setPendingCandidateId(null);
        await syncCuriosityExperience(experienceId);
        await refresh(candidateId);
        router.replace(`/experience/${experienceId}`);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
    activationRef.current = operation;
  }, [experienceId, pendingCandidateId, refresh, router]);

  const handleEvent = useCallback(
    async (event: CuriosityEventV1) => {
      await activationRef.current;
      try {
        await getCuriosityRepository().appendEvent(event);
        await syncCuriosityExperience(event.experienceId);
        setEvents(await getCuriosityRepository().listEvents(event.experienceId, event.versionId));
        if (presentation) {
          const line = selectReviewedNarration(presentation.narrationLibrary, event);
          if (line) {
            setCurrentNarration(line);
            if (narrationStarted) void playNarration(line);
          }
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [narrationStarted, playNarration, presentation],
  );

  const handleRuntimeFailure = useCallback(
    async (message: string) => {
      setError(message);
      if (!pendingCandidateId) return;
      await getCuriosityRepository().markVersionFailed(
        experienceId,
        pendingCandidateId,
        'RUNTIME_FAILED',
      );
      await syncCuriosityExperience(experienceId);
      setPendingCandidateId(null);
      await refresh();
      setMode('parent');
    },
    [experienceId, pendingCandidateId, refresh],
  );

  const handleRevision = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const active = aggregate?.versions.find(
      (version) => version.id === aggregate.experience.activeVersionId,
    );
    if (!active) return setError('VERSION_NOT_ACTIVE: 需要先完成当前候选版本的运行检查。');
    setRevising(true);
    setError(null);
    try {
      const body = await readApiJson(
        await fetch(`/api/curiosity/experiences/${experienceId}/revisions`, {
          method: 'POST',
          headers: getCuriosityApiHeaders('curiosity.revision-planner'),
          body: JSON.stringify({
            baseSpec: active.spec,
            experienceSpec: active.experienceSpec,
            sourceArtifacts: active.artifacts,
            instruction,
          }),
        }),
      );
      const spec = curiosityExperienceSpecSchema.parse(body.spec);
      await getCuriosityRepository().addCandidateVersion(spec, String(body.specHash), {
        experienceSpec: curiosityExperienceSpecV2Schema.parse(body.experienceSpec),
        artifacts: z.array(curiosityPipelineArtifactSchema).parse(body.artifacts),
        agentRuns: z.array(curiosityAgentRunSchema).parse(body.agentRuns),
      });
      setRevisionImpact(revisionImpactArtifactV1Schema.parse(body.impact));
      setInstruction('');
      setPendingCandidateId(spec.versionId);
      setMode('child');
      await refresh(spec.versionId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRevising(false);
    }
  };

  const handleRegenerate = async () => {
    if (!aggregate) return setError('EXPERIENCE_NOT_FOUND: 这台设备上没有该体验。');
    const active = selectRegenerationBase(aggregate, selectedId);
    if (!active) return setError('EXPERIENCE_NOT_FOUND: 没有可用于重新生成的版本。');
    setRegenerating(true);
    setError(null);
    try {
      const activeKnowledge = knowledgeDesignArtifactV1Schema.parse(
        active.artifacts.find((artifact) => artifact.agentRole === 'curiosity.knowledge-designer'),
      );
      const created = await readApiJson(
        await fetch('/api/curiosity/generations', {
          method: 'POST',
          headers: getCuriosityApiHeaders('curiosity.interaction-designer'),
          body: JSON.stringify({
            question: aggregate.experience.question,
            age: active.spec.profile.age,
            experienceId,
            revision: Math.max(...aggregate.versions.map((version) => version.revision)) + 1,
            perspectiveDirective:
              '换一种贴近儿童生活的观察角度；保持科学因果不变，重新设计情境、互动任务和旁白。',
            preservedCausalRelations: activeKnowledge.causalRelations,
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
        if (job.status !== 'candidate_ready') continue;
        const result = job.result as {
          spec?: unknown;
          specHash?: unknown;
          experienceSpec?: unknown;
        };
        const spec = curiosityExperienceSpecSchema.parse(result.spec);
        await getCuriosityRepository().addCandidateVersion(spec, String(result.specHash), {
          experienceSpec: curiosityExperienceSpecV2Schema.parse(result.experienceSpec),
          artifacts: z.array(curiosityPipelineArtifactSchema).parse(job.artifacts),
          agentRuns: z.array(curiosityAgentRunSchema).parse(job.agentRuns),
        });
        setRevisionImpact(undefined);
        setPendingCandidateId(spec.versionId);
        setMode('child');
        await refresh(spec.versionId);
        return;
      }
      throw new Error(
        `GENERATION_TIMEOUT: 生成未在 ${CURIOSITY_GENERATION_TIMEOUT_MS / 60_000} 分钟内返回候选体验。`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRegenerating(false);
    }
  };

  const selectVersion = async (versionId: string) => {
    setSelectedId(versionId);
    setEvents(await getCuriosityRepository().listEvents(experienceId, versionId));
  };

  if (!aggregate || !selected || !summary || !archive || !presentation || !interaction) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#07152f] p-6 text-white">
        <div className="max-w-md text-center">
          <p>{describeExperienceFailure(error) ?? '正在恢复探索…'}</p>
          {error && (
            <Button onClick={() => router.push('/')} className="mt-5 bg-[#ffd76a] text-[#173047]">
              返回新的问题
            </Button>
          )}
        </div>
      </main>
    );
  }

  const completed = isExperienceComplete(selected.spec, events);
  const activeStageKind = !events.some((event) => event.type === 'prediction_submitted')
    ? 'prediction'
    : !events.some((event) => event.type === 'variable_changed') ||
        (interaction.sceneType === 'relation-explorer' &&
          !events.some((event) => event.action.startsWith('compare-')))
      ? 'exploration'
      : !events.some((event) => event.type === 'challenge_completed')
        ? 'transfer'
        : 'explanation';
  return (
    <main className="min-h-dvh bg-[#08152d] p-4 text-white sm:p-6">
      <header className="mx-auto mb-5 flex max-w-[1450px] items-center justify-between gap-4">
        <Button
          variant="ghost"
          onClick={() => router.push('/')}
          className="text-white hover:bg-white/10 hover:text-white"
        >
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
            {describeExperienceFailure(error)}
          </p>
        )}
        {mode === 'child' ? (
          completed ? (
            <ExplorationCompletion
              spec={selected.spec}
              presentation={presentation}
              summary={summary}
              onParentReview={() => setMode('parent')}
              onNewQuestion={() => router.push('/')}
            />
          ) : (
            <>
              {currentNarration && selected.id === aggregate.experience.activeVersionId && (
                <ReviewedNarrationPanel
                  narration={currentNarration.text}
                  started={narrationStarted}
                  error={narrationError}
                  onStart={() => {
                    setNarrationStarted(true);
                    void playNarration(currentNarration);
                  }}
                  onReplay={() => void playNarration(currentNarration)}
                  onSkip={() => narrationPlayerRef.current?.stop()}
                />
              )}
              <CuriosityRuntimeFrame
                key={selected.id}
                spec={selected.spec}
                interaction={interaction}
                activeStageKind={activeStageKind}
                onReady={handleReady}
                onEvent={handleEvent}
                onRuntimeFailure={handleRuntimeFailure}
              />
            </>
          )
        ) : (
          <CuriosityParentReview
            spec={selected.spec}
            summary={summary}
            voiceEvents={voiceEvents}
            archive={archive}
            revisionImpact={visibleRevisionImpact}
            versions={aggregate.versions.map(({ id, revision, status, createdAt }) => ({
              id,
              revision,
              status,
              createdAt,
            }))}
            revisionInstruction={instruction}
            revising={revising}
            regenerating={regenerating}
            error={describeExperienceFailure(error)}
            onRevisionInstructionChange={setInstruction}
            onSubmitRevision={handleRevision}
            onRegenerate={() => void handleRegenerate()}
            onSelectVersion={selectVersion}
          />
        )}
      </div>
    </main>
  );
}
