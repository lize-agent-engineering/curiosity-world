/**
 * HTTP handlers for the studio, written as factories over injected stores so the
 * route files stay one-liners and the behaviour is testable without a server.
 *
 * The trust boundary lives here: a client sends a request string and, at most, a
 * version id to branch from. It never sends HTML. The document a generation
 * round edits is always read from the store by the worker.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import {
  studioModeSchema,
  studioRuntimeErrorSchema,
  studioTargetAgeSchema,
  type StudioSnapshot,
} from './contracts';
import { projectStudioJobForClient, type StudioJobStore } from './jobs';
import {
  attachStudioRuntimeErrors,
  appendStudioMessage,
  createStudioSnapshot,
  rollbackStudioProject,
  withStudioProject,
  type StudioStore,
} from './store';

export interface StudioIdentity {
  projectId: string;
  jobId: string;
  messageId: string;
  createdAt: string;
}

const promptSchema = z.string().trim().min(1).max(2_000);
const createSchema = z
  .strictObject({
    prompt: promptSchema,
    mode: studioModeSchema.default('general'),
    targetAge: studioTargetAgeSchema.optional(),
  })
  .refine((body) => body.mode !== 'education' || body.targetAge !== undefined, {
    message: '教育模式必须提供孩子年龄。',
    path: ['targetAge'],
  });
const messageSchema = z.strictObject({
  text: promptSchema,
  parentVersionId: z
    .string()
    .regex(/^ver_[a-zA-Z0-9_-]+$/)
    .optional(),
});
const rollbackSchema = z.strictObject({ versionId: z.string().regex(/^ver_[a-zA-Z0-9_-]+$/) });
const runtimeErrorsSchema = z.strictObject({
  errors: z
    .array(
      studioRuntimeErrorSchema.omit({ occurredAt: true }).extend({
        occurredAt: z.iso.datetime().optional(),
      }),
    )
    .min(1)
    .max(20),
});

function fail(errorCode: string, error: string, status: number): NextResponse {
  return NextResponse.json({ success: false, errorCode, error }, { status });
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof z.ZodError) {
    return fail('INVALID_REQUEST', '请求格式不正确。', 400);
  }
  return fail('INTERNAL_ERROR', 'Studio 服务发生内部错误。', 500);
}

/** A working title until the planner supplies the real app name. */
function draftTitle(prompt: string): string {
  const trimmed = prompt.trim().replaceAll(/\s+/g, ' ');
  return trimmed.length <= 24 ? trimmed : `${trimmed.slice(0, 24)}…`;
}

export function createStudioProjectsPostHandler(deps: {
  projectStore: StudioStore;
  jobStore: StudioJobStore;
  identityFactory: () => StudioIdentity;
}) {
  return async function POST(request: NextRequest): Promise<NextResponse> {
    try {
      const body = createSchema.parse(await request.json());
      const identity = deps.identityFactory();
      await deps.projectStore.create(
        createStudioSnapshot({
          projectId: identity.projectId,
          title: draftTitle(body.prompt),
          createdAt: identity.createdAt,
          mode: body.mode,
          ...(body.targetAge === undefined ? {} : { targetAge: body.targetAge }),
          firstMessage: {
            id: identity.messageId,
            text: body.prompt,
            jobId: identity.jobId,
            createdAt: identity.createdAt,
          },
        }),
      );
      await deps.jobStore.create({
        id: identity.jobId,
        storeVersion: 1,
        projectId: identity.projectId,
        status: 'queued',
        stage: 'queued',
        message: '任务已排队，等待生成',
        input: {
          request: body.prompt,
          parentVersionId: null,
          mode: body.mode,
          ...(body.targetAge === undefined ? {} : { targetAge: body.targetAge }),
        },
        code: '',
        createdAt: identity.createdAt,
        updatedAt: identity.createdAt,
      });
      return NextResponse.json(
        {
          success: true,
          projectId: identity.projectId,
          jobId: identity.jobId,
          pollUrl: `/api/studio/jobs/${identity.jobId}`,
          pollIntervalMs: 500,
        },
        { status: 202 },
      );
    } catch (error) {
      return errorResponse(error);
    }
  };
}

function currentVersion(snapshot: StudioSnapshot) {
  return snapshot.versions.find((version) => version.id === snapshot.project.currentVersionId);
}

