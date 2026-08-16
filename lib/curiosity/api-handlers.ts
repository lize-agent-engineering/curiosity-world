import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { curiosityExperienceSpecSchema } from './contracts';
import {
  curiosityExperienceSpecV2Schema,
  knowledgeDesignArtifactV1Schema,
  type CuriosityAgentRole,
} from './agent-contracts';
import type {
  CuriosityPipelineIdentities,
  CuriosityPipelineModel,
  CuriosityPipelineModels,
} from './agent-pipeline';
import { curiosityPipelineArtifactSchema } from './agent-pipeline';
import {
  type CuriosityGenerationInput,
  type CuriosityJobStore,
  runCuriosityGenerationJob,
} from './jobs';
import { classifyCuriosityRequest, CuriosityDomainError } from './knowledge';
import {
  createCuriosityRevisionCandidateV2,
  CuriosityRevisionPipelineError,
  type CuriosityRevisionIdentity,
} from './revision-pipeline';

const firstGenerationInputSchema = z.strictObject({
  question: z.string().trim().min(4).max(240),
  targetAge: z.number().int(),
});

const regenerationInputSchema = z
  .strictObject({
    question: z.string().trim().min(4).max(240),
    age: z.number().int(),
    interests: z.array(z.string().trim().min(1).max(30)).max(5).default([]),
    perspectiveDirective: z.string().trim().min(4).max(120).optional(),
    experienceId: z
      .string()
      .regex(/^cur_[a-zA-Z0-9_-]+$/)
      .optional(),
    revision: z.number().int().min(2).optional(),
    preservedCausalRelations: knowledgeDesignArtifactV1Schema.shape.causalRelations.optional(),
  })
  .superRefine((input, context) => {
    if (Boolean(input.experienceId) !== Boolean(input.revision)) {
      context.addIssue({
        code: 'custom',
        path: ['experienceId'],
        message: 'existing experience and revision must be supplied together',
      });
    }
    if (input.experienceId && !input.preservedCausalRelations) {
      context.addIssue({
        code: 'custom',
        path: ['preservedCausalRelations'],
        message: 'regeneration must preserve the active causal model',
      });
    }
  });

const generationInputSchema = z.union([firstGenerationInputSchema, regenerationInputSchema]);

const revisionInputSchema = z.strictObject({
  baseSpec: curiosityExperienceSpecSchema,
  experienceSpec: curiosityExperienceSpecV2Schema,
  sourceArtifacts: z.array(curiosityPipelineArtifactSchema).min(1).max(20),
  instruction: z.string().trim().min(2).max(240),
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

const INITIAL_GENERATION_ROLES = [
  'curiosity.question-modeler',
  'curiosity.knowledge-designer',
  'curiosity.interaction-designer',
  'curiosity.presentation-designer',
  'curiosity.quality-reviewer',
] as const;

function errorResponse(error: unknown): NextResponse {
  if (error instanceof CuriosityModelUnavailableError) {
    return NextResponse.json(
      { success: false, errorCode: error.code, error: error.message },
      { status: 503 },
    );
  }
  if (error instanceof CuriosityDomainError) {
    const status = error.code === 'UNSAFE_CONTENT' ? 400 : 422;
    return NextResponse.json(
      { success: false, errorCode: error.code, error: error.message },
      { status },
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

export function createCuriosityGenerationPostHandler(deps: {
  store: CuriosityJobStore;
  resolveRoleModel: RoleModelResolver<CuriosityGenerationInput>;
  schedule: (work: () => Promise<void>) => void;
  identityFactory: (body: CuriosityGenerationInput) => CuriosityPipelineIdentities & {
    jobId: string;
  };
}) {
  return async function POST(request: NextRequest): Promise<NextResponse> {
    try {
      const requestBody = generationInputSchema.parse(await request.json());
      classifyCuriosityRequest(requestBody);
      const body: CuriosityGenerationInput =
        'targetAge' in requestBody
          ? { question: requestBody.question, targetAge: requestBody.targetAge }
          : {
              question: requestBody.question,
              targetAge: requestBody.age,
              experienceId: requestBody.experienceId,
              revision: requestBody.revision,
              perspectiveDirective: requestBody.perspectiveDirective,
              preservedCausalRelations: requestBody.preservedCausalRelations,
            };
      const entries = await Promise.all(
        INITIAL_GENERATION_ROLES.map(
          async (role) => [role, await deps.resolveRoleModel(request, body, role)] as const,
        ),
      );
      const models = Object.fromEntries(entries) as CuriosityPipelineModels;
      const identity = deps.identityFactory(body);
      await deps.store.create({
        id: identity.jobId,
        status: 'queued',
        step: 'queued',
        progress: 0,
        message: '生成任务已创建',
        input: body,
        runId: identity.runId,
        completedStages: [],
        artifacts: [],
        agentRuns: [],
        createdAt: identity.createdAt,
        updatedAt: identity.createdAt,
      });
      deps.schedule(() =>
        runCuriosityGenerationJob(identity.jobId, body, models, deps.store, identity),
      );
      return NextResponse.json(
        {
          success: true,
          jobId: identity.jobId,
          status: 'queued',
          step: 'queued',
          progress: 0,
          pollUrl: `/api/curiosity/generations/${identity.jobId}`,
          pollIntervalMs: 500,
        },
        { status: 202 },
      );
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

export function createCuriosityRevisionPostHandler(deps: {
  resolveRoleModel: RoleModelResolver<z.infer<typeof revisionInputSchema>>;
  identityFactory: () => CuriosityRevisionIdentity;
}) {
  return async function POST(
    request: NextRequest,
    context: { params: Promise<{ experienceId: string }> },
  ): Promise<NextResponse> {
    try {
      const body = revisionInputSchema.parse(await request.json());
      const { experienceId } = await context.params;
      if (body.baseSpec.experienceId !== experienceId) {
        return NextResponse.json(
          { success: false, errorCode: 'INVALID_REQUEST', error: '体验编号与基础版本不匹配。' },
          { status: 400 },
        );
      }
      const [planner, quality] = await Promise.all([
        deps.resolveRoleModel(request, body, 'curiosity.revision-planner'),
        deps.resolveRoleModel(request, body, 'curiosity.quality-reviewer'),
      ]);
      const candidate = await createCuriosityRevisionCandidateV2(
        {
          runtimeSpec: body.baseSpec,
          experienceSpec: body.experienceSpec,
          sourceArtifacts: body.sourceArtifacts,
          instruction: body.instruction,
        },
        { planner, quality },
        deps.identityFactory(),
      );
      return NextResponse.json({
        success: true,
        candidateReady: true,
        impact: candidate.impact,
        patch: candidate.patch,
        spec: candidate.runtimeSpec,
        experienceSpec: candidate.spec,
        artifacts: candidate.artifacts,
        agentRuns: candidate.agentRuns,
        specHash: candidate.compiled.specHash,
      });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
