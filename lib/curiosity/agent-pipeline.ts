import { z } from 'zod';

import {
  CURIOSITY_EVENT_TYPES_V2,
  curiosityAgentRunSchema,
  curiosityExperienceSpecV2Schema,
  curiosityPatchV2Schema,
  interactionDesignArtifactV1Schema,
  knowledgeDesignArtifactV1BaseSchema,
  knowledgeDesignArtifactV1Schema,
  qualityReviewArtifactV1Schema,
  questionModelArtifactV1Schema,
  revisionImpactArtifactV1Schema,
  storyDesignArtifactV1BaseSchema,
  storyDesignArtifactV1Schema,
  type CuriosityAgentRole,
  type CuriosityAgentRun,
  type CuriosityExperienceSpecV2,
  type CuriosityPatchV2,
  type InteractionDesignArtifactV1,
  type KnowledgeDesignArtifactV1,
  type QualityReviewArtifactV1,
  type QuestionModelArtifactV1,
  type RevisionImpactArtifactV1,
  type StoryDesignArtifactV1,
} from './agent-contracts';
import type { CuriosityRoleRoute } from './agent-routing';
import {
  compileCuriosityExperience,
  compileCuriosityExperienceV2,
  type CompiledCuriosityExperience,
} from './compiler';
import {
  CURIOUSITY_EVENT_TYPES,
  curiosityExperienceSpecSchema,
  curiosityTaskSchema,
  type CuriosityExperienceSpecV1,
} from './contracts';
import type { CuriosityTextModel } from './model';
import { classifyCuriosityRequest } from './knowledge';
import { knowledgeRegistry } from './knowledge/registry';
import { CURIOSITY_QUALITY_CRITERIA, canonicalizeCuriosityQuality } from './quality';
import { renderCuriosityRoleSkill } from './agent-skills';
import { parseCuriosityModelJson } from './model-json';

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
    spec: string;
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

export type CuriosityPipelineArtifact =
  | QuestionModelArtifactV1
  | KnowledgeDesignArtifactV1
  | InteractionDesignArtifactV1
  | StoryDesignArtifactV1
  | RevisionImpactArtifactV1
  | CuriosityPatchV2
  | CuriosityExperienceSpecV2
  | QualityReviewArtifactV1;

