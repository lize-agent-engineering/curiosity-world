import { nanoid } from 'nanoid';

import { createCuriosityRevisionPostHandler } from '@/lib/curiosity/api-handlers';
import { resolveCuriosityRoleModel } from '@/lib/curiosity/server-model';

export const maxDuration = 120;

export const POST = createCuriosityRevisionPostHandler({
  resolveRoleModel: resolveCuriosityRoleModel,
  identityFactory: () => ({
    runId: `run_${nanoid(12)}`,
    versionId: `ver_${nanoid(12)}`,
    createdAt: new Date().toISOString(),
    impactArtifactId: `art_${nanoid(12)}`,
    patchArtifactId: `art_${nanoid(12)}`,
    specArtifactId: `art_${nanoid(12)}`,
    qualityArtifactId: `art_${nanoid(12)}`,
    plannerAgentRunId: `agent_run_${nanoid(12)}`,
    qualityAgentRunId: `agent_run_${nanoid(12)}`,
  }),
});
