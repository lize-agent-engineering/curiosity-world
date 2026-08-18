/**
 * The three-agent generation pipeline: planner → coder → reviewer.
 *
 * Pure with respect to storage — it takes the request plus the current document
 * and returns the next one, so it can be unit tested and driven from a spike
 * script without a worker or a filesystem behind it.
 *
 * Two degradation rules define its behaviour under failure, and both exist so a
 * user gets an app instead of an error:
 *  - A modify round tries targeted edit blocks first; if they cannot be applied
 *    exactly, it falls back to one full rewrite, and only a failed rewrite is a
 *    real failure. The path taken is reported as `editMode` and stored on the
 *    version.
 *  - A reviewer verdict of `revise` buys exactly one repair round. A second
 *    `revise`, or a reviewer that cannot produce a verdict at all, still ships
 *    the app — a quality gate that destroys working output is worse than one
 *    that reports a caveat.
 */

import { z } from 'zod';

import { parseCuriosityModelJson } from '@/lib/curiosity/model-json';
import {
  parseStudioPlan,
  studioPlannerOutputSchema,
  studioReviewSchema,
  type StudioAgentRole,
  type StudioEditMode,
  type StudioPlan,
  type StudioReview,
  type StudioRuntimeError,
} from './contracts';
import {
  applyStudioEditBlocks,
  parseStudioEditBlocks,
  StudioEditBlockError,
  type StudioEditBlock,
} from './edit-blocks';
import {
  renderStudioCoderSystem,
  renderStudioCreatePrompt,
  renderStudioPatchPrompt,
  renderStudioPlannerPrompt,
  renderStudioReviewerPrompt,
  renderStudioRewritePrompt,
  STUDIO_PLANNER_SYSTEM,
  STUDIO_REVIEWER_SYSTEM,
} from './prompts';
import {
  extractStudioHtmlDocument,
  validateStudioHtml,
  type StudioValidationReport,
} from './validate';

export interface StudioRoleRoute {
  providerId: string;
  modelId: string;
}

export interface StudioTextModel {
  route: StudioRoleRoute;
  complete(input: {
    system?: string;
    prompt: string;
    schema?: z.ZodType;
    onDelta?: (chunk: string) => void | Promise<void>;
  }): Promise<string>;
}

export type StudioPipelineModels = Record<StudioAgentRole, StudioTextModel>;

export interface StudioPipelineCurrent {
  html: string;
  plan: StudioPlan;
  summary: string;
  runtimeErrors: StudioRuntimeError[];
}

export interface StudioPipelineInput {
  request: string;
  current?: StudioPipelineCurrent;
}

export type StudioPipelineStage = 'planning' | 'coding' | 'reviewing';

export type StudioPipelineEvent =
  | { type: 'stage'; stage: StudioPipelineStage; attempt: number }
  | { type: 'plan'; plan: StudioPlan }
  | { type: 'code-delta'; text: string }
  | { type: 'code-done'; editMode: StudioEditMode }
  | { type: 'review'; review: StudioReview };

export interface StudioPipelineHooks {
  onEvent?: (event: StudioPipelineEvent) => void | Promise<void>;
}

export interface StudioPipelineResult {
  plan: StudioPlan;
  html: string;
  /** One line describing what this round changed — the agent's chat reply. */
  summary: string;
  editMode: StudioEditMode;
  review: StudioReview;
  reviewRetryCount: 0 | 1;
  reviewSkipped: boolean;
  /** True when re-planning failed and the previous plan was carried forward. */
  planFallback: boolean;
  validation: StudioValidationReport;
  codeAttempts: number;
  editBlockFailures: string[];
}

export type StudioPipelineFailureCode = 'PLAN_INVALID' | 'CODE_INVALID' | 'PATCH_FAILED';

export class StudioPipelineError extends Error {
  constructor(
    readonly failureCode: StudioPipelineFailureCode,
    readonly failedRole: StudioAgentRole,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'StudioPipelineError';
  }
}

