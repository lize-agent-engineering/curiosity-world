import { createStudioRuntimeErrorPostHandler } from '@/lib/studio/api-handlers';
import { studioStore } from '@/lib/studio/server-store';

export const dynamic = 'force-dynamic';

const post = createStudioRuntimeErrorPostHandler({ projectStore: studioStore });

export async function POST(...args: Parameters<typeof post>) {
  return post(...args);
}
