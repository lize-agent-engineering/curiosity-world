/**
 * Browser-side access to the studio API.
 *
 * The two pieces worth testing are pure: which job (if any) is still running for
 * a conversation, and how an incremental code chunk folds into what the client
 * already has.
 */

import { z } from 'zod';

import {
  studioAppKindSchema,
  studioEditBlockRecordSchema,
  studioModeSchema,
  studioMessageSchema,
  studioPlannerOutputSchema,
  studioProjectSchema,
  studioReviewSchema,
  studioRuntimeErrorSchema,
  studioVersionSchema,
  type StudioMessage,
} from './contracts';

export const studioVersionViewSchema = studioVersionSchema
  .omit({ html: true })
  .extend({ htmlBytes: z.number().int().min(0) });

export type StudioVersionView = z.infer<typeof studioVersionViewSchema>;

export const studioProjectViewSchema = z.object({
  project: studioProjectSchema,
  messages: z.array(studioMessageSchema),
  versions: z.array(studioVersionViewSchema),
});

export type StudioProjectView = z.infer<typeof studioProjectViewSchema>;

export const studioJobViewSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  status: z.enum(['queued', 'running', 'succeeded', 'failed']),
  stage: z.enum(['queued', 'planning', 'coding', 'reviewing', 'done', 'failed']),
  message: z.string(),
  codeChunk: z.string(),
  codeLength: z.number().int().min(0),
  progress: z.number(),
  done: z.boolean(),
  plan: studioPlannerOutputSchema.optional(),
  review: studioReviewSchema.optional(),
  editMode: z.enum(['create', 'patch', 'rewrite']).optional(),
  editBlockFailures: z.array(z.string()).optional(),
  editBlocks: z.array(studioEditBlockRecordSchema).optional(),
  errorCode: z.string().optional(),
  error: z.string().optional(),
  result: z.object({ versionId: z.string(), revision: z.number(), summary: z.string() }).optional(),
});

export type StudioJobView = z.infer<typeof studioJobViewSchema>;

export const studioProjectSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  mode: studioModeSchema,
  targetAge: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  appKind: studioAppKindSchema.nullable(),
  revision: z.number(),
  summary: z.string().nullable(),
});

export type StudioProjectSummary = z.infer<typeof studioProjectSummarySchema>;

/** The job of the newest user turn the agent has not answered yet, if any. */
export function findActiveStudioJobId(messages: StudioMessage[]): string | null {
  const answered = new Set(
    messages.filter((message) => message.role === 'agent' && message.jobId).map((m) => m.jobId),
  );
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role !== 'user' || !message.jobId) continue;
    return answered.has(message.jobId) ? null : message.jobId;
  }
  return null;
}

/**
 * Fold one poll into the accumulated stream. A shorter server-side length means
 * the worker started a new coding round (a repair or a rewrite), so the panel
 * restarts rather than concatenating two different documents.
 */
export function foldStudioCode(
  current: string,
  view: { codeChunk: string; codeLength: number },
): string {
  if (view.codeLength < current.length) return view.codeChunk;
  return view.codeChunk ? current + view.codeChunk : current;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok || body.success !== true) {
    throw new Error(
      `${String(body.errorCode ?? response.status)}: ${String(body.error ?? '请求失败')}`,
    );
  }
  return body;
}

const jsonHeaders = { 'content-type': 'application/json' };

export async function createStudioProject(
  input: { prompt: string; mode?: 'education' | 'general'; targetAge?: number },
  signal?: AbortSignal,
): Promise<{ projectId: string; jobId: string }> {
  const body = await readJson(
    await fetch('/api/studio/projects', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(input),
      signal,
    }),
  );
  return { projectId: String(body.projectId), jobId: String(body.jobId) };
}

export async function listStudioProjects(signal?: AbortSignal): Promise<StudioProjectSummary[]> {
  const body = await readJson(await fetch('/api/studio/projects', { signal, cache: 'no-store' }));
  return z.array(studioProjectSummarySchema).parse(body.projects);
}

export async function fetchStudioProject(
  projectId: string,
  signal?: AbortSignal,
): Promise<StudioProjectView> {
  const body = await readJson(
    await fetch(`/api/studio/projects/${projectId}`, { signal, cache: 'no-store' }),
  );
  return studioProjectViewSchema.parse(body);
}

