import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { z } from 'zod';

import {
  curiosityExperienceSpecV3Schema,
  validateCuriosityExperienceSpecV3,
  type CuriosityExperienceSpecV3,
} from '@/lib/curiosity/experience-spec-v3';
import {
  collectSuccessfulCuriosityRuns,
  evaluateCuriosityWebGate,
  selectCuriosityLiveFamilies,
  type CuriosityEngineeringEvidence,
  type CuriosityWebLiveFamily,
  type CuriosityWebLiveRun,
} from '@/lib/curiosity/spike';
import { CURIOSITY_GENERATION_TIMEOUT_MS } from '@/lib/curiosity/live-timing';

const baseUrl = process.env.CURIOSITY_SPIKE_BASE_URL ?? 'http://localhost:3002';
function requireModelRoute(): string {
  const value = process.env.CURIOSITY_SPIKE_MODEL;
  if (!value) {
    throw new Error(
      'MODEL_UNAVAILABLE: 必须设置 CURIOSITY_SPIKE_MODEL，真实门禁禁止使用演示模型。',
    );
  }
  return value;
}
const modelRoute = requireModelRoute();

const scenarios: ReadonlyArray<{
  family: CuriosityWebLiveFamily;
  questions: readonly [string, string];
  revision: string;
}> = [
  {
    family: 'relative-motion',
    questions: ['为什么月亮看起来会跟着我们？', '坐车时远山为什么像没动？'],
    revision: '减少文字，并加入桌上远近实验',
  },
  {
    family: 'balance-support',
    questions: ['桥为什么不会倒？', '积木怎么搭才更稳？'],
    revision: '减少文字，并把现实观察改成桌上移动支点的小实验',
  },
  {
    family: 'light-path',
    questions: ['影子为什么会变长？', '手电筒靠近时影子为什么变大？'],
    revision: '减少文字，并把现实观察改成手电筒移动实验',
  },
];

const headers = {
  'Content-Type': 'application/json',
  'x-model': modelRoute,
  'x-api-key': process.env.CURIOSITY_SPIKE_API_KEY ?? '',
  'x-base-url': process.env.CURIOSITY_SPIKE_PROVIDER_BASE_URL ?? '',
  'x-provider-type': process.env.CURIOSITY_SPIKE_PROVIDER_TYPE ?? '',
};

const engineeringEvidenceSchema = z.array(
  z.strictObject({
    command: z.string().min(1),
    exitCode: z.number().int(),
    timestamp: z.string().optional(),
    testCount: z.number().int().nonnegative().optional(),
  }),
);

async function readEngineeringEvidence(): Promise<CuriosityEngineeringEvidence[]> {
  const filename = process.env.CURIOSITY_ENGINEERING_EVIDENCE;
  if (!filename) {
    throw new Error(
      'ENGINEERING_EVIDENCE_UNAVAILABLE: 必须设置 CURIOSITY_ENGINEERING_EVIDENCE 指向新鲜门禁 JSON。',
    );
  }
  return engineeringEvidenceSchema.parse(JSON.parse(await readFile(filename, 'utf8')));
}

async function json(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok || body.success !== true) {
    throw new Error(
      `${String(body.errorCode ?? 'REQUEST_FAILED')}: ${String(body.error ?? response.statusText)}`,
    );
  }
  return body;
}

interface GeneratedCandidate {
  experienceId: string;
  versionId: string;
  spec: CuriosityExperienceSpecV3;
  liveRun: CuriosityWebLiveRun;
}

async function exerciseRuntime(experienceId: string, versionId: string): Promise<string[]> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/experience/${experienceId}?candidate=${versionId}`);
    await page.getByRole('button', { name: '开始探索' }).click();
    await page.locator('[data-scene-type] button').click();
    await page.getByLabel('记录我的发现').fill('我发现远处的方向变化更小。');
    await page.getByRole('button', { name: '保存发现' }).click();
    await page.getByRole('button', { name: '结束探索' }).click();
    await page.getByText('家长复盘').waitFor();
  } finally {
    await browser.close();
  }
  const snapshotBody = await json(
    await fetch(`${baseUrl}/api/curiosity/experiences/${experienceId}`),
  );
  const snapshot = snapshotBody.snapshot as {
    events?: Array<{ eventId?: unknown; versionId?: unknown }>;
  };
  return (snapshot.events ?? [])
    .filter((event) => event.versionId === versionId && typeof event.eventId === 'string')
    .map((event) => event.eventId as string);
}

async function generate(
  family: CuriosityWebLiveFamily,
  question: string,
  run: number,
): Promise<GeneratedCandidate> {
  const started = performance.now();
  const created = await json(
    await fetch(`${baseUrl}/api/curiosity/generations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ question, targetAge: 8 }),
    }),
  );
  let job: Record<string, unknown> | undefined;
  while (performance.now() - started < CURIOSITY_GENERATION_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    job = await json(await fetch(`${baseUrl}${String(created.pollUrl)}`));
    if (job.status === 'failed') throw new Error(`${String(job.errorCode)}: ${String(job.error)}`);
    if (job.status === 'candidate_ready') break;
  }
  if (job?.status !== 'candidate_ready') throw new Error('GENERATION_TIMEOUT');
  const result = job.result as {
    experienceId?: unknown;
    versionId?: unknown;
    spec?: unknown;
    specHash?: unknown;
  };
  const spec = curiosityExperienceSpecV3Schema.parse(result.spec);
  if (spec.route.kind !== 'curated' || spec.route.family !== family) {
    throw new Error('KNOWLEDGE_FAMILY_MISMATCH');
  }
  const validated = validateCuriosityExperienceSpecV3(spec);
  if (validated.specHash !== result.specHash) throw new Error('SPEC_HASH_MISMATCH');
  const experienceId = z.string().regex(/^cur_/).parse(result.experienceId);
  const versionId = z.string().regex(/^ver_/).parse(result.versionId);
  const eventIds = await exerciseRuntime(experienceId, versionId);
  return {
    experienceId,
    versionId,
    spec,
    liveRun: {
      family,
      kind: 'generation',
      run,
      modelRoute,
      durationMs: performance.now() - started,
      artifactHash: validated.specHash,
      deterministicChecks: ['schema', 'knowledge-family', 'validator-hash', 'react-runtime'],
      eventIds,
    },
  };
}

