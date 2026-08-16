import { after } from 'next/server';
import { nanoid } from 'nanoid';

import { createCuriosityRegenerationPostHandler } from '@/lib/curiosity/api-handlers';
import { curiosityExperienceStore, curiosityJobStore } from '@/lib/curiosity/server-store';
import { resolveCuriosityRoleModel } from '@/lib/curiosity/server-model';

export const maxDuration = 120;

export const POST = createCuriosityRegenerationPostHandler({
  store: curiosityJobStore,
  loadExperience: (experienceId) => curiosityExperienceStore.read(experienceId),
  resolveRoleModel: resolveCuriosityRoleModel,
  schedule: (work) => after(work),
  identityFactory: (experienceId, revision) => ({
    jobId: `job_${nanoid(10)}`,
    runId: `run_${nanoid(12)}`,
    experienceId,
    versionId: `ver_${nanoid(12)}`,
    revision,
    createdAt: new Date().toISOString(),
    artifactIds: {
      question: `art_${nanoid(12)}`,
      knowledge: `art_${nanoid(12)}`,
      scene: `art_${nanoid(12)}`,
      presentation: `art_${nanoid(12)}`,
      quality: `art_${nanoid(12)}`,
    },
    agentRunIds: {
      question: `agent_run_${nanoid(12)}`,
      knowledge: `agent_run_${nanoid(12)}`,
      scene: `agent_run_${nanoid(12)}`,
      presentation: `agent_run_${nanoid(12)}`,
      quality: `agent_run_${nanoid(12)}`,
    },
  }),
});
