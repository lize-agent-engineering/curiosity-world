import { createStudioRollbackPostHandler } from '@/lib/studio/api-handlers';
import { studioStore } from '@/lib/studio/server-store';

export const dynamic = 'force-dynamic';

const post = createStudioRollbackPostHandler({ projectStore: studioStore });

export async function POST(...args: Parameters<typeof post>) {
  return post(...args);
}
