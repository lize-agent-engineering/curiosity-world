import { randomUUID } from 'crypto';
import { loadEnvConfig } from '@next/env';

import { curiosityJobStore } from '../lib/curiosity/server-store';
import { runCuriosityWorkerOnce } from '../lib/curiosity/worker';

loadEnvConfig(process.cwd());

const workerId = process.env.CURIOSITY_WORKER_ID ?? `worker_${randomUUID()}`;
const pollMs = Number(process.env.CURIOSITY_WORKER_POLL_MS ?? 1_000);
if (!Number.isInteger(pollMs) || pollMs < 100 || pollMs > 60_000) {
  throw new Error('CURIOSITY_WORKER_POLL_MS must be an integer from 100 to 60000');
}

async function main() {
  for (;;) {
    const worked = await runCuriosityWorkerOnce({ store: curiosityJobStore, workerId });
    if (!worked) await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
