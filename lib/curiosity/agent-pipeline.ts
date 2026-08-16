import { z } from 'zod';

import {
  curiosityAgentRunSchema,
  knowledgeDesignArtifactV1BaseSchema,
  knowledgeDesignArtifactV1Schema,
  qualityReviewArtifactV1Schema,
  questionModelArtifactV1Schema,
  type CuriosityAgentRole,
  type CuriosityAgentRun,
  type KnowledgeDesignArtifactV1,
  type QualityReviewArtifactV1,
  type QuestionModelArtifactV1,
} from './agent-contracts';
import type { CuriosityRoleRoute } from './agent-routing';
import { renderCuriosityRoleSkill } from './agent-skills';
import {
  CURIOSITY_EVENT_TYPES_V3,
  curiosityEventTypeV3Schema,
  curiosityExperienceSpecV3Schema,
  curiositySceneV3Schema,
  curiosityShortTextV3Schema,
  validateCuriosityExperienceSpecV3,
  type CuriosityExperienceSpecV3,
} from './experience-spec-v3';
import { classifyCuriosityRequest } from './knowledge';
import { knowledgeRegistry } from './knowledge/registry';
import type { CuriosityTextModel } from './model';
import { parseCuriosityModelJson } from './model-json';
import { canonicalizeCuriosityQuality, CURIOSITY_QUALITY_CRITERIA } from './quality';
import { getCuriositySceneEntry, type CuriositySceneType } from './scenes/registry';

type GenerationRole = Exclude<CuriosityAgentRole, 'curiosity.revision-planner'>;

export interface CuriosityPipelineModel extends CuriosityTextModel {
  route: CuriosityRoleRoute;
}

export type CuriosityPipelineModels = Record<GenerationRole, CuriosityPipelineModel>;

export interface CuriosityAgentPipelineInput {
  question: string;
  targetAge: number;
  perspectiveDirective?: string;
  preservedCausalRelations?: KnowledgeDesignArtifactV1['causalRelations'];
  preservedKnowledge?: CuriosityExperienceSpecV3['knowledge'];
}

export interface CuriosityPipelineIdentities {
  runId: string;
  experienceId: string;
  versionId: string;
  revision?: number;
  createdAt: string;
  artifactIds: {
    question: string;
    knowledge: string;
    scene: string;
    presentation: string;
    spec?: string;
    quality: string;
  };
  agentRunIds: {
    question: string;
    knowledge: string;
    scene: string;
    presentation: string;
    quality: string;
  };
}

const identifierSchema = z
  .string()
  .min(3)
  .max(96)
  .regex(/^[a-zA-Z0-9_-]+$/);
const artifactEnvelope = {
  artifactId: identifierSchema,
  runId: identifierSchema,
  createdAt: z.iso.datetime(),
  upstreamArtifactIds: z.array(identifierSchema).max(8),
  knowledgePackVersion: z.string().trim().min(1).max(96),
};

export const curiositySceneDesignArtifactSchema = z.strictObject({
  ...artifactEnvelope,
  agentRole: z.literal('curiosity.interaction-designer'),
  schemaVersion: z.literal('3.0'),
  scene: curiositySceneV3Schema,
  feedback: z
    .array(
      z.strictObject({
        trigger: identifierSchema,
        message: curiosityShortTextV3Schema,
        explains: curiosityShortTextV3Schema,
      }),
    )
    .min(1)
    .max(12),
});

export const curiosityPresentationArtifactSchema = z.strictObject({
  ...artifactEnvelope,
  agentRole: z.literal('curiosity.presentation-designer'),
  schemaVersion: z.literal('3.0'),
  sourceArtifactIds: z.strictObject({
    questionModel: identifierSchema,
    knowledgeDesign: identifierSchema,
    sceneDesign: identifierSchema,
  }),
  narrationLibrary: z
    .array(
      z.strictObject({
        id: identifierSchema,
        eventType: curiosityEventTypeV3Schema,
        action: z.union([z.literal('*'), identifierSchema]),
        text: curiosityShortTextV3Schema,
      }),
    )
    .min(2)
    .max(32),
  discoveryPrompts: z
    .array(
      z.strictObject({
        id: identifierSchema,
        prompt: curiosityShortTextV3Schema,
        skippable: z.literal(true),
      }),
    )
    .max(3),
  limitations: z.array(curiosityShortTextV3Schema).min(1).max(12),
});