export function createStudioProjectsGetHandler(deps: { projectStore: StudioStore }) {
  return async function GET(): Promise<NextResponse> {
    try {
      const projects = await deps.projectStore.list();
      const detailed = await Promise.all(
        projects.map(async (project) => {
          const snapshot = await deps.projectStore.read(project.id);
          const version = snapshot ? currentVersion(snapshot) : undefined;
          return {
            id: project.id,
            title: project.title,
            mode: project.mode,
            targetAge: project.targetAge ?? null,
            updatedAt: project.updatedAt,
            createdAt: project.createdAt,
            appKind: version?.appKind ?? null,
            revision: version?.revision ?? 0,
            summary: version?.summary ?? null,
          };
        }),
      );
      return NextResponse.json({ success: true, projects: detailed });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function createStudioProjectGetHandler(deps: { projectStore: StudioStore }) {
  return async function GET(
    _request: NextRequest,
    context: { params: Promise<{ projectId: string }> },
  ): Promise<NextResponse> {
    try {
      const { projectId } = await context.params;
      const snapshot = await deps.projectStore.read(projectId);
      if (!snapshot) return fail('PROJECT_NOT_FOUND', '项目不存在。', 404);
      return NextResponse.json({
        success: true,
        project: snapshot.project,
        messages: snapshot.messages,
        // The html payloads stay out of this response; the workbench fetches the
        // one version it is previewing.
        versions: snapshot.versions.map(({ html, ...version }) => ({
          ...version,
          htmlBytes: Buffer.byteLength(html, 'utf8'),
        })),
      });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function createStudioVersionGetHandler(deps: { projectStore: StudioStore }) {
  return async function GET(
    _request: NextRequest,
    context: { params: Promise<{ projectId: string; versionId: string }> },
  ): Promise<NextResponse> {
    try {
      const { projectId, versionId } = await context.params;
      const snapshot = await deps.projectStore.read(projectId);
      const version = snapshot?.versions.find((entry) => entry.id === versionId);
      if (!version) return fail('VERSION_NOT_FOUND', '版本不存在。', 404);
      return NextResponse.json({ success: true, ...version });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function createStudioMessagePostHandler(deps: {
  projectStore: StudioStore;
  jobStore: StudioJobStore;
  identityFactory: () => StudioIdentity;
}) {
  return async function POST(
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> },
  ): Promise<NextResponse> {
    try {
      const body = messageSchema.parse(await request.json());
      const { projectId } = await context.params;
      const snapshot = await deps.projectStore.read(projectId);
      if (!snapshot) return fail('PROJECT_NOT_FOUND', '项目不存在。', 404);
      const parentVersionId = body.parentVersionId ?? snapshot.project.currentVersionId;
      if (parentVersionId && !snapshot.versions.some((entry) => entry.id === parentVersionId)) {
        return fail('VERSION_NOT_FOUND', '要修改的版本不存在。', 404);
      }
      const identity = deps.identityFactory();
      await withStudioProject(deps.projectStore, projectId, (current) =>
        appendStudioMessage(current, {
          id: identity.messageId,
          projectId,
          role: 'user',
          text: body.text,
          jobId: identity.jobId,
          createdAt: identity.createdAt,
        }),
      );
      await deps.jobStore.create({
        id: identity.jobId,
        storeVersion: 1,
        projectId,
        status: 'queued',
        stage: 'queued',
        message: '任务已排队，等待生成',
        input: {
          request: body.text,
          parentVersionId: parentVersionId ?? null,
          mode: snapshot.project.mode,
          ...(snapshot.project.targetAge === undefined
            ? {}
            : { targetAge: snapshot.project.targetAge }),
        },
        code: '',
        createdAt: identity.createdAt,
        updatedAt: identity.createdAt,
      });
      return NextResponse.json(
        {
          success: true,
          projectId,
          jobId: identity.jobId,
          pollUrl: `/api/studio/jobs/${identity.jobId}`,
          pollIntervalMs: 500,
        },
        { status: 202 },
      );
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function createStudioRollbackPostHandler(deps: { projectStore: StudioStore }) {
  return async function POST(
    request: NextRequest,
    context: { params: Promise<{ projectId: string }> },
  ): Promise<NextResponse> {
    try {
      const body = rollbackSchema.parse(await request.json());
      const { projectId } = await context.params;
      const snapshot = await deps.projectStore.read(projectId);
      if (!snapshot) return fail('PROJECT_NOT_FOUND', '项目不存在。', 404);
      if (!snapshot.versions.some((version) => version.id === body.versionId)) {
        return fail('VERSION_NOT_FOUND', '版本不存在。', 404);
      }
      const next = await withStudioProject(deps.projectStore, projectId, (current) =>
        rollbackStudioProject(current, body.versionId),
      );
      return NextResponse.json({ success: true, project: next.project });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function createStudioRuntimeErrorPostHandler(deps: { projectStore: StudioStore }) {
  return async function POST(
    request: NextRequest,
    context: { params: Promise<{ projectId: string; versionId: string }> },
  ): Promise<NextResponse> {
    try {
      const body = runtimeErrorsSchema.parse(await request.json());
      const { projectId, versionId } = await context.params;
      const snapshot = await deps.projectStore.read(projectId);
      if (!snapshot) return fail('PROJECT_NOT_FOUND', '项目不存在。', 404);
      if (!snapshot.versions.some((version) => version.id === versionId)) {
        return fail('VERSION_NOT_FOUND', '版本不存在。', 404);
      }
      const occurredAt = new Date().toISOString();
      const next = await withStudioProject(deps.projectStore, projectId, (current) =>
        attachStudioRuntimeErrors(
          current,
          versionId,
          body.errors.map((error) => ({ ...error, occurredAt: error.occurredAt ?? occurredAt })),
        ),
      );
      const version = next.versions.find((entry) => entry.id === versionId)!;
      return NextResponse.json({ success: true, runtimeErrors: version.runtimeErrors });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function createStudioJobGetHandler(deps: { jobStore: StudioJobStore }) {
  return async function GET(
    request: NextRequest,
    context: { params: Promise<{ jobId: string }> },
  ): Promise<NextResponse> {
    try {
      const { jobId } = await context.params;
      if (!/^job_[a-zA-Z0-9_-]+$/.test(jobId)) {
        return fail('INVALID_REQUEST', '无效的任务编号。', 400);
      }
      const job = await deps.jobStore.read(jobId);
      if (!job) return fail('JOB_NOT_FOUND', '生成任务不存在。', 404);
      const since = Number(request.nextUrl.searchParams.get('since') ?? 0);
      return NextResponse.json({
        success: true,
        ...projectStudioJobForClient(job, Number.isFinite(since) ? since : 0),
      });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
