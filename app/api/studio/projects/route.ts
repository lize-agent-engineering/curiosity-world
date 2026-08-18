import {
  createStudioProjectsGetHandler,
  createStudioProjectsPostHandler,
} from '@/lib/studio/api-handlers';
import { studioJobStore, studioStore } from '@/lib/studio/server-store';
import { newStudioIdentity } from '@/lib/studio/server-identity';

export const dynamic = 'force-dynamic';

const post = createStudioProjectsPostHandler({
  projectStore: studioStore,
  jobStore: studioJobStore,
  identityFactory: newStudioIdentity,
});
const get = createStudioProjectsGetHandler({ projectStore: studioStore });

export async function POST(...args: Parameters<typeof post>) {
  return post(...args);
}

export async function GET() {
  return get();
}
