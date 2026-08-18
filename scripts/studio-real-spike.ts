/**
 * Real-model spike for Curiosity Studio — the GO/NO-GO gate before any UI work.
 *
 * Drives the pipeline directly (it is storage-free by design), so this measures
 * the only thing actually in doubt: whether the prompt system plus a real coding
 * model produces usable apps, and whether targeted edits land often enough to be
 * the primary modify path.
 *
 *   STUDIO_SPIKE_CODERS='openrouter:z-ai/glm-5.2,openrouter:moonshotai/kimi-k2.5' \
 *     pnpm spike:studio:real
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import { NextRequest } from 'next/server';

import type { StudioAgentRole } from '../lib/studio/contracts';
import { runStudioPipeline, type StudioPipelineModels } from '../lib/studio/pipeline';
import { resolveStudioRoleModel } from '../lib/studio/server-model';
import {
  evaluateStudioSpike,
  STUDIO_SPIKE_CASES,
  type StudioSpikeCase,
  type StudioSpikeRun,
} from '../lib/studio/spike';
import { validateStudioHtml } from '../lib/studio/validate';

loadEnvConfig(process.cwd());

const coders = (process.env.STUDIO_SPIKE_CODERS ?? process.env.DEFAULT_MODEL ?? '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);
if (coders.length === 0) throw new Error('STUDIO_SPIKE_CODERS or DEFAULT_MODEL must be set');

const only = process.env.STUDIO_SPIKE_CASE_IDS?.split(',').map((id) => id.trim());
const cases = only?.length
  ? STUDIO_SPIKE_CASES.filter((sample) => only.includes(sample.id))
  : STUDIO_SPIKE_CASES;
const concurrency = Number(process.env.STUDIO_SPIKE_CONCURRENCY ?? 4);
const outputDir = path.resolve(
  process.env.STUDIO_SPIKE_OUTPUT ??
    `evidence/studio/spike-${new Date().toISOString().replaceAll(':', '-').slice(0, 19)}`,
);

async function buildModels(coderModel: string): Promise<StudioPipelineModels> {
  // Only the coder varies across candidates; the planner and reviewer stay on the
  // configured routes so a candidate is judged on its coding, not on its planning.
  const coderRequest = new NextRequest('http://studio-spike.local/internal', {
    headers: { 'x-model': coderModel },
  });
  const plain = new NextRequest('http://studio-spike.local/internal');
  const entries = await Promise.all(
    (['studio.planner', 'studio.coder', 'studio.reviewer'] as StudioAgentRole[]).map(
      async (role) =>
        [
          role,
          await resolveStudioRoleModel(role === 'studio.coder' ? coderRequest : plain, {}, role),
        ] as const,
    ),
  );
  return Object.fromEntries(entries) as StudioPipelineModels;
}

async function runCase(sample: StudioSpikeCase, coderModel: string): Promise<StudioSpikeRun[]> {
  const models = await buildModels(coderModel);
  const runs: StudioSpikeRun[] = [];
  const started = Date.now();
  let created;
  try {
    created = await runStudioPipeline({ request: sample.create }, models);
    const validation = validateStudioHtml(created.html);
    runs.push({
      caseId: sample.id,
      coderModel,
      step: 'create',
      ok: validation.errors.length === 0,
      durationMs: Date.now() - started,
      sizeBytes: validation.sizeBytes,
      appKind: created.plan.appKind,
      editMode: created.editMode,
      codeAttempts: created.codeAttempts,
      reviewVerdict: created.review.verdict,
      reviewRetryCount: created.reviewRetryCount,
      reviewSkipped: created.reviewSkipped,
      planFallback: created.planFallback,
      warnings: validation.warnings.map((issue) => issue.code),
    });
    await writeFile(
      path.join(outputDir, 'pages', `${slug(coderModel)}__${sample.id}__create.html`),
      created.html,
      'utf8',
    );
  } catch (error) {
    runs.push({
      caseId: sample.id,
      coderModel,
      step: 'create',
      ok: false,
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    });
    return runs;
  }

  const patchStarted = Date.now();
  try {
    const patched = await runStudioPipeline(
      {
        request: sample.patch,
        current: {
          html: created.html,
          plan: created.plan,
          summary: created.summary,
          runtimeErrors: [],
        },
      },
      models,
    );
    const validation = validateStudioHtml(patched.html);
    runs.push({
      caseId: sample.id,
      coderModel,
      step: 'patch',
      ok: validation.errors.length === 0,
      durationMs: Date.now() - patchStarted,
      sizeBytes: validation.sizeBytes,
      appKind: patched.plan.appKind,
      editMode: patched.editMode,
      codeAttempts: patched.codeAttempts,
      reviewVerdict: patched.review.verdict,
      reviewRetryCount: patched.reviewRetryCount,
      reviewSkipped: patched.reviewSkipped,
      planFallback: patched.planFallback,
      editBlockFailures: patched.editBlockFailures,
      warnings: validation.warnings.map((issue) => issue.code),
    });
    await writeFile(
      path.join(outputDir, 'pages', `${slug(coderModel)}__${sample.id}__patch.html`),
      patched.html,
      'utf8',
    );
  } catch (error) {
    runs.push({
      caseId: sample.id,
      coderModel,
      step: 'patch',
      ok: false,
      durationMs: Date.now() - patchStarted,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return runs;
}

function slug(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9]+/g, '-');
}

async function pooled<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        results[index] = await worker(items[index]!);
      }
    }),
  );
  return results;
}

async function main() {
  await mkdir(path.join(outputDir, 'pages'), { recursive: true });
  const jobs = coders.flatMap((coderModel) => cases.map((sample) => ({ sample, coderModel })));
  const runs = (
    await pooled(jobs, concurrency, async (job) => {
      const result = await runCase(job.sample, job.coderModel);
      for (const run of result) {
        console.log(
          [
            run.ok ? 'ok  ' : 'FAIL',
            run.coderModel.padEnd(34),
            run.caseId.padEnd(22),
            run.step.padEnd(6),
            `${Math.round(run.durationMs / 1000)}s`.padStart(5),
            run.editMode ?? '-',
            run.sizeBytes ? `${Math.round(run.sizeBytes / 1024)}KB` : '',
            run.error ?? '',
          ].join(' '),
        );
      }
      return result;
    })
  ).flat();

  const reports = evaluateStudioSpike(runs);
  const report = { generatedAt: new Date().toISOString(), coders, runs, reports };
  await writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n${path.join(outputDir, 'report.json')}`);
  for (const entry of reports) {
    console.log(
      `${entry.verdict.padEnd(6)} ${entry.coderModel}  first-attempt ${(entry.firstAttemptRate * 100).toFixed(0)}%  patch-hit ${(entry.patchHitRate * 100).toFixed(0)}%  patch-pass ${(entry.patchPassRate * 100).toFixed(0)}%  p95 ${Math.round(entry.createP95Ms / 1000)}s  median ${Math.round(entry.medianSizeBytes / 1024)}KB`,
    );
    for (const failure of entry.failedCriteria) console.log(`       ${failure}`);
  }
  if (!reports.some((entry) => entry.verdict === 'GO')) process.exitCode = 1;
}

void main();
