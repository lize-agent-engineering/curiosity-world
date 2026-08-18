import { spawn } from 'node:child_process';

const environment = {
  ...process.env,
  PORT: process.env.CURIOSITY_E2E_PORT ?? '3002',
  CURIOSITY_TEST_MODEL: 'true',
  STUDIO_TEST_MODEL: 'true',
  PLAYWRIGHT_TEST: 'true',
  CURIOSITY_WORKER_POLL_MS: '100',
};
const web = spawn('pnpm', ['dev'], { stdio: 'inherit', env: environment });
// One process, both queues — the same worker the deployment runs.
const worker = spawn('pnpm', ['worker'], { stdio: 'inherit', env: environment });

function stop(signal: NodeJS.Signals) {
  web.kill(signal);
  worker.kill(signal);
}
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

for (const child of [web, worker]) {
  child.on('exit', (code) => {
    stop('SIGTERM');
    process.exit(code ?? 1);
  });
}
