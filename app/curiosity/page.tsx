'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';

import {
  CuriosityHomeView,
  type CuriosityGenerationStatus,
  type CuriosityHomeRecentItem,
  type CuriosityHomeValues,
} from '@/components/curiosity/home-view';
import {
  getCuriosityRepository,
  readApiJson,
  syncCuriosityExperience,
} from '@/lib/curiosity/client';
import { curiosityAgentRunSchema } from '@/lib/curiosity/agent-contracts';
import { curiosityExperienceSpecV3Schema } from '@/lib/curiosity/experience-spec-v3';
import { curiosityPipelineArtifactSchema } from '@/lib/curiosity/agent-pipeline';
import type { CuriosityPipelineStage } from '@/lib/curiosity/agent-pipeline';
import {
  CURIOSITY_GENERATION_POLL_INTERVAL_MS,
  CURIOSITY_GENERATION_TIMEOUT_MS,
  curiosityGenerationPollLimit,
} from '@/lib/curiosity/live-timing';

const initialValues: CuriosityHomeValues = {
  question: '为什么月亮看起来会跟着我们？',
  targetAge: 8,
};

export default function HomePage() {
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);
  const [values, setValues] = useState(initialValues);
  const [status, setStatus] = useState<CuriosityGenerationStatus | null>(null);
  const [recent, setRecent] = useState<CuriosityHomeRecentItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const repository = getCuriosityRepository();
    repository
      .listExperiences()
      .then((experiences) =>
        Promise.all(
          experiences.map(async (experience) => {
            const aggregate = await repository.getExperience(experience.id);
            const activeVersion =
              aggregate?.versions.find(
                (version) => version.id === aggregate.experience.activeVersionId,
              ) ?? null;
            if (!activeVersion) return null;
            return {
              id: experience.id,
              question: experience.question,
              summary:
                activeVersion.spec.narrationLibrary.find(
                  (line) => line.eventType === 'exploration_ended',
                )?.text ?? activeVersion.spec.limitations[0],
              age: experience.age,
              updatedAt: experience.updatedAt,
            };
          }),
        ),
      )
      .then((items) => setRecent(items.filter((item) => item !== null)))
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
    return () => abortRef.current?.abort();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatus({ step: 'scope_check', progress: 10, message: '正在检查年龄、安全与支持范围' });
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    try {
      const created = await readApiJson(
        await fetch('/api/curiosity/generations', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ question: values.question, targetAge: values.targetAge }),
          signal: controller.signal,
        }),
      );
      const pollUrl = String(created.pollUrl);
      for (let attempt = 0; attempt < curiosityGenerationPollLimit(); attempt += 1) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, CURIOSITY_GENERATION_POLL_INTERVAL_MS),
        );
        const job = await readApiJson(
          await fetch(pollUrl, { signal: controller.signal, cache: 'no-store' }),
        );
        setStatus({
          step: String(job.step),
          progress: Number(job.progress),
          message: String(job.message),
          completedStages: z
            .array(z.enum(['question', 'knowledge', 'scene', 'presentation', 'quality']))
            .parse(job.completedStages) as CuriosityPipelineStage[],
          artifacts: z.array(curiosityPipelineArtifactSchema).parse(job.artifacts),
        });
        if (job.status === 'failed')
          throw new Error(`${String(job.errorCode)}: ${String(job.error)}`);
        if (job.status === 'candidate_ready') {
          const result = job.result as {
            experienceId?: unknown;
            versionId?: unknown;
            revision?: unknown;
            createdAt?: unknown;
            spec?: unknown;
            specHash?: unknown;
          };
          const spec = curiosityExperienceSpecV3Schema.parse(result.spec);
          const experienceId = String(result.experienceId);
          const versionId = String(result.versionId);
          await getCuriosityRepository().createExperienceWithCandidate({
            experienceId,
            versionId,
            revision: Number(result.revision),
            createdAt: String(result.createdAt),
            spec,
            artifacts: z.array(curiosityPipelineArtifactSchema).parse(job.artifacts),
            agentRuns: z.array(curiosityAgentRunSchema).parse(job.agentRuns),
          });
          await syncCuriosityExperience(experienceId);
          router.push(`/experience/${experienceId}?candidate=${versionId}`);
          return;
        }
      }
      throw new Error(
        `GENERATION_TIMEOUT: 生成未在 ${CURIOSITY_GENERATION_TIMEOUT_MS / 60_000} 分钟内返回候选体验。`,
      );
    } catch (cause) {
      if (controller.signal.aborted) return;
      setStatus(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <>
      {/*
       * This is the v1 pipeline: the model filled a structured spec and three
       * hand-built React scenes rendered it. It is kept reachable, with its
       * tests, as the record of what the current approach replaced — not as a
       * second product. The banner exists so nobody who lands here by URL
       * mistakes it for the main flow.
       */}
      <div className="bg-[#1b1206] px-4 py-2.5 text-center text-xs leading-5 text-[#ffdc72]">
        这是第一版的受约束管线：只支持三类预设场景，产物由固定组件渲染。主线已经换成自由代码生成，
        <Link href="/" className="font-bold underline underline-offset-4">
          回到「为什么世界」
        </Link>
        。
      </div>
      <CuriosityHomeView
        values={values}
        status={status}
        recent={recent}
        error={error}
        onChange={(field, value) => setValues((current) => ({ ...current, [field]: value }))}
        onSubmit={handleSubmit}
        onOpenExperience={(id) => router.push(`/experience/${id}`)}
      />
    </>
  );
}
