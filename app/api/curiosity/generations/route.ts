import { nanoid } from 'nanoid';

import { createCuriosityGenerationPostHandler } from '@/lib/curiosity/api-handlers';
import { curiosityJobStore } from '@/lib/curiosity/server-store';

export const maxDuration = 120;

const post = createCuriosityGenerationPostHandler({
  store: curiosityJobStore,
  identityFactory: (_body) => {
    const createdAt = new Date().toISOString();
    return {
      jobId: `job_${nanoid(10)}`,
      runId: `run_${nanoid(12)}`,
      experienceId: `cur_${nanoid(12)}`,
      versionId: `ver_${nanoid(12)}`,
      revision: 1,
      createdAt,
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
    };
  },
});

export async function POST(...args: Parameters<typeof post>) {
  return post(...args);
}
