import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { z } from 'zod';

import {
  CURIOSITY_BOUNDARY_CASES,
  CURIOSITY_LIVE_CASES,
  CURIOSITY_LIVE_RUNS_PER_CASE,
  CURIOSITY_LIVE_TIMEOUT_MS,
  evaluateCuriosityLiveGate,
  type CuriosityEngineeringEvidence,
  type CuriosityLiveRun,
} from '../lib/curiosity/spike';

const baseUrl = (process.env.CURIOSITY_SPIKE_BASE_URL ?? 'http://localhost:3002').replace(
  /\/$/,
  '',
);
const headers = { 'content-type': 'application/json' };

async function body(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

async function operate(experienceId: string, versionId: string) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/experience/${experienceId}?candidate=${versionId}`);
    await page.locator('[data-scene-type] button').first().click();
    await page.getByText(/已查看 1 个对象/).waitFor();
    await page.reload();
    await page.getByText(/已查看 1 个对象/).waitFor();
    return true;
  } finally {
    await browser.close();
  }
}

async function pollJob(pollUrl: string, started: number) {
  let job: Record<string, unknown> = {};
  while (performance.now() - started <= CURIOSITY_LIVE_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    job = await body(await fetch(`${baseUrl}${pollUrl}`));
    if (job.status === 'candidate_ready' || job.status === 'failed') break;
  }
  return job;
}

async function executeCase(testCase: (typeof CURIOSITY_LIVE_CASES)[number], run: number) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}/api/curiosity/generations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ question: testCase.question, targetAge: 8 }),
  });
  const created = await body(response);
  if (testCase.expected !== 'candidate_ready') {
    return {
      caseId: testCase.id,
      run,
      terminal: String(created.errorCode ?? response.status),
      durationMs: performance.now() - started,
    } satisfies CuriosityLiveRun;
  }
  if (!response.ok) throw new Error(`${String(created.errorCode)}: ${String(created.error)}`);
  const job = await pollJob(String(created.pollUrl), started);
  const terminal = String(job.status ?? 'GENERATION_TIMEOUT');
  let sceneOperable = false;
  let regenerationPassed = false;
  let recoveryPassed = false;
  if (terminal === 'candidate_ready') {
    const result = z
      .object({ experienceId: z.string(), versionId: z.string() })
      .passthrough()
      .parse(job.result);
    recoveryPassed = await operate(result.experienceId, result.versionId);
    sceneOperable = true;
    const regenerationStarted = performance.now();
    const regenerationResponse = await fetch(
      `${baseUrl}/api/curiosity/experiences/${result.experienceId}/regenerations`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          baseVersionId: result.versionId,
          targetAge: 8,
          directive: '换一种方式呈现',
        }),
      },
    );
    const regeneration = await body(regenerationResponse);
    if (!regenerationResponse.ok) {
      throw new Error(`${String(regeneration.errorCode)}: ${String(regeneration.error)}`);
    }
    const regeneratedJob = await pollJob(String(regeneration.pollUrl), regenerationStarted);
    regenerationPassed = regeneratedJob.status === 'candidate_ready';
  }
  return {
    caseId: testCase.id,
    run,
    terminal,
    durationMs: performance.now() - started,
    sceneOperable,
    regenerationPassed,
    recoveryPassed,
    qualityRetryCount: Number(job.qualityRetryCount ?? 0),
    stageDurations: (job.stageDurations as Record<string, number> | undefined) ?? {},
    schemaRepairs: Number(job.schemaRepairs ?? 0),
  } satisfies CuriosityLiveRun;
}

async function main() {
  const evidenceFile = process.env.CURIOSITY_ENGINEERING_EVIDENCE;
  if (!evidenceFile) throw new Error('ENGINEERING_EVIDENCE_UNAVAILABLE');
  const engineering = z
    .array(z.object({ command: z.string(), exitCode: z.number().int() }).passthrough())
    .parse(JSON.parse(await readFile(evidenceFile, 'utf8'))) as CuriosityEngineeringEvidence[];
  const liveRuns: CuriosityLiveRun[] = [];
  for (const testCase of CURIOSITY_LIVE_CASES) {
    for (let run = 1; run <= CURIOSITY_LIVE_RUNS_PER_CASE; run += 1) {
      const result = await executeCase(testCase, run);
      liveRuns.push(result);
      console.log(JSON.stringify(result));
    }
  }
  for (const boundary of CURIOSITY_BOUNDARY_CASES) {
    const response = await fetch(`${baseUrl}/api/curiosity/generations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ question: boundary.question, targetAge: boundary.targetAge }),
    });
    const result = await body(response);
    const terminal = String(result.errorCode ?? result.status);
    if (terminal !== boundary.expected)
      throw new Error(`${boundary.id}:EXPECTED_${boundary.expected}`);
  }
  const report = evaluateCuriosityLiveGate({ engineering, liveRuns });
  const output = path.resolve(
    process.env.CURIOSITY_SPIKE_OUTPUT ??
      `evidence/curiosity/real-spike-${new Date().toISOString().replaceAll(':', '-')}.json`,
  );
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2), 'utf8');
  console.log(output);
  if (report.liveModelStatus !== 'PASS') process.exitCode = 1;
}

void main();
