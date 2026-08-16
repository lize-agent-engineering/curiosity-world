'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Moon, Play, ScrollText } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { z } from 'zod';

import { CuriosityParentReview } from '@/components/curiosity/parent-review';
import { CuriosityRuntimeFrame } from '@/components/curiosity/runtime-frame';
import { VoiceGuide } from '@/components/curiosity/voice-guide';
import { Button } from '@/components/ui/button';
import {
  getCuriosityApiHeaders,
  getCuriosityRepository,
  readApiJson,
} from '@/lib/curiosity/client';
import { curiosityExperienceSpecSchema, type CuriosityEventV1 } from '@/lib/curiosity/contracts';
import {
  curiosityAgentRunSchema,
  curiosityExperienceSpecV2Schema,
  knowledgeDesignArtifactV1Schema,
  revisionImpactArtifactV1Schema,
  storyDesignArtifactV1Schema,
  type ChildVoiceEventV1,
  type GuidanceTurnResponseV1,
  type RevisionImpactArtifactV1,
} from '@/lib/curiosity/agent-contracts';
import { curiosityPipelineArtifactSchema } from '@/lib/curiosity/agent-pipeline';
import type { CuriosityExperienceAggregate } from '@/lib/curiosity/repository';
import { summarizeCuriosityEvents } from '@/lib/curiosity/runtime';
import { buildCuriosityArchive } from '@/lib/curiosity/archive';
import {
  applyGuidanceTurn,
  createGuidanceState,
  deriveGuidanceRequest,
  type GuidanceState,
} from '@/lib/curiosity/guidance';
import {
  describeVoiceFailure,
  speakManagedGuidance,
  transcribeChildRecording,
} from '@/lib/curiosity/voice-client';
import {
  CURIOSITY_GENERATION_POLL_INTERVAL_MS,
  CURIOSITY_GENERATION_TIMEOUT_MS,
  curiosityGenerationPollLimit,
} from '@/lib/curiosity/live-timing';
import {
  describeExperienceFailure,
  selectRegenerationBase,
} from '@/lib/curiosity/experience-recovery';

type Mode = 'child' | 'parent';

