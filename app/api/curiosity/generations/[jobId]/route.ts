import { createCuriosityGenerationGetHandler } from '@/lib/curiosity/api-handlers';
import { curiosityJobStore, ensureCuriosityJobStoreRecovered } from '@/lib/curiosity/server-store';

export const dynamic = 'force-dynamic';

const get = createCuriosityGenerationGetHandler({ store: curiosityJobStore });

export async function GET(...args: Parameters<typeof get>) {
  await ensureCuriosityJobStoreRecovered();
  return get(...args);
}