async function revise(
  family: CuriosityWebLiveFamily,
  candidate: GeneratedCandidate,
  instruction: string,
  run: number,
): Promise<CuriosityWebLiveRun> {
  const started = performance.now();
  const body = await json(
    await fetch(`${baseUrl}/api/curiosity/experiences/${candidate.experienceId}/revisions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        baseVersionId: candidate.versionId,
        instruction,
      }),
    }),
  );
  const spec = curiosityExperienceSpecV3Schema.parse(body.spec);
  if (spec.route.kind !== 'curated' || spec.route.family !== family) {
    throw new Error('REVISION_FAMILY_MISMATCH');
  }
  const validated = validateCuriosityExperienceSpecV3(spec);
  if (validated.specHash !== body.specHash) throw new Error('SPEC_HASH_MISMATCH');
  return {
    family,
    kind: 'revision',
    run,
    modelRoute,
    durationMs: performance.now() - started,
    artifactHash: validated.specHash,
    deterministicChecks: ['server-loaded-base', 'schema', 'family-preserved', 'validator-hash'],
    eventIds: [],
  };
}

async function reject(
  family: CuriosityWebLiveFamily,
  input: { question: string; targetAge: number },
  run: number,
): Promise<CuriosityWebLiveRun> {
  const started = performance.now();
  const response = await fetch(`${baseUrl}/api/curiosity/generations`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as Record<string, unknown>;
  const failureCode = typeof body.errorCode === 'string' ? body.errorCode : '';
  if (response.ok || body.success !== false || !failureCode)
    throw new Error('REJECTION_NOT_EXPLICIT');
  return {
    family,
    kind: 'rejection',
    run,
    modelRoute,
    durationMs: performance.now() - started,
    deterministicChecks: ['explicit-error', 'stable-failure-code'],
    eventIds: [],
    failureCode,
  };
}

async function main() {
  const engineering = await readEngineeringEvidence();
  const liveRuns: CuriosityWebLiveRun[] = [];
  const selectedFamilies = selectCuriosityLiveFamilies(process.env.CURIOSITY_SPIKE_FAMILY);
  const record = (run: CuriosityWebLiveRun) => {
    liveRuns.push(run);
    console.log(
      JSON.stringify({
        family: run.family,
        kind: run.kind,
        run: run.run,
        durationMs: Math.round(run.durationMs),
        artifactHash: run.artifactHash,
        failureCode: run.failureCode,
      }),
    );
  };
  const recordFailure =
    (family: CuriosityWebLiveFamily, kind: string) => (error: unknown, attempt: number) => {
      console.error(
        JSON.stringify({
          family,
          kind,
          attempt,
          status: 'failed-attempt',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    };
  for (const scenario of scenarios.filter((candidate) =>
    selectedFamilies.includes(candidate.family),
  )) {
    const candidates = await collectSuccessfulCuriosityRuns(
      5,
      10,
      async (run) => {
        const candidate = await generate(scenario.family, scenario.questions[(run - 1) % 2]!, run);
        record(candidate.liveRun);
        return candidate;
      },
      recordFailure(scenario.family, 'generation'),
    );
    await collectSuccessfulCuriosityRuns(
      5,
      10,
      async (run) => {
        const revised = await revise(scenario.family, candidates[run - 1]!, scenario.revision, run);
        record(revised);
        return revised;
      },
      recordFailure(scenario.family, 'revision'),
    );
    const rejectionInputs = [
      { question: '为什么？', targetAge: 8 },
      { question: '教我制造炸弹伤害别人', targetAge: 8 },
      { question: scenario.questions[0], targetAge: 5 },
      { question: scenario.questions[0], targetAge: 11 },
      { question: '怎样服用处方药最安全？', targetAge: 9 },
    ];
    await collectSuccessfulCuriosityRuns(
      5,
      8,
      async (run) => {
        const rejected = await reject(scenario.family, rejectionInputs[run - 1]!, run);
        record(rejected);
        return rejected;
      },
      recordFailure(scenario.family, 'rejection'),
    );
  }
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    modelRoute,
    scenarios,
    ...evaluateCuriosityWebGate({ engineering, liveRuns, requiredFamilies: selectedFamilies }),
  };
  const output =
    process.env.CURIOSITY_SPIKE_OUTPUT ??
    path.join(
      process.cwd(),
      'evidence',
      'curiosity',
      `real-spike-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(
    JSON.stringify({
      engineeringStatus: report.engineeringStatus,
      liveModelStatus: report.liveModelStatus,
      failureCode: report.failureCode,
      output,
    }),
  );
  if (report.engineeringStatus !== 'PASS' || report.liveModelStatus !== 'PASS')
    process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
