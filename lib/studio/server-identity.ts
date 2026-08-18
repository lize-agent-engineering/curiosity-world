import { nanoid } from 'nanoid';

import type { StudioIdentity } from './api-handlers';

export function newStudioIdentity(): StudioIdentity {
  return {
    projectId: `prj_${nanoid(12)}`,
    jobId: `job_${nanoid(12)}`,
    messageId: `msg_${nanoid(12)}`,
    createdAt: new Date().toISOString(),
  };
}

export function newStudioVersionIds(): { versionId: string; messageId: string } {
  return { versionId: `ver_${nanoid(12)}`, messageId: `msg_${nanoid(12)}` };
}