export async function fetchStudioVersionHtml(
  projectId: string,
  versionId: string,
  signal?: AbortSignal,
): Promise<string> {
  const body = await readJson(
    await fetch(`/api/studio/projects/${projectId}/versions/${versionId}`, {
      signal,
      cache: 'no-store',
    }),
  );
  return String(body.html);
}

export async function sendStudioMessage(
  projectId: string,
  text: string,
  parentVersionId?: string,
  signal?: AbortSignal,
): Promise<{ jobId: string }> {
  const body = await readJson(
    await fetch(`/api/studio/projects/${projectId}/messages`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ text, ...(parentVersionId ? { parentVersionId } : {}) }),
      signal,
    }),
  );
  return { jobId: String(body.jobId) };
}

export async function rollbackStudioProject(
  projectId: string,
  versionId: string,
  signal?: AbortSignal,
): Promise<void> {
  await readJson(
    await fetch(`/api/studio/projects/${projectId}/rollback`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ versionId }),
      signal,
    }),
  );
}

export async function reportStudioRuntimeErrors(
  projectId: string,
  versionId: string,
  errors: Array<Pick<z.infer<typeof studioRuntimeErrorSchema>, 'errorKind' | 'message'>>,
): Promise<void> {
  await readJson(
    await fetch(`/api/studio/projects/${projectId}/versions/${versionId}/runtime-errors`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ errors }),
    }),
  );
}

export async function pollStudioJob(
  jobId: string,
  since: number,
  signal?: AbortSignal,
): Promise<StudioJobView> {
  const body = await readJson(
    await fetch(`/api/studio/jobs/${jobId}?since=${since}`, { signal, cache: 'no-store' }),
  );
  return studioJobViewSchema.parse(body);
}

export interface StudioTurnArtifacts {
  plan?: z.infer<typeof studioPlannerOutputSchema>;
  review?: z.infer<typeof studioReviewSchema>;
  editMode?: 'create' | 'patch' | 'rewrite';
  editBlockFailures?: string[];
  editBlocks?: z.infer<typeof studioEditBlockRecordSchema>[];
}

export interface StudioTurn {
  id: string;
  request: string;
  createdAt: string;
  jobId?: string;
  reply?: string;
  versionId?: string;
  job?: StudioJobView;
  code?: string;
  /**
   * How this round was made, from the live job while it runs and from the stored
   * version afterwards — so reloading the page does not erase the evidence.
   */
  artifacts?: StudioTurnArtifacts;
}

/**
 * Fold the message list into conversation turns, attaching the live job to the
 * turn that is still running so the thread has exactly one active card.
 */
export function buildStudioTurns(input: {
  messages: StudioMessage[];
  versions?: StudioVersionView[];
  activeJob: StudioJobView | null;
  code: string;
}): StudioTurn[] {
  const turns: StudioTurn[] = [];
  for (const message of input.messages) {
    if (message.role === 'user') {
      turns.push({
        id: message.id,
        request: message.text,
        createdAt: message.createdAt,
        ...(message.jobId ? { jobId: message.jobId } : {}),
      });
      continue;
    }
    const target = message.jobId
      ? turns.findLast((turn) => turn.jobId === message.jobId)
      : turns.at(-1);
    if (!target) continue;
    target.reply = message.text;
    target.versionId = message.versionId;
  }
  for (const turn of turns) {
    const version = input.versions?.find((entry) => entry.id === turn.versionId);
    if (!version) continue;
    turn.artifacts = {
      plan: version.plan,
      review: version.review,
      editMode: version.editMode,
      editBlockFailures: version.editBlockFailures,
      editBlocks: version.editBlocks,
    };
  }
  const active = input.activeJob;
  if (active) {
    const target = turns.findLast((turn) => turn.jobId === active.id);
    if (target) {
      target.job = active;
      target.code = input.code;
      target.artifacts = {
        plan: active.plan ?? target.artifacts?.plan,
        review: active.review ?? target.artifacts?.review,
        editMode: active.editMode ?? target.artifacts?.editMode,
        editBlockFailures: active.editBlockFailures ?? target.artifacts?.editBlockFailures,
        editBlocks: active.editBlocks ?? target.artifacts?.editBlocks,
      };
    }
  }
  return turns;
}