export const curiosityPipelineArtifactSchema = z.union([
  questionModelArtifactV1Schema,
  knowledgeDesignArtifactV1Schema,
  interactionDesignArtifactV1Schema,
  storyDesignArtifactV1Schema,
  revisionImpactArtifactV1Schema,
  curiosityPatchV2Schema,
  curiosityExperienceSpecV2Schema,
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
  spec: CuriosityExperienceSpecV2;
  runtimeSpec: CuriosityExperienceSpecV1;
  compiled: CompiledCuriosityExperience;
  qualityRetryCount: 0 | 1;
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
  if (Array.isArray(value)) {
    value.forEach(assertNoExecutableModelContent);
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach(assertNoExecutableModelContent);
  }
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

const sceneOutputSchema = interactionDesignArtifactV1Schema.omit(envelopeKeys).extend({
  sceneType: z.enum(['variable-explorer', 'relation-explorer']),
  tasks: z.array(curiosityTaskSchema).length(4),
});

const presentationOutputSchema = storyDesignArtifactV1BaseSchema
  .omit({
    ...envelopeKeys,
    sourceArtifactIds: true,
    stages: true,
  })
  .extend({
    title: z.string().trim().min(1).max(120),
    hook: z.string().trim().min(1).max(240),
    explorePrompt: z.string().trim().min(1).max(240),
    challengePrompt: z.string().trim().min(1).max(240),
    completion: z.string().trim().min(1).max(240),
    narrationLibrary: storyDesignArtifactV1BaseSchema.shape.narrationLibrary.unwrap().min(2),
    immediateFeedback: storyDesignArtifactV1BaseSchema.shape.immediateFeedback.unwrap().min(1),
    discoveryPrompts: storyDesignArtifactV1BaseSchema.shape.discoveryPrompts.unwrap().max(3),
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

function childCompletion(knowledge: KnowledgeDesignArtifactV1): string {
  return (
    knowledge.allowedExplanations[0] ??
    `你发现了：${knowledge.causalRelations[0]!.cause}时，${knowledge.causalRelations[0]!.effect}。`
  );
}

function validateScene(
  scene: InteractionDesignArtifactV1,
  route: ReturnType<typeof classifyCuriosityRequest>,
): void {
  const variableIds = new Set(scene.variables.map((variable) => variable.id));
  for (const relation of scene.relations) {
    if (!variableIds.has(relation.fromVariableId) || !variableIds.has(relation.toVariableId)) {
      throw new Error(`SCENE_RELATION_VARIABLE_UNKNOWN: ${relation.id}`);
    }
  }
  if (scene.sceneType === 'relation-explorer' && scene.relations.length === 0) {
    throw new Error('RELATION_EXPLORER_RELATION_REQUIRED');
  }
  if (route.kind === 'curated') {
    const plugin = knowledgeRegistry.get(route.family);
    const allowedPrimitives = new Set(plugin.allowedPrimitives);
    for (const variable of scene.variables) {
      const bounds = plugin.allowedVariables[variable.id];
      if (!bounds || variable.min < bounds.min || variable.max > bounds.max) {
        throw new Error(`SCENE_VARIABLE_OUT_OF_BOUNDS: ${variable.id}`);
      }
    }
    if (scene.primitives.some((primitive) => !allowedPrimitives.has(primitive))) {
      throw new Error('SCENE_PRIMITIVE_NOT_CURATED');
    }
  } else if (
    scene.primitives.some(
      (primitive) => primitive !== 'adjust-variable' && primitive !== 'compare-relation',
    )
  ) {
    throw new Error('OPEN_SCENE_PRIMITIVE_NOT_CONTROLLED');
  }
}

function buildRuntimeSpec(input: {
  pipelineInput: CuriosityAgentPipelineInput;
  question: QuestionModelArtifactV1;
  knowledge: KnowledgeDesignArtifactV1;
  scene: InteractionDesignArtifactV1;
  presentation: StoryDesignArtifactV1;
  identities: CuriosityPipelineIdentities;
}): CuriosityExperienceSpecV1 {
  if (!input.scene.tasks) throw new Error('SCENE_TASKS_REQUIRED');
  const primaryVariable = input.scene.variables[0];
  if (!primaryVariable) throw new Error('SCENE_VARIABLES_REQUIRED');
  const preset =
    input.knowledge.knowledgeFamily === 'relative-motion'
      ? 'moon-parallax-v1'
      : input.knowledge.knowledgeFamily === 'balance-support'
        ? 'balance-support-v1'
        : input.knowledge.knowledgeFamily === 'light-path'
          ? 'light-path-v1'
          : input.scene.sceneType === 'relation-explorer'
            ? 'relation-explorer-v1'
            : 'variable-explorer-v1';
  return curiosityExperienceSpecSchema.parse({
    schemaVersion: '1.0',
    experienceId: input.identities.experienceId,
    versionId: input.identities.versionId,
    revision: input.identities.revision ?? 1,
    createdAt: input.identities.createdAt,
    profile: { age: input.pipelineInput.targetAge },
    question: {
      original: input.pipelineInput.question,
      coreQuestion: input.question.coreQuestion,
    },
    knowledge: {
      family: input.knowledge.knowledgeFamily,
      packId: input.knowledge.packId,
    },
    presentation: {
      title: input.presentation.title,
      hook: input.presentation.hook,
      explorePrompt: input.presentation.explorePrompt,
      challengePrompt: input.presentation.challengePrompt,
      completion: input.presentation.completion ?? childCompletion(input.knowledge),
    },
    simulation: {
      preset,
      observerTravel: Math.min(100, Math.max(40, Math.abs(primaryVariable.max))),
      nearObjectDistance: 20,
      farObjectDistance: 400,
    },
    tasks: input.scene.tasks,
    eventRequirements: [...CURIOUSITY_EVENT_TYPES],
  });
}

function buildExperienceSpec(input: {
  pipelineInput: CuriosityAgentPipelineInput;
  question: QuestionModelArtifactV1;
  knowledge: KnowledgeDesignArtifactV1;
  scene: InteractionDesignArtifactV1;
  identities: CuriosityPipelineIdentities;
  attempt: number;
}): CuriosityExperienceSpecV2 {
  return curiosityExperienceSpecV2Schema.parse({
    artifactId: suffix(input.identities.artifactIds.spec, input.attempt),
    runId: input.identities.runId,
    agentRole: 'curiosity.interaction-designer',
    schemaVersion: '2.0',
    createdAt: input.identities.createdAt,
    upstreamArtifactIds: [
      input.question.artifactId,
      input.knowledge.artifactId,
      input.scene.artifactId,
    ],
    knowledgePackVersion: input.knowledge.knowledgePackVersion,
    experienceId: input.identities.experienceId,
    versionId: input.identities.versionId,
    revision: input.identities.revision ?? 1,
    profile: { age: input.pipelineInput.targetAge },
    sourceArtifactIds: {
      questionModel: input.question.artifactId,
      knowledgeDesign: input.knowledge.artifactId,
      interactionDesign: input.scene.artifactId,
    },
    knowledge: {
      family: input.knowledge.knowledgeFamily,
      packId: input.knowledge.packId,
      packVersion: input.knowledge.knowledgePackVersion,
    },
    title: input.question.equivalentQuestions[0] ?? input.question.coreQuestion,
    visualTheme: input.scene.visualTheme,
    sceneType: input.scene.sceneType,
    observationSuggestions: input.knowledge.observationSuggestions,
    instructions: input.scene.instructionCopy,
    variables: input.scene.variables.map(({ id, min, max, initial }) => ({
      id,
      min,
      max,
      initial,
    })),
    primitives: input.scene.primitives,
    eventRequirements: [...CURIOSITY_EVENT_TYPES_V2],
  });
}

export async function runCuriosityAgentPipeline(
  input: CuriosityAgentPipelineInput,
  models: CuriosityPipelineModels,
  identities: CuriosityPipelineIdentities,
  onStage?: (update: CuriosityPipelineStageUpdate) => void | Promise<void>,
): Promise<CuriosityAgentPipelineResult> {
  const route = classifyCuriosityRequest(input);
  const artifacts: CuriosityPipelineArtifact[] = [];
  const agentRuns: CuriosityAgentRun[] = [];
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
          const raw = await selectedModel.complete({
            system: `你是 ${parameters.role}。\n${renderCuriosityRoleSkill(parameters.role)}\n只返回严格 JSON，不得输出隐藏思维链。不得输出 HTML、CSS、JavaScript、函数或表达式。输出必须严格符合以下 JSON Schema：${JSON.stringify(z.toJSONSchema(parameters.schema))}`,
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
  const question = (await execute({
    role: 'curiosity.question-modeler',
    stage: 'question',
    failureCode: 'QUESTION_MODEL_INVALID',
    agentRunId: identities.agentRunIds.question,
    artifactId: identities.artifactIds.question,
    upstreamArtifactIds: [],
    prompt: JSON.stringify({ input, route }),
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
  })) as QuestionModelArtifactV1;

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
  const knowledge = (await execute({
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
      requiredOpenFields:
        route.kind === 'open'
          ? [
              'claims',
              'relations',
              'allowedVocabulary',
              'allowedExplanations',
              'forbiddenExplanations',
              'misconceptions',
              'uncertainties',
              'timeSensitive',
            ]
          : undefined,
      perspectiveDirective: input.perspectiveDirective,
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
      if (route.kind === 'curated') knowledgeRegistry.get(route.family).validateKnowledge(artifact);
      return artifact;
    },
  })) as KnowledgeDesignArtifactV1;

  let rejectionFeedback: string[] = [];
  for (let attempt = 0; attempt <= 1; attempt += 1) {
    const sceneArtifactId = suffix(identities.artifactIds.scene, attempt);
    const presentationArtifactId = suffix(identities.artifactIds.presentation, attempt);
    const qualityArtifactId = suffix(identities.artifactIds.quality, attempt);
    const scene = (await execute({
      role: 'curiosity.interaction-designer',
      stage: 'scene',
      failureCode: 'SCENE_DESIGN_INVALID',
      agentRunId: suffix(identities.agentRunIds.scene, attempt),
      artifactId: sceneArtifactId,
      upstreamArtifactIds: [question.artifactId, knowledge.artifactId],
      prompt: JSON.stringify({
        question,
        knowledge,
        allowedSceneTypes: ['variable-explorer', 'relation-explorer'],
        allowedOpenPrimitives: ['adjust-variable', 'compare-relation'],
        modelCodePolicy: 'declarative-data-only',
        rejectionFeedback,
        perspectiveDirective: input.perspectiveDirective,
      }),
      schema: sceneOutputSchema,
      build: (output) => {
        const artifact = interactionDesignArtifactV1Schema.parse({
          ...output,
          artifactId: sceneArtifactId,
          runId: identities.runId,
          agentRole: 'curiosity.interaction-designer',
          schemaVersion: '1.0',
          createdAt: identities.createdAt,
          upstreamArtifactIds: [question.artifactId, knowledge.artifactId],
          knowledgePackVersion: knowledge.knowledgePackVersion,
        });
        validateScene(artifact, route);
        return artifact;
      },
    })) as InteractionDesignArtifactV1;

    const presentation = (await execute({
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
        narrationPolicy: 'generate-complete-reviewed-library-now;runtime-generation-forbidden',
        discoveryPromptLimit: 3,
        everyDiscoveryPromptSkippable: true,
        rejectionFeedback,
        perspectiveDirective: input.perspectiveDirective,
      }),
      schema: presentationOutputSchema,
      build: (output) =>
        storyDesignArtifactV1Schema.parse({
          ...output,
          artifactId: presentationArtifactId,
          runId: identities.runId,
          agentRole: 'curiosity.presentation-designer',
          schemaVersion: '1.0',
          createdAt: identities.createdAt,
          upstreamArtifactIds: [question.artifactId, knowledge.artifactId, scene.artifactId],
          knowledgePackVersion: knowledge.knowledgePackVersion,
          sourceArtifactIds: {
            questionModel: question.artifactId,
            knowledgeDesign: knowledge.artifactId,
            interactionDesign: scene.artifactId,
          },
          stages: [],
        }),
    })) as StoryDesignArtifactV1;

    let spec: CuriosityExperienceSpecV2;
    let runtimeSpec: CuriosityExperienceSpecV1;
    let compiled: CompiledCuriosityExperience;
    try {
      spec = buildExperienceSpec({
        pipelineInput: input,
        question,
        knowledge,
        scene,
        identities,
        attempt,
      });
      compileCuriosityExperienceV2(spec);
      runtimeSpec = buildRuntimeSpec({
        pipelineInput: input,
        question,
        knowledge,
        scene,
        presentation,
        identities,
      });
      compiled = compileCuriosityExperience(runtimeSpec);
      artifacts.push(spec);
    } catch (error) {
      throw new CuriosityAgentPipelineError(
        'DETERMINISTIC_VALIDATION_FAILED',
        'curiosity.interaction-designer',
        '确定性 Schema、知识或编译检查失败。',
        artifacts,
        agentRuns,
        error,
      );
    }

    const quality = (await execute({
      role: 'curiosity.quality-reviewer',
      stage: 'quality',
      failureCode: 'QUALITY_REVIEW_INVALID',
      agentRunId: suffix(identities.agentRunIds.quality, attempt),
      artifactId: qualityArtifactId,
      upstreamArtifactIds: [
        knowledge.artifactId,
        scene.artifactId,
        presentation.artifactId,
        spec.artifactId,
      ],
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
          upstreamArtifactIds: [
            knowledge.artifactId,
            scene.artifactId,
            presentation.artifactId,
            spec.artifactId,
          ],
          knowledgePackVersion: knowledge.knowledgePackVersion,
        }),
    })) as QualityReviewArtifactV1;

    if (quality.verdict === 'pass') {
      return {
        artifacts,
        agentRuns,
        spec,
        runtimeSpec,
        compiled,
        qualityRetryCount: attempt as 0 | 1,
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
