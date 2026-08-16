import { after } from 'next/server';
import { nanoid } from 'nanoid';

import { createCuriosityGenerationPostHandler } from '@/lib/curiosity/api-handlers';
import { resolveCuriosityRoleModel } from '@/lib/curiosity/server-model';
import { curiosityJobStore, ensureCuriosityJobStoreRecovered } from '@/lib/curiosity/server-store';

export const maxDuration = 120;

const post = createCuriosityGenerationPostHandler({
  store: curiosityJobStore,
  resolveRoleModel: (request, body, role) => resolveCuriosityRoleModel(request, body, role),
  schedule: (work) => after(work),
  identityFactory: (body) => {
    const createdAt = new Date().toISOString();
    return {
      jobId: `job_${nanoid(10)}`,
      runId: `run_${nanoid(12)}`,
      experienceId: body.experienceId ?? `cur_${nanoid(12)}`,
      versionId: `ver_${nanoid(12)}`,
      revision: body.revision,
      createdAt,
      artifactIds: {
        question: `art_${nanoid(12)}`,
        knowledge: `art_${nanoid(12)}`,
        interaction: `art_${nanoid(12)}`,
        team: `art_${nanoid(12)}`,
        story: `art_${nanoid(12)}`,
        spec: `art_${nanoid(12)}`,
        quality: `art_${nanoid(12)}`,
      },
      agentRunIds: {
        question: `agent_run_${nanoid(12)}`,
        knowledge: `agent_run_${nanoid(12)}`,
        interaction: `agent_run_${nanoid(12)}`,
        team: `agent_run_${nanoid(12)}`,
        story: `agent_run_${nanoid(12)}`,
        quality: `agent_run_${nanoid(12)}`,
      },
    };
  },
});

export async function POST(...args: Parameters<typeof post>) {
  await ensureCuriosityJobStoreRecovered();
  return post(...args);
}