export type CuriositySceneDesignArtifact = z.infer<typeof curiositySceneDesignArtifactSchema>;
export type CuriosityPresentationArtifact = z.infer<typeof curiosityPresentationArtifactSchema>;
export type CuriosityPipelineArtifact =
  | QuestionModelArtifactV1
  | KnowledgeDesignArtifactV1
  | CuriositySceneDesignArtifact
  | CuriosityPresentationArtifact
  | QualityReviewArtifactV1;

export const curiosityPipelineArtifactSchema = z.union([
  questionModelArtifactV1Schema,
  knowledgeDesignArtifactV1Schema,
  curiositySceneDesignArtifactSchema,
  curiosityPresentationArtifactSchema,
  qualityReviewArtifactV1Schema,
]);

export type CuriosityPipelineStage =
  | 'question'
  | 'knowledge'
  | 'scene'
  | 'presentation'
  | 'quality';

export interface CuriosityPipelineStageUpdate {
  stage: CuriosityPipelineStage;
  artifactId: string;
  artifacts: CuriosityPipelineArtifact[];
  agentRuns: CuriosityAgentRun[];
}

export interface CuriosityAgentPipelineResult {
  artifacts: CuriosityPipelineArtifact[];
  agentRuns: CuriosityAgentRun[];
  spec: CuriosityExperienceSpecV3;
  specHash: string;
  qualityRetryCount: 0 | 1;
  schemaRepairs: number;
}

export type CuriosityPipelineFailureCode =
  | 'QUESTION_MODEL_INVALID'
  | 'KNOWLEDGE_DESIGN_INVALID'
  | 'SCENE_DESIGN_INVALID'
  | 'PRESENTATION_INVALID'
  | 'DETERMINISTIC_VALIDATION_FAILED'
  | 'QUALITY_REVIEW_INVALID'
  | 'QUALITY_REJECTED';

export class CuriosityAgentPipelineError extends Error {
  constructor(
    readonly failureCode: CuriosityPipelineFailureCode,
    readonly failedRole: GenerationRole,
    message: string,
    readonly artifacts: CuriosityPipelineArtifact[],
    readonly agentRuns: CuriosityAgentRun[],
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CuriosityAgentPipelineError';
  }
}

