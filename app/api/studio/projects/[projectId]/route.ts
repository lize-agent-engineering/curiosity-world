import { createStudioProjectGetHandler } from '@/lib/studio/api-handlers';
import { studioStore } from '@/lib/studio/server-store';

export const dynamic = 'force-dynamic';

const get = createStudioProjectGetHandler({ projectStore: studioStore });

export async function GET(...args: Parameters<typeof get>) {
  return get(...args);
}
