import { nanoid } from 'nanoid';
import { NextRequest } from 'next/server';

import { createCuriosityRevisionPostHandler } from '@/lib/curiosity/api-handlers';
import { curiosityExperienceStore } from '@/lib/curiosity/server-store';
import { resolveCuriosityRoleModel } from '@/lib/curiosity/server-model';

export const maxDuration = 120;

export const POST = createCuriosityRevisionPostHandler({
  loadExperience: (experienceId) => curiosityExperienceStore.read(experienceId),
  resolveRoleModel: (_request, body, role) =>
    resolveCuriosityRoleModel(new NextRequest('http://curiosity-web.local/internal'), body, role),
  identityFactory: () => ({
    runId: `run_${nanoid(12)}`,
    versionId: `ver_${nanoid(12)}`,
    createdAt: new Date().toISOString(),
    patchArtifactId: `art_${nanoid(12)}`,
    qualityArtifactId: `art_${nanoid(12)}`,
    plannerAgentRunId: `agent_run_${nanoid(12)}`,
    qualityAgentRunId: `agent_run_${nanoid(12)}`,
  }),
});
