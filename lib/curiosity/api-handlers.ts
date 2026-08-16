import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import type { CuriosityPipelineIdentities, CuriosityPipelineModel } from './agent-pipeline';
import type { CuriosityAgentRole } from './agent-contracts';
import type { CuriosityExperienceSnapshot } from './repository';
import { type CuriosityGenerationInput, type CuriosityJobStore } from './jobs';
import { classifyCuriosityRequest, CuriosityDomainError } from './knowledge';
import {
  createCuriosityRevisionCandidateV3,
  CuriosityRevisionPipelineError,
  type CuriosityRevisionIdentity,
} from './revision-pipeline';

const generationInputSchema = z.strictObject({
  question: z.string().trim().min(4).max(240),
  targetAge: z.number().int().min(6).max(10),
});
const revisionInputSchema = z.strictObject({
  baseVersionId: z.string().regex(/^ver_[a-zA-Z0-9_-]+$/),
  instruction: z.string().trim().min(2).max(240),
});
const regenerationInputSchema = z.strictObject({
  baseVersionId: z.string().regex(/^ver_[a-zA-Z0-9_-]+$/),
  targetAge: z.number().int().min(6).max(10),
  directive: z.string().trim().min(4).max(120),
});

export class CuriosityModelUnavailableError extends Error {
  readonly code = 'MODEL_UNAVAILABLE';
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CuriosityModelUnavailableError';
  }
}

type RoleModelResolver<TBody> = (
  request: NextRequest,
  body: TBody,
  role: CuriosityAgentRole,
) => Promise<CuriosityPipelineModel>;

function errorResponse(error: unknown): NextResponse {
  if (error instanceof CuriosityModelUnavailableError) {
    return NextResponse.json(
      { success: false, errorCode: error.code, error: error.message },
      { status: 503 },
    );
  }
  if (error instanceof CuriosityDomainError) {
    return NextResponse.json(
      { success: false, errorCode: error.code, error: error.message },
      { status: error.code === 'UNSAFE_CONTENT' ? 400 : 422 },
    );
  }
  if (error instanceof CuriosityRevisionPipelineError) {
    return NextResponse.json(
      { success: false, errorCode: error.code, error: error.message },
      { status: 422 },
    );
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { success: false, errorCode: 'INVALID_REQUEST', error: '请求不符合 Curiosity Schema。' },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { success: false, errorCode: 'INTERNAL_ERROR', error: 'Curiosity 服务发生内部错误。' },
    { status: 500 },
  );
}

async function enqueueGeneration(input: {
  body: CuriosityGenerationInput;
  store: CuriosityJobStore;
  identity: CuriosityPipelineIdentities & { jobId: string };
}): Promise<NextResponse> {
  await input.store.create({
    id: input.identity.jobId,
    storeVersion: 1,
    status: 'queued',
    step: 'queued',
    progress: 0,
    message: '生成任务已创建',
    input: input.body,
    identity: input.identity,
    runId: input.identity.runId,
    completedStages: [],
    artifacts: [],
    agentRuns: [],
    createdAt: input.identity.createdAt,
    updatedAt: input.identity.createdAt,
  });
  return NextResponse.json(
    {
      success: true,
      jobId: input.identity.jobId,
      status: 'queued',
      step: 'queued',
      progress: 0,
      pollUrl: `/api/curiosity/generations/${input.identity.jobId}`,
      pollIntervalMs: 500,
    },
    { status: 202 },
  );
}

