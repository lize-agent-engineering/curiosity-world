import { createCuriosityGenerationGetHandler } from '@/lib/curiosity/api-handlers';
import { curiosityJobStore } from '@/lib/curiosity/server-store';

export const dynamic = 'force-dynamic';

const get = createCuriosityGenerationGetHandler({ store: curiosityJobStore });

export async function GET(...args: Parameters<typeof get>) {
  return get(...args);
}
