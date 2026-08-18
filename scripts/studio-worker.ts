/**
 * One worker process, two independent job loops.
 *
 * Studio and Curiosity generations are queued in separate stores and neither
 * should be able to stall the other, so each loop runs on its own timer and
 * failures are logged rather than allowed to kill the process — a crash here
 * would silently stop generation for both products.
 */

import { randomUUID } from 'crypto';
import { loadEnvConfig } from '@next/env';

import { curiosityJobStore } from '../lib/curiosity/server-store';
import { runCuriosityWorkerOnce } from '../lib/curiosity/worker';
import { newStudioVersionIds } from '../lib/studio/server-identity';
import { studioJobStore, studioStore } from '../lib/studio/server-store';
import { runStudioWorkerOnce } from '../lib/studio/worker';

loadEnvConfig(process.cwd());

const workerId = process.env.CURIOSITY_WORKER_ID ?? `worker_${randomUUID()}`;
const pollMs = Number(process.env.CURIOSITY_WORKER_POLL_MS ?? 1_000);
if (!Number.isInteger(pollMs) || pollMs < 100 || pollMs > 60_000) {
  throw new Error('CURIOSITY_WORKER_POLL_MS must be an integer from 100 to 60000');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function loop(name: string, once: () => Promise<boolean>): Promise<never> {
  for (;;) {
    try {
      if (!(await once())) await sleep(pollMs);
    } catch (error) {
      console.error(`[${name}] worker iteration failed`, error);
      await sleep(pollMs);
    }
  }
}

void Promise.all([
  loop('studio', () =>
    runStudioWorkerOnce({
      jobStore: studioJobStore,
      projectStore: studioStore,
      workerId,
      newIds: newStudioVersionIds,
    }),
  ),
  loop('curiosity', () => runCuriosityWorkerOnce({ store: curiosityJobStore, workerId })),
]);