const MAX_STRUCTURED_ATTEMPTS = 3;

function validationSummary(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join('.') || '$'}:${issue.code}`)
      .join(',');
  }
  if (error instanceof SyntaxError) return '$:invalid_json';
  return error instanceof Error ? `$:${error.message}` : '$:invalid_output';
}

/** Ask a structured role for JSON, repairing up to `MAX_STRUCTURED_ATTEMPTS` times. */
async function completeStructured<T>(
  model: StudioTextModel,
  input: { system: string; prompt: string; schema: z.ZodType<T> },
  parse: (raw: string) => T,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_STRUCTURED_ATTEMPTS; attempt += 1) {
    try {
      const raw = await model.complete({
        system: input.system,
        prompt:
          attempt === 1
            ? input.prompt
            : `${input.prompt}\n\n上一轮输出未通过校验：${validationSummary(lastError)}。请重新输出完整、合法的 JSON。`,
        schema: input.schema,
      });
      return parse(raw);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function runStudioPipeline(
  input: StudioPipelineInput,
  models: StudioPipelineModels,
  hooks: StudioPipelineHooks = {},
): Promise<StudioPipelineResult> {
  const emit = async (event: StudioPipelineEvent) => {
    await hooks.onEvent?.(event);
  };

  await emit({ type: 'stage', stage: 'planning', attempt: 1 });
  let plan: StudioPlan;
  let planFallback = false;
  try {
    plan = await completeStructured(
      models['studio.planner'],
      {
        system: STUDIO_PLANNER_SYSTEM,
        prompt: renderStudioPlannerPrompt({
          request: input.request,
          current: input.current
            ? { plan: input.current.plan, summary: input.current.summary }
            : undefined,
        }),
        schema: studioPlannerOutputSchema,
      },
      (raw) => parseStudioPlan(parseCuriosityModelJson(raw, z.unknown())),
    );
  } catch (error) {
    // A modify round already has a plan: the previous one, plus the user's own
    // words as this round's change note. Losing the re-plan is a worse plan, not
    // a reason to refuse an edit the coder can perfectly well make.
    if (!input.current) {
      throw new StudioPipelineError(
        'PLAN_INVALID',
        'studio.planner',
        `规划阶段没有产出可用方案（${validationSummary(error)}）。`,
        error,
      );
    }
    planFallback = true;
    plan = { ...input.current.plan, changeNote: input.request.trim().slice(0, 160) };
  }
  await emit({ type: 'plan', plan });

  const coder = models['studio.coder'];
  const system = renderStudioCoderSystem(plan.appKind);
  const editBlockFailures: string[] = [];
  let codeAttempts = 0;

  const writeCode = async (prompt: string): Promise<string> => {
    codeAttempts += 1;
    await emit({ type: 'stage', stage: 'coding', attempt: codeAttempts });
    return coder.complete({
      system,
      prompt,
      onDelta: (text) => emit({ type: 'code-delta', text }),
    });
  };

  interface CodeRound {
    html: string;
    editMode: StudioEditMode;
    validation: StudioValidationReport;
  }

  /** One coding round: produce a document, or throw with the reason it is unusable. */
  const produce = async (options: { findings?: StudioReview['findings'] }): Promise<CodeRound> => {
    if (!input.current) {
      let validationHint: string | undefined;
      let lastReport: StudioValidationReport | undefined;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const basePrompt = renderStudioCreatePrompt({
          request: input.request,
          plan,
          findings: options.findings,
        });
        const prompt = validationHint
          ? `${basePrompt}\n\n【上一次输出没有通过静态校验，必须修正】\n${validationHint}`
          : basePrompt;
        const html = extractStudioHtmlDocument(await writeCode(prompt));
        const validation = validateStudioHtml(html);
        if (validation.errors.length === 0) {
          await emit({ type: 'code-done', editMode: 'create' });
          return { html, editMode: 'create', validation };
        }
        lastReport = validation;
        validationHint = validation.errors
          .map((issue) => `${issue.code}：${issue.message}`)
          .join('\n');
      }
      throw new StudioPipelineError(
        'CODE_INVALID',
        'studio.coder',
        `生成的页面没有通过静态校验：${lastReport?.errors.map((issue) => issue.code).join('、')}`,
      );
    }

    const current = input.current;
    const patchResponse = await writeCode(
      renderStudioPatchPrompt({
        request: input.request,
        plan,
        html: current.html,
        findings: options.findings,
        runtimeErrors: current.runtimeErrors,
      }),
    );
    let patched: { html: string; blocks: StudioEditBlock[] } | undefined;
    try {
      const blocks = parseStudioEditBlocks(patchResponse);
      patched = { html: applyStudioEditBlocks(current.html, blocks), blocks };
    } catch (error) {
      if (!(error instanceof StudioEditBlockError)) throw error;
      editBlockFailures.push(error.code);
    }
    if (patched) {
      const validation = validateStudioHtml(patched.html);
      if (validation.errors.length === 0) {
        await emit({ type: 'code-done', editMode: 'patch' });
        return { html: patched.html, editMode: 'patch', validation };
      }
      editBlockFailures.push(validation.errors[0]!.code);
    }

    // Targeted editing failed. One full rewrite is the fallback — it costs more
    // tokens and loses the "untouched regions stay byte-identical" guarantee,
    // which is exactly why it is second and not first.
    const rewritten = extractStudioHtmlDocument(
      await writeCode(
        renderStudioRewritePrompt({
          request: input.request,
          plan,
          html: current.html,
          findings: options.findings,
          runtimeErrors: current.runtimeErrors,
        }),
      ),
    );
    const validation = validateStudioHtml(rewritten);
    if (validation.errors.length > 0) {
      throw new StudioPipelineError(
        'PATCH_FAILED',
        'studio.coder',
        `定点修改失败（${editBlockFailures.join('、')}），全量重写也没有通过静态校验（${validation.errors
          .map((issue) => issue.code)
          .join('、')}）。`,
      );
    }
    await emit({ type: 'code-done', editMode: 'rewrite' });
    return { html: rewritten, editMode: 'rewrite', validation };
  };

  const review = async (round: CodeRound): Promise<StudioReview | undefined> => {
    await emit({ type: 'stage', stage: 'reviewing', attempt: 1 });
    try {
      return await completeStructured(
        models['studio.reviewer'],
        {
          system: STUDIO_REVIEWER_SYSTEM,
          prompt: renderStudioReviewerPrompt({
            request: input.request,
            plan,
            html: round.html,
            validation: round.validation,
          }),
          schema: studioReviewSchema,
        },
        (raw) => studioReviewSchema.parse(parseCuriosityModelJson(raw, z.unknown())),
      );
    } catch {
      // A reviewer that cannot answer must not sink a page that already passed
      // static validation; the caveat is surfaced instead.
      return undefined;
    }
  };

  let round = await produce({});
  let verdict = await review(round);
  let reviewRetryCount: 0 | 1 = 0;
  if (verdict) await emit({ type: 'review', review: verdict });

  if (verdict?.verdict === 'revise' && verdict.findings.length > 0) {
    reviewRetryCount = 1;
    const findings = verdict.findings;
    try {
      const repaired = await produce({ findings });
      round = repaired;
      const second = await review(repaired);
      if (second) {
        verdict = second;
        await emit({ type: 'review', review: second });
      }
    } catch (error) {
      // The repair round failed but the first document is valid and stored-ready;
      // ship it with the findings attached rather than losing the whole run.
      if (!(error instanceof StudioPipelineError)) throw error;
    }
  }

  return {
    plan,
    html: round.html,
    summary: plan.changeNote,
    editMode: round.editMode,
    review: verdict ?? { verdict: 'pass', findings: [] },
    reviewRetryCount,
    reviewSkipped: verdict === undefined,
    planFallback,
    validation: round.validation,
    codeAttempts,
    editBlockFailures,
  };
}
