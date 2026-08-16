'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';

import {
  CuriosityHomeView,
  type CuriosityGenerationStatus,
  type CuriosityHomeRecentItem,
  type CuriosityHomeValues,
} from '@/components/curiosity/home-view';
import {
  getCuriosityApiHeaders,
  getCuriosityRepository,
  readApiJson,
  syncCuriosityExperience,
} from '@/lib/curiosity/client';
import { curiosityExperienceSpecSchema } from '@/lib/curiosity/contracts';
import {
  curiosityAgentRunSchema,
  curiosityExperienceSpecV2Schema,
} from '@/lib/curiosity/agent-contracts';
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
              summary: activeVersion.spec.presentation.completion,
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
          headers: getCuriosityApiHeaders('curiosity.interaction-designer'),
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
            spec?: unknown;
            experienceSpec?: unknown;
            specHash?: unknown;
          };
          const spec = curiosityExperienceSpecSchema.parse(result.spec);
          const experienceSpec = curiosityExperienceSpecV2Schema.parse(result.experienceSpec);
          await getCuriosityRepository().createExperienceWithCandidate(
            spec,
            String(result.specHash),
            {
              experienceSpec,
              artifacts: z.array(curiosityPipelineArtifactSchema).parse(job.artifacts),
              agentRuns: z.array(curiosityAgentRunSchema).parse(job.agentRuns),
            },
          );
          await syncCuriosityExperience(spec.experienceId);
          router.push(`/experience/${spec.experienceId}?candidate=${spec.versionId}`);
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
    <CuriosityHomeView
      values={values}
      status={status}
      recent={recent}
      error={error}
      onChange={(field, value) => setValues((current) => ({ ...current, [field]: value }))}
      onSubmit={handleSubmit}
      onOpenExperience={(id) => router.push(`/experience/${id}`)}
    />
  );
}
