import { createStudioJobGetHandler } from '@/lib/studio/api-handlers';
import { studioJobStore } from '@/lib/studio/server-store';

export const dynamic = 'force-dynamic';

const get = createStudioJobGetHandler({ jobStore: studioJobStore });

export async function GET(...args: Parameters<typeof get>) {
  return get(...args);
}