export default function CuriosityExperiencePage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const experienceId = params.id;
  const initialCandidateId = search.get('candidate');
  const activationRef = useRef<Promise<void>>(Promise.resolve());
  const activatedCandidateIdsRef = useRef(new Set<string>());
  const guidanceVersionRef = useRef<string | null>(null);
  const guidanceStateRef = useRef<GuidanceState | null>(null);
  const guidanceRequestQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const [aggregate, setAggregate] = useState<CuriosityExperienceAggregate | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialCandidateId);
  const [pendingCandidateId, setPendingCandidateId] = useState<string | null>(initialCandidateId);
  const [events, setEvents] = useState<CuriosityEventV1[]>([]);
  const [mode, setMode] = useState<Mode>('child');
  const [instruction, setInstruction] = useState('');
  const [revising, setRevising] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revisionImpact, setRevisionImpact] = useState<RevisionImpactArtifactV1 | undefined>();
  const [guidanceState, setGuidanceState] = useState<GuidanceState | null>(null);
  const [guideStarted, setGuideStarted] = useState(false);
  const [guideNarration, setGuideNarration] = useState('准备好后，我们一起开始探索。');
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [voiceEvents, setVoiceEvents] = useState<ChildVoiceEventV1[]>([]);

  const refresh = useCallback(
    async (preferredId?: string) => {
      const next = await getCuriosityRepository().getExperience(experienceId);
      if (!next) throw new Error('EXPERIENCE_NOT_FOUND: 这台设备上没有该体验。');
      setAggregate(next);
      const picked =
        next.versions.find((version) => version.id === preferredId) ??
        next.versions.find((version) => version.id === next.experience.activeVersionId) ??
        next.versions.at(-1);
      if (!picked) throw new Error('VERSION_NOT_FOUND: 体验没有可用版本。');
      setSelectedId(picked.id);
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

  const selected = aggregate?.versions.find((version) => version.id === selectedId) ?? null;
  const selectedVersionId = selected?.id;
  const story = useMemo(() => {
    const artifact = selected?.artifacts.find(
      (candidate) => candidate.agentRole === 'curiosity.story-designer',
    );
    return artifact ? storyDesignArtifactV1Schema.parse(artifact) : null;
  }, [selected]);

  useEffect(() => {
    if (!story || !selectedVersionId) return;
    if (guidanceVersionRef.current !== selectedVersionId) {
      guidanceVersionRef.current = selectedVersionId;
      guidanceStateRef.current = null;
      guidanceRequestQueueRef.current = Promise.resolve();
      setGuideStarted(false);
      setTranscript(null);
      setVoiceError(null);
    }
    let cancelled = false;
    getCuriosityRepository()
      .getGuidanceState(experienceId, selectedVersionId)
      .then((stored) => {
        if (cancelled) return;
        const next = stored ?? createGuidanceState(story);
        guidanceStateRef.current = next;
        setGuidanceState(next);
        const stage = story.stages.find((candidate) => candidate.id === next.stageId);
        setGuideNarration(stage?.openingNarration ?? '准备好后，我们一起开始探索。');
      })
      .catch((cause) => setVoiceError(cause instanceof Error ? cause.message : String(cause)));
    return () => {
      cancelled = true;
    };
  }, [experienceId, selectedVersionId, story]);
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

  const handleReady = useCallback(() => {
    if (!pendingCandidateId) return;
    const candidateId = pendingCandidateId;
    if (activatedCandidateIdsRef.current.has(candidateId)) return;
    activatedCandidateIdsRef.current.add(candidateId);
    const operation = getCuriosityRepository()
      .activateVersion(experienceId, candidateId)
      .then(async () => {
        setPendingCandidateId(null);
        await refresh(candidateId);
        router.replace(`/experience/${experienceId}`);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
    activationRef.current = operation;
  }, [experienceId, pendingCandidateId, refresh, router]);

  const handleEvent = useCallback(async (event: CuriosityEventV1) => {
    await activationRef.current;
    try {
      await getCuriosityRepository().appendEvent(event);
      setEvents(await getCuriosityRepository().listEvents(event.experienceId, event.versionId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const requestGuidance = useCallback(
    async (childInput: Parameters<typeof deriveGuidanceRequest>[4], triggerEventIds: string[]) => {
      if (!story || !selected) return;
      const operation = guidanceRequestQueueRef.current.then(async () => {
        const current = guidanceStateRef.current;
        if (!current) throw new Error('GUIDANCE_STAGE_CONFLICT: 引导状态尚未就绪。');
        const request = deriveGuidanceRequest(
          current,
          story,
          { experienceId, versionId: selected.id },
          triggerEventIds,
          childInput,
        );
        const body = await readApiJson(
          await fetch('/api/curiosity/guidance', {
            method: 'POST',
            headers: getCuriosityApiHeaders('curiosity.exploration-guide'),
            body: JSON.stringify({
              request,
              story,
              knowledge: selected.artifacts.find(
                (artifact) => artifact.agentRole === 'curiosity.knowledge-designer',
              ),
            }),
          }),
        );
        const response = body.response as GuidanceTurnResponseV1;
        const next = applyGuidanceTurn(current, response, story, {
          experienceId,
          versionId: selected.id,
        });
        guidanceStateRef.current = next;
        setGuidanceState(next);
        await getCuriosityRepository().saveGuidanceState(experienceId, selected.id, next);
        setGuideNarration(response.narration);
        await speakManagedGuidance(response.narration);
      });
      guidanceRequestQueueRef.current = operation.catch(() => undefined);
      return operation;
    },
    [experienceId, selected, story],
  );

  const handleGuidedEvent = useCallback(
    async (event: CuriosityEventV1) => {
      await handleEvent(event);
      if (!story || !guidanceState) return;
      if (!guideStarted) setGuideStarted(true);
      const stage = story.stages.find((candidate) => candidate.id === guidanceState.stageId);
      const mappedType = event.type === 'challenge_attempted' ? 'transfer_attempted' : event.type;
      if (!stage?.allowedEventTypes.includes(mappedType as never)) return;
      try {
        await requestGuidance({ kind: 'event', eventId: event.eventId }, [event.eventId]);
      } catch (cause) {
        setVoiceError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [guidanceState, guideStarted, handleEvent, requestGuidance, story],
  );

  const playNarration = useCallback(async () => {
    setVoiceError(null);
    try {
      await speakManagedGuidance(guideNarration);
    } catch (cause) {
      setVoiceError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [guideNarration]);

  const handleVoiceAnswer = useCallback(async () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      return;
    }
    setVoiceError(null);
    try {
      if (!selected || !guidanceState) {
        throw new Error('GUIDANCE_STAGE_CONFLICT: 引导状态尚未就绪。');
      }
      if (aggregate?.experience.activeVersionId !== selected.id) {
        throw new Error('VERSION_NOT_ACTIVE: 探索版本刚刚更新。');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordingChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        void (async () => {
          try {
            const recording = new Blob(recordingChunksRef.current, {
              type: recorder.mimeType || 'audio/webm',
            });
            const answer = await transcribeChildRecording(recording);
            setTranscript(answer.transcript);
            const eventId = `evt_voice_${Date.now()}`;
            await activationRef.current;
            const latest = await getCuriosityRepository().getExperience(experienceId);
            if (latest?.experience.activeVersionId !== selected.id) {
              throw new Error('VERSION_NOT_ACTIVE: 探索版本刚刚更新。');
            }
            const voiceEvent: ChildVoiceEventV1 = {
              schemaVersion: '1.0',
              eventId,
              experienceId,
              versionId: selected.id,
              stageId: guidanceState.stageId,
              status: 'accepted',
              transcript: answer.transcript,
              occurredAt: new Date().toISOString(),
            };
            await getCuriosityRepository().appendVoiceEvent(voiceEvent);
            setVoiceEvents(
              await getCuriosityRepository().listVoiceEvents(experienceId, selected.id),
            );
            await requestGuidance({ kind: 'voice', transcript: answer.transcript }, [eventId]);
          } catch (cause) {
            setVoiceError(describeVoiceFailure(cause));
          } finally {
            stream.getTracks().forEach((track) => track.stop());
            mediaRecorderRef.current = null;
            setListening(false);
          }
        })();
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setListening(true);
    } catch (cause) {
      setVoiceError(describeVoiceFailure(cause));
      setListening(false);
    }
  }, [aggregate, experienceId, guidanceState, requestGuidance, selected]);

  const handleRuntimeFailure = useCallback(
    async (message: string) => {
      setError(message);
      if (pendingCandidateId) {
        await getCuriosityRepository().markVersionFailed(
          experienceId,
          pendingCandidateId,
          'RUNTIME_FAILED',
        );
        setPendingCandidateId(null);
        await refresh();
        setMode('parent');
      }
    },
    [experienceId, pendingCandidateId, refresh],
  );

  const handleRevision = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const active = aggregate?.versions.find(
      (version) => version.id === aggregate.experience.activeVersionId,
    );
    if (!active) {
      setError('VERSION_NOT_ACTIVE: 需要先完成当前候选版本的运行检查。');
      return;
    }
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
      const experienceSpec = curiosityExperienceSpecV2Schema.parse(body.experienceSpec);
      const impact = revisionImpactArtifactV1Schema.parse(body.impact);
      await getCuriosityRepository().addCandidateVersion(spec, String(body.specHash), {
        experienceSpec,
        artifacts: z.array(curiosityPipelineArtifactSchema).parse(body.artifacts),
        agentRuns: z.array(curiosityAgentRunSchema).parse(body.agentRuns),
      });
      setRevisionImpact(impact);
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
    if (!aggregate) {
      setError('EXPERIENCE_NOT_FOUND: 这台设备上没有该体验。');
      return;
    }
    const active = selectRegenerationBase(aggregate, selectedId);
    if (!active) {
      setError('EXPERIENCE_NOT_FOUND: 没有可用于重新生成的版本。');
      return;
    }
    setRegenerating(true);
    setError(null);
    try {
      const revision = Math.max(...aggregate.versions.map((version) => version.revision)) + 1;
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
            interests: active.spec.profile.interests,
            experienceId,
            revision,
            perspectiveDirective:
              '换一种与上一版明显不同、贴近儿童生活的观察角度重新解释；保持科学因果不变，但重新设计情境、互动任务和故事旁白。',
            preservedCausalRelations: activeKnowledge.causalRelations,
          }),
        }),
      );
      const pollUrl = String(created.pollUrl);
      for (let attempt = 0; attempt < curiosityGenerationPollLimit(); attempt += 1) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, CURIOSITY_GENERATION_POLL_INTERVAL_MS),
        );
        const job = await readApiJson(await fetch(pollUrl, { cache: 'no-store' }));
        if (job.status === 'failed') {
          throw new Error(`${String(job.errorCode)}: ${String(job.error)}`);
        }
        if (job.status === 'candidate_ready') {
          const result = job.result as {
            spec?: unknown;
            experienceSpec?: unknown;
            specHash?: unknown;
          };
          const spec = curiosityExperienceSpecSchema.parse(result.spec);
          const experienceSpec = curiosityExperienceSpecV2Schema.parse(result.experienceSpec);
          await getCuriosityRepository().addCandidateVersion(spec, String(result.specHash), {
            experienceSpec,
            artifacts: z.array(curiosityPipelineArtifactSchema).parse(job.artifacts),
            agentRuns: z.array(curiosityAgentRunSchema).parse(job.agentRuns),
          });
          setRevisionImpact(undefined);
          setPendingCandidateId(spec.versionId);
          setMode('child');
          await refresh(spec.versionId);
          return;
        }
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

  if (!aggregate || !selected || !summary || !archive)
    return (
      <main className="grid min-h-screen place-items-center bg-[#07152f] p-6 text-white">
        <p>{describeExperienceFailure(error) ?? '正在恢复探索…'}</p>
      </main>
    );

  return (
    <main className="min-h-dvh bg-[#08152d] p-4 text-white sm:p-6">
      <header className="mx-auto mb-5 flex max-w-[1450px] items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => router.push('/')}
            className="text-white hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="size-4" />
            新的问题
          </Button>
          <span className="hidden items-center gap-2 text-sm font-black text-[#fff4c7] sm:flex">
            <Moon className="size-4 fill-[#ffe08a] text-[#ffe08a]" aria-hidden="true" />
            为什么世界
          </span>
        </div>
        <div className="flex rounded-xl border border-white/10 bg-white/[.06] p-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setMode('child')}
            className={
              mode === 'child'
                ? 'bg-[#ffd76a] text-[#07152f] hover:bg-[#ffd76a]'
                : 'text-white hover:bg-white/10 hover:text-white'
            }
          >
            <Play className="size-4" />
            儿童探索
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setMode('parent')}
            className={
              mode === 'parent'
                ? 'bg-[#ffd76a] text-[#07152f] hover:bg-[#ffd76a]'
                : 'text-white hover:bg-white/10 hover:text-white'
            }
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
          <div className="min-h-[calc(100vh-110px)]">
            {story &&
              !pendingCandidateId &&
              selected.id === aggregate.experience.activeVersionId && (
              <VoiceGuide
                narration={guideNarration}
                started={guideStarted}
                listening={listening}
                error={voiceError}
                transcript={transcript}
                onStart={() => {
                  setGuideStarted(true);
                  void playNarration();
                }}
                onReplay={() => void playNarration()}
                onSkip={() => globalThis.speechSynthesis?.cancel()}
                onListen={() => void handleVoiceAnswer()}
              />
            )}
            <CuriosityRuntimeFrame
              key={selected.id}
              spec={selected.spec}
              onReady={handleReady}
              onEvent={handleGuidedEvent}
              onRuntimeFailure={handleRuntimeFailure}
              activeStageKind={
                story?.stages.find((stage) => stage.id === guidanceState?.stageId)?.kind
              }
            />
          </div>
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