export function createCuriosityGenerationPostHandler(deps: {
  store: CuriosityJobStore;
  identityFactory: (
    body: CuriosityGenerationInput,
  ) => CuriosityPipelineIdentities & { jobId: string };
}) {
  return async function POST(request: NextRequest): Promise<NextResponse> {
    try {
      const body = generationInputSchema.parse(await request.json());
      classifyCuriosityRequest(body);
      const identity = deps.identityFactory(body);
      return enqueueGeneration({ body, identity, store: deps.store });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function createCuriosityGenerationGetHandler(deps: { store: CuriosityJobStore }) {
  return async function GET(
    _request: NextRequest,
    context: { params: Promise<{ jobId: string }> },
  ): Promise<NextResponse> {
    try {
      const { jobId } = await context.params;
      if (!/^[a-zA-Z0-9_-]+$/.test(jobId)) {
        return NextResponse.json(
          { success: false, errorCode: 'INVALID_REQUEST', error: '无效的任务编号。' },
          { status: 400 },
        );
      }
      const job = await deps.store.read(jobId);
      if (!job) {
        return NextResponse.json(
          { success: false, errorCode: 'JOB_NOT_FOUND', error: '生成任务不存在。' },
          { status: 404 },
        );
      }
      return NextResponse.json({
        success: true,
        ...job,
        done: job.status === 'candidate_ready' || job.status === 'failed',
      });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

function findBaseVersion(snapshot: CuriosityExperienceSnapshot | null, versionId: string) {
  return snapshot?.versions.find((version) => version.id === versionId);
}

type RevisionCandidateInput = {
  baseVersionId: string;
  spec: CuriosityExperienceSnapshot['versions'][number]['spec'];
  instruction: string;
  experienceId: string;
};

export function createCuriosityRevisionPostHandler(deps: {
  loadExperience: (experienceId: string) => Promise<CuriosityExperienceSnapshot | null>;
  createCandidate?: (
    input: RevisionCandidateInput,
    request: NextRequest,
  ) => Promise<{
    spec: RevisionCandidateInput['spec'];
    specHash: string;
    artifacts: Record<string, unknown>[];
    agentRuns: Record<string, unknown>[];
    patch?: Record<string, unknown>;
    quality?: Record<string, unknown>;
  }>;
  resolveRoleModel?: RoleModelResolver<RevisionCandidateInput>;
  identityFactory?: () => CuriosityRevisionIdentity;
}) {
  return async function POST(
    request: NextRequest,
    context: { params: Promise<{ experienceId: string }> },
  ): Promise<NextResponse> {
    try {
      const body = revisionInputSchema.parse(await request.json());
      const { experienceId } = await context.params;
      const snapshot = await deps.loadExperience(experienceId);
      const base = findBaseVersion(snapshot, body.baseVersionId);
      if (!base) {
        return NextResponse.json(
          { success: false, errorCode: 'VERSION_NOT_FOUND', error: '基础版本不存在。' },
          { status: 404 },
        );
      }
      const input = { ...body, experienceId, spec: base.spec };
      const identity = deps.identityFactory?.();
      let candidate;
      if (deps.createCandidate) {
        candidate = await deps.createCandidate(input, request);
      } else {
        if (!deps.resolveRoleModel || !identity) throw new Error('REVISION_HANDLER_NOT_CONFIGURED');
        const [planner, quality] = await Promise.all([
          deps.resolveRoleModel(request, input, 'curiosity.revision-planner'),
          deps.resolveRoleModel(request, input, 'curiosity.quality-reviewer'),
        ]);
        candidate = await createCuriosityRevisionCandidateV3(input, { planner, quality }, identity);
      }
      return NextResponse.json({
        success: true,
        candidateReady: true,
        experienceId,
        baseVersionId: body.baseVersionId,
        ...(identity
          ? {
              versionId: identity.versionId,
              revision: base.revision + 1,
              createdAt: identity.createdAt,
            }
          : {}),
        ...candidate,
      });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function createCuriosityRegenerationPostHandler(deps: {
  store: CuriosityJobStore;
  loadExperience: (experienceId: string) => Promise<CuriosityExperienceSnapshot | null>;
  identityFactory: (
    experienceId: string,
    revision: number,
  ) => CuriosityPipelineIdentities & { jobId: string };
}) {
  return async function POST(
    request: NextRequest,
    context: { params: Promise<{ experienceId: string }> },
  ): Promise<NextResponse> {
    try {
      const body = regenerationInputSchema.parse(await request.json());
      const { experienceId } = await context.params;
      const snapshot = await deps.loadExperience(experienceId);
      const base = findBaseVersion(snapshot, body.baseVersionId);
      if (!base) {
        return NextResponse.json(
          { success: false, errorCode: 'VERSION_NOT_FOUND', error: '基础版本不存在。' },
          { status: 404 },
        );
      }
      const generationInput: CuriosityGenerationInput = {
        question: base.spec.question.original,
        targetAge: body.targetAge,
        experienceId,
        revision: base.revision + 1,
        perspectiveDirective: body.directive,
        preservedKnowledge: base.spec.knowledge,
      };
      const identity = deps.identityFactory(experienceId, base.revision + 1);
      if (identity.experienceId !== experienceId || identity.revision !== base.revision + 1) {
        throw new Error('REGENERATION_IDENTITY_MISMATCH');
      }
      return enqueueGeneration({
        body: generationInput,
        store: deps.store,
        identity,
      });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