const envelopeKeys = {
  artifactId: true,
  runId: true,
  agentRole: true,
  schemaVersion: true,
  createdAt: true,
  upstreamArtifactIds: true,
  knowledgePackVersion: true,
} as const;
const executableContent =
  /<\/?(?:script|style|html|body)|\b(?:javascript:|function\s*\(|document\.|window\.|eval\s*\()|=>|\{\s*(?:display|color|position)\s*:/i;

function assertNoExecutableModelContent(value: unknown): void {
  if (typeof value === 'string') {
    if (executableContent.test(value)) throw new Error('MODEL_CODE_FORBIDDEN');
    return;
  }
  if (Array.isArray(value)) return value.forEach(assertNoExecutableModelContent);
  if (value && typeof value === 'object')
    Object.values(value).forEach(assertNoExecutableModelContent);
}

function contentPolicy(question: string): string[] {
  const policies = [
    '危险、违法和成人内容必须拒绝，不得提供操作步骤。',
    '时效性内容必须标注生成时间并说明信息可能变化。',
    '争议问题必须区分可核查事实与观点。',
    '不得伪造来源；家长视图必须说明内容未经联网核验。',
  ];
  if (/医疗|生病|疼|痛|药|心理|焦虑|抑郁|法律|违法|律师|法院/i.test(question)) {
    policies.push('医疗、心理和法律问题只提供适龄通识，并明确建议向可信成人或专业人士求助。');
  }
  return policies;
}

const questionOutputBaseSchema = questionModelArtifactV1Schema.omit(envelopeKeys);
const commonKnowledgeOutputSchema = knowledgeDesignArtifactV1BaseSchema.omit({
  ...envelopeKeys,
  source: true,
  knowledgeFamily: true,
  packId: true,
});
const openKnowledgeOutputSchema = commonKnowledgeOutputSchema.extend({
  claims: knowledgeDesignArtifactV1BaseSchema.shape.claims.unwrap().min(1),
  relations: knowledgeDesignArtifactV1BaseSchema.shape.relations.unwrap().min(1),
  allowedExplanations: knowledgeDesignArtifactV1BaseSchema.shape.allowedExplanations
    .unwrap()
    .min(1),
  uncertainties: knowledgeDesignArtifactV1BaseSchema.shape.uncertainties.unwrap().min(1),
  timeSensitive: z.boolean(),
});
const sceneOutputSchema = z.strictObject({
  scene: curiositySceneV3Schema,
  feedback: curiositySceneDesignArtifactSchema.shape.feedback,
});
const presentationOutputSchema = curiosityPresentationArtifactSchema.omit({
  ...envelopeKeys,
  agentRole: true,
  schemaVersion: true,
  sourceArtifactIds: true,
});
const qualityOutputSchema = z.strictObject({
  checks: z
    .array(
      z.strictObject({
        criterion: z.enum(CURIOSITY_QUALITY_CRITERIA),
        status: z.enum(['pass', 'reject']),
        findings: z.array(z.string().trim().min(1).max(240)).max(8),
      }),
    )
    .length(CURIOSITY_QUALITY_CRITERIA.length),
  verdict: z.enum(['pass', 'reject']),
});

const MAX_MODEL_OUTPUT_ATTEMPTS = 3;

function parseModelOutput<T>(raw: string, schema: z.ZodType<T>): T {
  const parsed = parseCuriosityModelJson(raw, z.unknown());
  assertNoExecutableModelContent(parsed);
  return schema.parse(parsed);
}

function isRetryableModelOutputError(error: unknown, depth = 0): boolean {
  if (error instanceof z.ZodError || error instanceof SyntaxError) return true;
  if (!(error instanceof Error) || depth >= 4) return false;
  if (error.name === 'AI_NoObjectGeneratedError' || error.name === 'AI_TypeValidationError')
    return true;
  return isRetryableModelOutputError(error.cause, depth + 1);
}

function modelValidationSummary(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join('.') || '$'}:${issue.code}`)
      .join(',');
  }
  if (error instanceof SyntaxError) return '$:invalid_json';
  return error instanceof Error ? `$:${error.message}` : '$:invalid_output';
}

function modelRoute(model: CuriosityPipelineModel) {
  return {
    providerId: model.route.providerId,
    modelId: model.route.modelId,
    ...(model.route.thinkingConfig ? { thinking: model.route.thinkingConfig } : {}),
  };
}

function suffix(value: string, attempt: number): string {
  return attempt === 0 ? value : `${value}_retry`;
}

function buildExperienceSpec(input: {
  pipelineInput: CuriosityAgentPipelineInput;
  route: ReturnType<typeof classifyCuriosityRequest>;
  question: QuestionModelArtifactV1;
  knowledge: KnowledgeDesignArtifactV1;
  scene: CuriositySceneDesignArtifact;
  presentation: CuriosityPresentationArtifact;
}): CuriosityExperienceSpecV3 {
  const claims =
    input.knowledge.claims.length > 0
      ? input.knowledge.claims.map((claim) => claim.statement)
      : input.knowledge.causalRelations.map(
          (relation) => `${relation.cause}${relation.relation}${relation.effect}。`,
        );
  const spec = curiosityExperienceSpecV3Schema.parse({
    question: {
      original: input.pipelineInput.question,
      core: input.question.coreQuestion,
    },
    targetAge: input.pipelineInput.targetAge,
    route:
      input.route.kind === 'curated'
        ? { kind: 'curated', family: input.route.family }
        : { kind: 'open' },
    knowledge: input.pipelineInput.preservedKnowledge ?? {
      source: input.route.kind,
      packId: input.knowledge.packId,
      claims,
      relations: input.knowledge.relations.map((relation) => ({
        id: relation.id,
        from: relation.fromClaimId,
        relation: relation.relation,
        to: relation.toClaimId,
      })),
      misconceptions: input.knowledge.misconceptions,
      uncertainties: input.knowledge.uncertainties,
      observationSuggestions: input.knowledge.observationSuggestions,
      timeSensitive: input.knowledge.timeSensitive ?? false,
    },
    scene: input.scene.scene,
    narrationLibrary: input.presentation.narrationLibrary,
    discoveryPrompts: input.presentation.discoveryPrompts,
    limitations: [
      ...input.presentation.limitations.slice(0, input.knowledge.timeSensitive ? 10 : 11),
      '本内容由模型知识生成，未经联网核验。',
      ...(input.knowledge.timeSensitive
        ? [`生成时间：${input.question.createdAt.slice(0, 10)}；相关信息可能变化。`]
        : []),
    ],
    eventRequirements: [...CURIOSITY_EVENT_TYPES_V3],
  });
  getCuriositySceneEntry(spec.scene.type as CuriositySceneType).validate(
    spec.scene,
    spec.targetAge,
  );
  return spec;
}

export async function runCuriosityAgentPipeline(
  input: CuriosityAgentPipelineInput,
  models: CuriosityPipelineModels,
  identities: CuriosityPipelineIdentities,
  onStage?: (update: CuriosityPipelineStageUpdate) => void | Promise<void>,
  resume?: { artifacts: CuriosityPipelineArtifact[]; agentRuns: CuriosityAgentRun[] },
): Promise<CuriosityAgentPipelineResult> {
  const route = classifyCuriosityRequest(input);
  const safetyPolicy = contentPolicy(input.question);
  const artifacts: CuriosityPipelineArtifact[] = structuredClone(resume?.artifacts ?? []);
  const agentRuns: CuriosityAgentRun[] = structuredClone(resume?.agentRuns ?? []);
  let schemaRepairs = 0;
  const notify = async (stage: CuriosityPipelineStage, artifactId: string) =>
    onStage?.({
      stage,
      artifactId,
      artifacts: structuredClone(artifacts),
      agentRuns: structuredClone(agentRuns),
    });

  const execute = async <T>(parameters: {
    role: GenerationRole;
    stage: CuriosityPipelineStage;
    failureCode: CuriosityPipelineFailureCode;
    agentRunId: string;
    artifactId: string;
    upstreamArtifactIds: string[];
    prompt: string;
    schema: z.ZodType<T>;
    build: (output: T) => CuriosityPipelineArtifact;
  }): Promise<CuriosityPipelineArtifact> => {
    const selectedModel = models[parameters.role];
    const startedAt = new Date().toISOString();
    try {
      let output: T | undefined;
      let lastError: unknown;
      for (let attempt = 1; attempt <= MAX_MODEL_OUTPUT_ATTEMPTS; attempt += 1) {
        try {
          if (attempt > 1) schemaRepairs += 1;
          const raw = await selectedModel.complete({
            system: `你是 ${parameters.role}。\n${renderCuriosityRoleSkill(parameters.role)}\n只返回严格 JSON，不得输出隐藏思维链。不得输出 HTML、CSS、JavaScript、函数或表达式。响应 Schema 已由系统强制校验。`,
            prompt:
              attempt === 1
                ? parameters.prompt
                : `${parameters.prompt}\n上一轮输出未通过 Schema：${modelValidationSummary(lastError)}。请完整重写。`,
            schema: parameters.schema,
          });
          output = parseModelOutput(raw, parameters.schema);
          break;
        } catch (error) {
          lastError = error;
          if (!isRetryableModelOutputError(error) || attempt === MAX_MODEL_OUTPUT_ATTEMPTS)
            throw error;
        }
      }
      if (output === undefined) throw lastError;
      const artifact = parameters.build(output);
      artifacts.push(artifact);
      agentRuns.push(
        curiosityAgentRunSchema.parse({
          agentRunId: parameters.agentRunId,
          runId: identities.runId,
          experienceId: identities.experienceId,
          candidateVersionId: identities.versionId,
          agentRole: parameters.role,
          route: modelRoute(selectedModel),
          startedAt,
          endedAt: new Date().toISOString(),
          status: 'succeeded',
          inputArtifactIds: parameters.upstreamArtifactIds,
          outputArtifactIds: [parameters.artifactId],
        }),
      );
      await notify(parameters.stage, parameters.artifactId);
      return artifact;
    } catch (error) {
      agentRuns.push(
        curiosityAgentRunSchema.parse({
          agentRunId: parameters.agentRunId,
          runId: identities.runId,
          experienceId: identities.experienceId,
          candidateVersionId: identities.versionId,
          agentRole: parameters.role,
          route: modelRoute(selectedModel),
          startedAt,
          endedAt: new Date().toISOString(),
          status: 'failed',
          failureCode: parameters.failureCode,
          inputArtifactIds: parameters.upstreamArtifactIds,
          outputArtifactIds: [],
        }),
      );
      throw new CuriosityAgentPipelineError(
        parameters.failureCode,
        parameters.role,
        `${parameters.role} 输出未通过严格 Schema（${modelValidationSummary(error)}）。`,
        structuredClone(artifacts),
        structuredClone(agentRuns),
        error,
      );
    }
  };

  const ageBand = input.targetAge <= 7 ? '6-7' : '8-10';
  const questionSchema = questionOutputBaseSchema.extend({
    ageBand: z.literal(ageBand),
    supportStatus: z.literal('supported'),
    knowledgeRoute: z.literal(route.kind),
    knowledgeFamilyCandidates:
      route.kind === 'curated'
        ? z.array(z.literal(route.family)).length(1)
        : z.array(z.enum(['relative-motion', 'balance-support', 'light-path', 'open'])).max(3),
  });
  const resumedQuestion = artifacts.find(
    (artifact): artifact is QuestionModelArtifactV1 =>
      artifact.agentRole === 'curiosity.question-modeler',
  );
  const question =
    resumedQuestion ??
    ((await execute({
      role: 'curiosity.question-modeler',
      stage: 'question',
      failureCode: 'QUESTION_MODEL_INVALID',
      agentRunId: identities.agentRunIds.question,
      artifactId: identities.artifactIds.question,
      upstreamArtifactIds: [],
      prompt: JSON.stringify({ input, route, safetyPolicy }),
      schema: questionSchema,
      build: (output) =>
        questionModelArtifactV1Schema.parse({
          ...output,
          artifactId: identities.artifactIds.question,
          runId: identities.runId,
          agentRole: 'curiosity.question-modeler',
          schemaVersion: '1.0',
          createdAt: identities.createdAt,
          upstreamArtifactIds: [],
          knowledgePackVersion: route.kind === 'curated' ? '1.0.0' : 'generated-1',
        }),
    })) as QuestionModelArtifactV1);

  const selectedPack =
    route.kind === 'curated'
      ? knowledgeRegistry.get(route.family).packs.find((candidate) => candidate.id === route.packId)
      : undefined;
  if (route.kind === 'curated' && !selectedPack) {
    throw new CuriosityAgentPipelineError(
      'KNOWLEDGE_DESIGN_INVALID',
      'curiosity.knowledge-designer',
      '策展知识包不存在。',
      artifacts,
      agentRuns,
    );
  }
  const resumedKnowledge = artifacts.find(
    (artifact): artifact is KnowledgeDesignArtifactV1 =>
      artifact.agentRole === 'curiosity.knowledge-designer',
  );
  const knowledge =
    resumedKnowledge ??
    ((await execute({
      role: 'curiosity.knowledge-designer',
      stage: 'knowledge',
      failureCode: 'KNOWLEDGE_DESIGN_INVALID',
      agentRunId: identities.agentRunIds.knowledge,
      artifactId: identities.artifactIds.knowledge,
      upstreamArtifactIds: [question.artifactId],
      prompt: JSON.stringify({
        question,
        route,
        curatedKnowledgePack: selectedPack,
        perspectiveDirective: input.perspectiveDirective,
        preservedKnowledge: input.preservedKnowledge,
        safetyPolicy,
      }),
      schema: route.kind === 'open' ? openKnowledgeOutputSchema : commonKnowledgeOutputSchema,
      build: (output) => {
        const artifact = knowledgeDesignArtifactV1Schema.parse({
          ...output,
          ...(input.preservedCausalRelations
            ? { causalRelations: input.preservedCausalRelations }
            : {}),
          artifactId: identities.artifactIds.knowledge,
          runId: identities.runId,
          agentRole: 'curiosity.knowledge-designer',
          schemaVersion: '1.0',
          createdAt: identities.createdAt,
          upstreamArtifactIds: [question.artifactId],
          knowledgePackVersion: selectedPack?.version ?? 'generated-1',
          source: route.kind,
          knowledgeFamily: route.kind === 'curated' ? route.family : 'open',
          packId:
            route.kind === 'curated' ? route.packId : `open.${identities.artifactIds.knowledge}`,
        });
        if (route.kind === 'curated')
          knowledgeRegistry.get(route.family).validateKnowledge(artifact);
        return artifact;
      },
    })) as KnowledgeDesignArtifactV1);

  let rejectionFeedback: string[] = [];
  const priorQuality = artifacts.filter(
    (artifact): artifact is QualityReviewArtifactV1 =>
      artifact.agentRole === 'curiosity.quality-reviewer',
  );
  const lastQuality = priorQuality.at(-1);
  if (lastQuality?.verdict === 'reject') {
    rejectionFeedback = lastQuality.checks
      .filter((check) => check.status === 'reject')
      .flatMap((check) => check.findings);
  }
  if (priorQuality.length >= 2 && lastQuality?.verdict === 'reject') {
    throw new CuriosityAgentPipelineError(
      'QUALITY_REJECTED',
      'curiosity.quality-reviewer',
      `质量审查两次拒绝候选体验：${rejectionFeedback.join('；') || '未提供原因'}`,
      artifacts,
      agentRuns,
    );
  }
  for (let attempt = Math.min(priorQuality.length, 1); attempt <= 1; attempt += 1) {
    const sceneArtifactId = suffix(identities.artifactIds.scene, attempt);
    const presentationArtifactId = suffix(identities.artifactIds.presentation, attempt);
    const qualityArtifactId = suffix(identities.artifactIds.quality, attempt);
    const allowedSceneTypes =
      route.kind === 'curated'
        ? [route.family]
        : ['variable', 'relation', 'timeline', 'comparison', 'process', 'situation'];
    const resumedScene = artifacts.find(
      (artifact): artifact is CuriositySceneDesignArtifact =>
        artifact.agentRole === 'curiosity.interaction-designer' &&
        artifact.artifactId === sceneArtifactId,
    );
    const scene =
      resumedScene ??
      ((await execute({
        role: 'curiosity.interaction-designer',
        stage: 'scene',
        failureCode: 'SCENE_DESIGN_INVALID',
        agentRunId: suffix(identities.agentRunIds.scene, attempt),
        artifactId: sceneArtifactId,
        upstreamArtifactIds: [question.artifactId, knowledge.artifactId],
        prompt: JSON.stringify({
          question,
          knowledge,
          allowedSceneTypes,
          modelCodePolicy: 'declarative-data-only',
          rejectionFeedback,
          perspectiveDirective: input.perspectiveDirective,
          safetyPolicy,
        }),
        schema: sceneOutputSchema,
        build: (output) => {
          if (!allowedSceneTypes.includes(output.scene.type)) {
            throw new Error(`SCENE_TYPE_NOT_ALLOWED: ${output.scene.type}`);
          }
          getCuriositySceneEntry(output.scene.type as CuriositySceneType).validate(
            output.scene,
            input.targetAge,
          );
          return curiositySceneDesignArtifactSchema.parse({
            ...output,
            artifactId: sceneArtifactId,
            runId: identities.runId,
            agentRole: 'curiosity.interaction-designer',
            schemaVersion: '3.0',
            createdAt: identities.createdAt,
            upstreamArtifactIds: [question.artifactId, knowledge.artifactId],
            knowledgePackVersion: knowledge.knowledgePackVersion,
          });
        },
      })) as CuriositySceneDesignArtifact);

    const resumedPresentation = artifacts.find(
      (artifact): artifact is CuriosityPresentationArtifact =>
        artifact.agentRole === 'curiosity.presentation-designer' &&
        artifact.artifactId === presentationArtifactId,
    );
    const presentation =
      resumedPresentation ??
      ((await execute({
        role: 'curiosity.presentation-designer',
        stage: 'presentation',
        failureCode: 'PRESENTATION_INVALID',
        agentRunId: suffix(identities.agentRunIds.presentation, attempt),
        artifactId: presentationArtifactId,
        upstreamArtifactIds: [question.artifactId, knowledge.artifactId, scene.artifactId],
        prompt: JSON.stringify({
          question,
          knowledge,
          scene,
          eventTypes: CURIOSITY_EVENT_TYPES_V3,
          narrationPolicy: 'generate-complete-reviewed-library-now;runtime-generation-forbidden',
          discoveryPromptLimit: 3,
          everyDiscoveryPromptSkippable: true,
          rejectionFeedback,
          perspectiveDirective: input.perspectiveDirective,
          safetyPolicy,
        }),
        schema: presentationOutputSchema,
        build: (output) =>
          curiosityPresentationArtifactSchema.parse({
            ...output,
            artifactId: presentationArtifactId,
            runId: identities.runId,
            agentRole: 'curiosity.presentation-designer',
            schemaVersion: '3.0',
            createdAt: identities.createdAt,
            upstreamArtifactIds: [question.artifactId, knowledge.artifactId, scene.artifactId],
            knowledgePackVersion: knowledge.knowledgePackVersion,
            sourceArtifactIds: {
              questionModel: question.artifactId,
              knowledgeDesign: knowledge.artifactId,
              sceneDesign: scene.artifactId,
            },
          }),
      })) as CuriosityPresentationArtifact);

    let spec: CuriosityExperienceSpecV3;
    let specHash: string;
    try {
      spec = buildExperienceSpec({
        pipelineInput: input,
        route,
        question,
        knowledge,
        scene,
        presentation,
      });
      ({ spec, specHash } = validateCuriosityExperienceSpecV3(spec));
    } catch (error) {
      throw new CuriosityAgentPipelineError(
        'DETERMINISTIC_VALIDATION_FAILED',
        'curiosity.interaction-designer',
        'V3 Schema、知识或场景检查失败。',
        artifacts,
        agentRuns,
        error,
      );
    }

    const resumedQuality = artifacts.find(
      (artifact): artifact is QualityReviewArtifactV1 =>
        artifact.agentRole === 'curiosity.quality-reviewer' &&
        artifact.artifactId === qualityArtifactId,
    );
    const quality =
      resumedQuality ??
      ((await execute({
        role: 'curiosity.quality-reviewer',
        stage: 'quality',
        failureCode: 'QUALITY_REVIEW_INVALID',
        agentRunId: suffix(identities.agentRunIds.quality, attempt),
        artifactId: qualityArtifactId,
        upstreamArtifactIds: [knowledge.artifactId, scene.artifactId, presentation.artifactId],
        prompt: JSON.stringify({
          reviewContract: {
            criteria: CURIOSITY_QUALITY_CRITERIA,
            reviewAllKnowledge: true,
            reviewCompleteScene: true,
            reviewEveryNarration: true,
            reviewEveryDiscoveryPrompt: true,
          },
          knowledge,
          scene,
          presentation,
          spec,
          safetyPolicy,
        }),
        schema: qualityOutputSchema,
        build: (output) =>
          qualityReviewArtifactV1Schema.parse({
            ...canonicalizeCuriosityQuality(output, 8),
            artifactId: qualityArtifactId,
            runId: identities.runId,
            agentRole: 'curiosity.quality-reviewer',
            schemaVersion: '1.0',
            createdAt: identities.createdAt,
            upstreamArtifactIds: [knowledge.artifactId, scene.artifactId, presentation.artifactId],
            knowledgePackVersion: knowledge.knowledgePackVersion,
          }),
      })) as QualityReviewArtifactV1);

    if (quality.verdict === 'pass') {
      return {
        artifacts,
        agentRuns,
        spec,
        specHash,
        qualityRetryCount: attempt as 0 | 1,
        schemaRepairs,
      };
    }
    rejectionFeedback = quality.checks
      .filter((check) => check.status === 'reject')
      .flatMap((check) => check.findings);
    if (attempt === 1) {
      throw new CuriosityAgentPipelineError(
        'QUALITY_REJECTED',
        'curiosity.quality-reviewer',
        `质量审查两次拒绝候选体验：${rejectionFeedback.join('；') || '未提供原因'}`,
        artifacts,
        agentRuns,
      );
    }
  }
  throw new Error('UNREACHABLE_PIPELINE_STATE');
}
