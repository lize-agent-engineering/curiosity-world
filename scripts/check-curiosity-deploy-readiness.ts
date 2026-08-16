import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import {
  assessCuriosityDeploymentReadiness,
  probeExpectedHttpStatus,
} from '../lib/curiosity/deployment-readiness';

function run(command: string, args: string[]) {
  return spawnSync(command, args, { encoding: 'utf8', env: process.env });
}

function loadLocalEnvironment(): Record<string, string | undefined> {
  const environment: Record<string, string | undefined> = { ...process.env };
  const source = readFileSync('.env.local', 'utf8');
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2];
    environment[match[1]] =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
        ? value.slice(1, -1)
        : value;
  }
  return environment;
}

function httpStatus(url: string): number | undefined {
  const response = run('/usr/bin/curl', [
    '--silent',
    '--show-error',
    '--output',
    '/dev/null',
    '--write-out',
    '%{http_code}',
    '--max-time',
    '20',
    url,
  ]);
  if (response.status !== 0) return undefined;
  const status = Number(response.stdout.trim());
  return Number.isInteger(status) ? status : undefined;
}

function waitOneSecond() {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000);
}

function endpointHasStatus(url: string, expectedStatus: number): boolean {
  return probeExpectedHttpStatus(() => httpStatus(url), expectedStatus, 5, waitOneSecond);
}

const git = run('git', ['status', '--porcelain']);
if (git.status !== 0) throw new Error('GIT_STATUS_FAILED');
const environment = loadLocalEnvironment();
const docker = run('docker', [
  'inspect',
  '--format',
  '{{.State.Running}}',
  'curiosity-world-local',
]);
const publicUrl = environment.CURIOSITY_PUBLIC_URL?.replace(/\/$/, '');
const publicHealthOk = publicUrl ? endpointHasStatus(`${publicUrl}/api/health`, 200) : false;
const legacyRoutesBlocked = publicUrl
  ? ['/api/server-providers', '/api/chat', '/settings'].every((route) =>
      endpointHasStatus(`${publicUrl}${route}`, 404),
    )
  : false;

const result = assessCuriosityDeploymentReadiness({
  environment,
  gitClean: git.stdout.trim().length === 0,
  dockerRunning: docker.status === 0 && docker.stdout.trim() === 'true',
  publicUrl,
  publicHealthOk,
  legacyRoutesBlocked,
  publicUrlStable: environment.CURIOSITY_PUBLIC_URL_STABLE === '1',
});

console.log(JSON.stringify(result, null, 2));
if (!result.ready) process.exitCode = 1;
