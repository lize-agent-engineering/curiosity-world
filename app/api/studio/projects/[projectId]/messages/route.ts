import { createStudioMessagePostHandler } from '@/lib/studio/api-handlers';
import { studioJobStore, studioStore } from '@/lib/studio/server-store';
import { newStudioIdentity } from '@/lib/studio/server-identity';

export const dynamic = 'force-dynamic';

const post = createStudioMessagePostHandler({
  projectStore: studioStore,
  jobStore: studioJobStore,
  identityFactory: newStudioIdentity,
});

export async function POST(...args: Parameters<typeof post>) {
  return post(...args);
}
