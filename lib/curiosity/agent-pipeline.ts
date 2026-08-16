import { z } from 'zod';

import {
  CURIOSITY_EVENT_TYPES_V2,
  CURIOSITY_KNOWLEDGE_FAMILIES,
  curiosityAgentRunSchema,
  curiosityExperienceSpecV2Schema,
  curiosityPatchV2Schema,
  interactionDesignArtifactV1Schema,
  knowledgeDesignArtifactV1Schema,
  qualityReviewArtifactV1Schema,
  questionModelArtifactV1Schema,
  teamAssemblyArtifactV1Schema,
  teamAssemblyOutputSchema,
  revisionImpactArtifactV1Schema,
  storyDesignArtifactV1Schema,
  storyStageSchema,
  type CuriosityPatchV2,
  type CuriosityAgentRole,
  type CuriosityAgentRun,
  type CuriosityExperienceSpecV2,
  type InteractionDesignArtifactV1,
  type KnowledgeDesignArtifactV1,
  type QualityReviewArtifactV1,
  type QuestionModelArtifactV1,
  type TeamAssemblyArtifactV1,
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
  type CuriosityExperienceSpecV1,
} from './contracts';
import type { CuriosityTextModel } from './generation';
import { isPrimaryInstructionAllowed } from './age-constraints';
import { classifyCuriosityRequest } from './knowledge';
import { knowledgeRegistry } from './knowledge/registry';
import { canonicalizeCuriosityQuality, CURIOSITY_QUALITY_CRITERIA } from './quality';
import { renderCuriosityRoleSkill } from './agent-skills';

type GenerationRole = Exclude<
  CuriosityAgentRole,
  'curiosity.revision-planner' | 'curiosity.exploration-guide'
>;

export interface CuriosityPipelineModel extends CuriosityTextModel {
  route: CuriosityRoleRoute;
}

export type CuriosityPipelineModels = Record<GenerationRole, CuriosityPipelineModel>;

export interface CuriosityAgentPipelineInput {
  question: string;
  age: number;
  interests: string[];
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
    team: string;
    knowledge: string;
    interaction: string;
    story: string;
    spec: string;
    quality: string;
  };
  agentRunIds: {
    question: string;
    team: string;
    knowledge: string;
    interaction: string;
    story: string;
    quality: string;
  };
}

export type CuriosityPipelineArtifact =
  | QuestionModelArtifactV1
  | TeamAssemblyArtifactV1
  | KnowledgeDesignArtifactV1
  | InteractionDesignArtifactV1
  | StoryDesignArtifactV1
  | RevisionImpactArtifactV1
  | CuriosityPatchV2
  | CuriosityExperienceSpecV2
  | QualityReviewArtifactV1;

export const curiosityPipelineArtifactSchema = z.union([
  questionModelArtifactV1Schema,
  teamAssemblyArtifactV1Schema,
  knowledgeDesignArtifactV1Schema,
  interactionDesignArtifactV1Schema,
  storyDesignArtifactV1Schema,
  revisionImpactArtifactV1Schema,
  curiosityPatchV2Schema,
  curiosityExperienceSpecV2Schema,
  qualityReviewArtifactV1Schema,
]);

export type CuriosityPipelineStage =
  | 'question_modeling'
  | 'knowledge_design'
  | 'interaction_design'
  | 'team_assembly'
  | 'story_design'
  | 'deterministic_compile'
  | 'quality_review';

export interface CuriosityPipelineStageUpdate {
  stage: CuriosityPipelineStage;
  artifacts: CuriosityPipelineArtifact[];
  agentRuns: CuriosityAgentRun[];
}

export interface CuriosityAgentPipelineResult {
  artifacts: CuriosityPipelineArtifact[];
  agentRuns: CuriosityAgentRun[];
  spec: CuriosityExperienceSpecV2;
  runtimeSpec: CuriosityExperienceSpecV1;
  compiled: CompiledCuriosityExperience;
}

export type CuriosityPipelineFailureCode =
  | 'QUESTION_MODEL_INVALID'
  | 'TEAM_ASSEMBLY_INVALID'
  | 'KNOWLEDGE_DESIGN_INVALID'
  | 'INTERACTION_DESIGN_INVALID'
  | 'STORY_DESIGN_INVALID'
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

const questionOutputSchema = questionModelArtifactV1Schema.omit(envelopeKeys);
const teamOutputSchema = teamAssemblyOutputSchema;
const questionOutputSchemaForMapping = (
  family: (typeof CURIOSITY_KNOWLEDGE_FAMILIES)[number],
  age: number,
) =>
  questionOutputSchema.extend({
    ageBand: z.literal(age <= 7 ? '6-7' : '8-10'),
    supportStatus: z.literal('supported'),
    knowledgeFamilyCandidates: z.array(z.literal(family)).length(1),
  });
const CHILD_COMPLETION_MAX_LENGTH = 180;
const formatChildCompletion = (cause: string, effect: string) =>
  `你发现了：${cause}时，${effect}。`;
const knowledgeOutputSchema = knowledgeDesignArtifactV1Schema
  .omit(envelopeKeys)
  .superRefine((output, context) => {
    const primaryRelation = output.causalRelations[0];
    if (
      primaryRelation &&
      formatChildCompletion(primaryRelation.cause, primaryRelation.effect).length >
        CHILD_COMPLETION_MAX_LENGTH
    ) {
      context.addIssue({
        code: 'custom',
        path: ['causalRelations', 0],
        message: 'primary causal relation exceeds the child completion limit',
      });
    }
  });
const regenerationKnowledgeOutputSchema = knowledgeDesignArtifactV1Schema.omit({
  ...envelopeKeys,
  causalRelations: true,
});
const interactionOutputSchema = interactionDesignArtifactV1Schema.omit(envelopeKeys);
const REQUIRED_RUNTIME_TASK_KINDS = [
  'prediction',
  'exploration',
  'transfer',
  'explanation',
] as const;
const SCIENTIFIC_ABSOLUTE_LANGUAGE = /纹丝不动|绝对(?:不会|不可能)|永远(?:不会|不倒|不变)|一定(?:不会|不倒|不变)/;
const interactionOutputSchemaForAge = (
  age: number,
  allowedVariables?: Readonly<Record<string, { min: number; max: number }>>,
) =>
  interactionOutputSchema.superRefine((output, context) => {
    const maxPrimaryTasks = age <= 7 ? 4 : 5;
    if (output.taskSequence.length > maxPrimaryTasks) {
      context.addIssue({
        code: 'custom',
        path: ['taskSequence'],
        message: `primary task count exceeds the age ${age} limit`,
      });
    }
    if (output.instructionCopy.length > maxPrimaryTasks) {
      context.addIssue({
        code: 'custom',
        path: ['instructionCopy'],
        message: `instruction count exceeds the age ${age} limit`,
      });
    }
    output.instructionCopy.forEach((instruction, index) => {
      if (!isPrimaryInstructionAllowed(age, instruction.text)) {
        context.addIssue({
          code: 'custom',
          path: ['instructionCopy', index, 'text'],
          message: `primary instruction exceeds the age ${age} limit`,
        });
      }
    });
    output.feedback.forEach((feedback, index) => {
      if (SCIENTIFIC_ABSOLUTE_LANGUAGE.test(feedback.message)) {
        context.addIssue({
          code: 'custom',
          path: ['feedback', index, 'message'],
          message: 'feedback must describe the observed result without absolute scientific claims',
        });
      }
    });
    for (const kind of REQUIRED_RUNTIME_TASK_KINDS) {
      if (!output.taskSequence.includes(kind)) {
        context.addIssue({
          code: 'custom',
          path: ['taskSequence'],
          message: `missing deterministic runtime task: ${kind}`,
        });
      }
      if (!output.instructionCopy.some((instruction) => instruction.kind === kind)) {
        context.addIssue({
          code: 'custom',
          path: ['instructionCopy'],
          message: `missing deterministic runtime instruction: ${kind}`,
        });
      }
    }
    if (allowedVariables) {
      output.variables.forEach((variable, index) => {
        const bounds = allowedVariables[variable.id];
        if (!bounds || variable.min < bounds.min || variable.max > bounds.max) {
          context.addIssue({
            code: 'custom',
            path: ['variables', index],
            message: `variable ${variable.id} is outside the selected knowledge bounds`,
          });
        }
      });
    }
  });
const CHILD_UNSUITABLE_LANGUAGE =
  /溜须拍马|拍马屁|小菜一碟|笨蛋|傻瓜|连这都|这么简单.{0,8}(?:肯定|应该|还不)/;
const storyOutputSchemaForTasks = (
  taskSequence: InteractionDesignArtifactV1['taskSequence'],
  age: number,
) => {
  const narrationLimit = age <= 7 ? 40 : 56;
  const childHintSchema = z.strictObject({
    level: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    text: z.string().trim().min(1).max(36),
    revealsAnswer: z.literal(false),
  });
  const childStoryStageSchema = storyStageSchema.extend({
    openingNarration: z.string().trim().min(1).max(narrationLimit),
    prompt: z.string().trim().min(1).max(42),
    hints: z
      .array(childHintSchema)
      .length(3)
      .refine(
        (hints) => hints.every((hint, index) => hint.level === index),
        'hint levels must be ordered from 0 through 2',
      ),
    completionCondition: z.string().trim().min(1).max(42),
  });
  return z
    .strictObject({ stages: z.array(childStoryStageSchema).min(3).max(5) })
    .superRefine((output, context) => {
      const actual = output.stages.map((stage) => stage.kind);
      if (
        actual.length !== taskSequence.length ||
        actual.some((kind, index) => kind !== taskSequence[index])
      ) {
        context.addIssue({
          code: 'custom',
          path: ['stages'],
          message: 'story stages must match the interaction task sequence',
        });
      }
      output.stages.forEach((stage, stageIndex) => {
        const childCopy = [
          stage.openingNarration,
          stage.prompt,
          stage.completionCondition,
          ...stage.hints.map((hint) => hint.text),
        ].join('\n');
        if (CHILD_UNSUITABLE_LANGUAGE.test(childCopy)) {
          context.addIssue({
            code: 'custom',
            path: ['stages', stageIndex],
            message: 'child narration contains adult idiom or belittling language',
          });
        }
      });
    });
};
const qualityOutputSchema = z.strictObject({
  checks: z
    .array(
      z.strictObject({
        criterion: z.enum(CURIOSITY_QUALITY_CRITERIA),
        status: z.enum(['pass', 'reject']),
        findings: z.array(z.string().trim().min(1).max(240)).max(8),
      }),
    )
    .min(7)
    .max(10),
  verdict: z.enum(['pass', 'reject']),
});

function qualityOutputSchemaForCandidate(age: number, instructions: Array<{ text: string }>) {
  const instructionsMeetCopyLimit = instructions.every((instruction) =>
    isPrimaryInstructionAllowed(age, instruction.text),
  );
  return qualityOutputSchema.superRefine((output, context) => {
    const copyLoadCheck = output.checks.find((check) => check.criterion === 'copy-load');
    if (instructionsMeetCopyLimit && copyLoadCheck?.status === 'reject') {
      context.addIssue({
        code: 'custom',
        path: ['checks'],
        message: 'copy-load rejection conflicts with deterministic instruction-length validation',
      });
    }
  });
}

const MAX_MODEL_OUTPUT_ATTEMPTS = 3;

function parseModelOutput<T>(raw: string, schema: z.ZodType<T>): T {
  return schema.parse(JSON.parse(raw));
}

function isRetryableModelOutputError(error: unknown, depth = 0): boolean {
  if (error instanceof z.ZodError || error instanceof SyntaxError) return true;
  if (!(error instanceof Error) || depth >= 4) return false;
  if (error.name === 'AI_NoObjectGeneratedError' || error.name === 'AI_TypeValidationError') {
    return true;
  }
  return isRetryableModelOutputError(error.cause, depth + 1);
}

function modelValidationSummary(error: unknown, depth = 0): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join('.') || '$'}:${issue.code}`)
      .join(',');
  }
  if (error instanceof SyntaxError) return '$:invalid_json';
  if (error instanceof Error && /^[A-Za-z0-9_]+$/.test(error.name)) {
    const nested = depth < 4 ? modelValidationSummary(error.cause, depth + 1) : '';
    return nested && nested !== '$:invalid_output'
      ? `${depth === 0 ? '$:' : ''}${error.name}>${nested.replace(/^\$:/, '')}`
      : `$:${error.name}`;
  }
  return '$:invalid_output';
}

function modelCorrectionDetails(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join('.') || '$'}: ${issue.message}`)
      .join('；');
  }
  return modelValidationSummary(error);
}

function modelRoute(model: CuriosityPipelineModel) {
  return {
    providerId: model.route.providerId,
    modelId: model.route.modelId,
    ...(model.route.thinkingConfig ? { thinking: model.route.thinkingConfig } : {}),
  };
}

function succeededRun(input: {
  agentRunId: string;
  runId: string;
  role: GenerationRole;
  model: CuriosityPipelineModel;
  startedAt: string;
  endedAt: string;
  inputArtifactIds: string[];
  outputArtifactId: string;
  experienceId: string;
  versionId: string;
}): CuriosityAgentRun {
  return curiosityAgentRunSchema.parse({
    agentRunId: input.agentRunId,
    runId: input.runId,
    experienceId: input.experienceId,
    candidateVersionId: input.versionId,
    agentRole: input.role,
    route: modelRoute(input.model),
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    status: 'succeeded',
    inputArtifactIds: input.inputArtifactIds,
    outputArtifactIds: [input.outputArtifactId],
  });
}

function failedRun(input: {
  agentRunId: string;
  runId: string;
  role: GenerationRole;
  model: CuriosityPipelineModel;
  startedAt: string;
  endedAt: string;
  inputArtifactIds: string[];
  failureCode: CuriosityPipelineFailureCode;
  experienceId: string;
  versionId: string;
}): CuriosityAgentRun {
  return curiosityAgentRunSchema.parse({
    agentRunId: input.agentRunId,
    runId: input.runId,
    experienceId: input.experienceId,
    candidateVersionId: input.versionId,
    agentRole: input.role,
    route: modelRoute(input.model),
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    status: 'failed',
    failureCode: input.failureCode,
    inputArtifactIds: input.inputArtifactIds,
    outputArtifactIds: [],
  });
}

function instruction(
  interaction: InteractionDesignArtifactV1,
  kind: InteractionDesignArtifactV1['instructionCopy'][number]['kind'],
): string {
  const selected = interaction.instructionCopy.find((item) => item.kind === kind);
  if (!selected) throw new Error(`Missing instruction: ${kind}`);
  return selected.text;
}

function buildRuntimeSpec(
  input: CuriosityAgentPipelineInput,
  question: QuestionModelArtifactV1,
  knowledge: KnowledgeDesignArtifactV1,
  interaction: InteractionDesignArtifactV1,
  identities: CuriosityPipelineIdentities,
): CuriosityExperienceSpecV1 {
  const primaryVariable = interaction.variables[0];
  if (!primaryVariable) throw new Error('Interaction variables are incomplete');
  const runtimeByFamily = {
    'relative-motion': {
      preset: 'moon-parallax-v1',
      prediction: [
        { id: 'near-lamp', label: '近处路灯' },
        { id: 'far-mountain', label: '远处山峰' },
        { id: 'moon', label: '月亮' },
      ],
      predicted: 'near-lamp',
      challenge: [
        { id: 'nearer', label: '放得更近' },
        { id: 'farther', label: '放得更远' },
      ],
      challenged: 'farther',
      explanations: [
        { id: 'small-angle-change', label: '距离越远，观察方向变化越小' },
        { id: 'object-follows', label: '远处物体真的在追着我们移动' },
      ],
      explained: 'small-angle-change',
    },
    'balance-support': {
      preset: 'balance-support-v1',
      prediction: [
        { id: 'edge-support', label: '支点放在边缘' },
        { id: 'center-support', label: '支点放在重心下方' },
      ],
      predicted: 'center-support',
      challenge: [
        { id: 'narrow-base', label: '缩窄底座' },
        { id: 'wide-base', label: '加宽底座' },
      ],
      challenged: 'wide-base',
      explanations: [
        { id: 'projection-supported', label: '重心投影落在支撑范围内会更稳' },
        { id: 'heavier-always-stable', label: '只要更重就一定不会倒' },
      ],
      explained: 'projection-supported',
    },
    'light-path': {
      preset: 'light-path-v1',
      prediction: [
        { id: 'light-near', label: '光源靠近遮挡物' },
        { id: 'light-far', label: '光源远离遮挡物' },
      ],
      predicted: 'light-near',
      challenge: [
        { id: 'move-light', label: '移动光源' },
        { id: 'ignore-light', label: '遮住眼睛不观察' },
      ],
      challenged: 'move-light',
      explanations: [
        { id: 'straight-path', label: '光沿直线路径传播，遮挡位置会改变影子' },
        { id: 'shadow-object', label: '影子是另一个黑色物体' },
      ],
      explained: 'straight-path',
    },
  } as const;
  const runtime = runtimeByFamily[knowledge.knowledgeFamily];
  return curiosityExperienceSpecSchema.parse({
    schemaVersion: '1.0',
    experienceId: identities.experienceId,
    versionId: identities.versionId,
    revision: identities.revision ?? 1,
    createdAt: identities.createdAt,
    profile: { age: input.age, interests: input.interests },
    question: { original: input.question, coreQuestion: question.coreQuestion },
    knowledge: { family: knowledge.knowledgeFamily, packId: knowledge.packId },
    presentation: {
      title: question.equivalentQuestions[0] ?? question.coreQuestion,
      hook: interaction.scenario,
      explorePrompt: instruction(interaction, 'exploration'),
      challengePrompt: instruction(interaction, 'transfer'),
      completion: formatChildCompletion(
        knowledge.causalRelations[0]?.cause ?? '',
        knowledge.causalRelations[0]?.effect ?? '',
      ),
    },
    simulation: {
      preset: runtime.preset,
      observerTravel: Math.min(
        100,
        Math.max(40, Math.abs(primaryVariable.min), Math.abs(primaryVariable.max)),
      ),
      nearObjectDistance: 20,
      farObjectDistance: 400,
    },
    tasks: [
      {
        id: 'prediction',
        kind: 'prediction',
        prompt: instruction(interaction, 'prediction'),
        options: [...runtime.prediction],
        expectedOptionId: runtime.predicted,
      },
      {
        id: 'exploration',
        kind: 'exploration',
        prompt: instruction(interaction, 'exploration'),
        variable: primaryVariable.id,
      },
      {
        id: 'challenge',
        kind: 'challenge',
        prompt: instruction(interaction, 'transfer'),
        options: [...runtime.challenge],
        expectedOptionId: runtime.challenged,
      },
      {
        id: 'explanation',
        kind: 'explanation',
        prompt: instruction(interaction, 'explanation'),
        options: [...runtime.explanations],
        expectedOptionId: runtime.explained,
      },
    ],
    eventRequirements: [...CURIOUSITY_EVENT_TYPES],
  });
}

export async function runCuriosityAgentPipeline(
  input: CuriosityAgentPipelineInput,
  models: CuriosityPipelineModels,
  identities: CuriosityPipelineIdentities,
  onStage?: (update: CuriosityPipelineStageUpdate) => void | Promise<void>,
): Promise<CuriosityAgentPipelineResult> {
  const mapping = classifyCuriosityRequest(input);
  const knowledgePlugin = knowledgeRegistry.get(mapping.family);
  const selectedPack = knowledgePlugin.packs.find((pack) => pack.id === mapping.packId);
  if (!selectedPack) {
    throw new CuriosityAgentPipelineError(
      'KNOWLEDGE_DESIGN_INVALID',
      'curiosity.knowledge-designer',
      '确定性分类结果没有对应知识包。',
      [],
      [],
    );
  }
  const artifacts: CuriosityPipelineArtifact[] = [];
  const agentRuns: CuriosityAgentRun[] = [];
  const notify = async (stage: CuriosityPipelineStage) =>
    onStage?.({
      stage,
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
      const outputSchema = JSON.stringify(z.toJSONSchema(parameters.schema));
      let output: T | undefined;
      let lastError: unknown;
      for (let attempt = 1; attempt <= MAX_MODEL_OUTPUT_ATTEMPTS; attempt += 1) {
        try {
          const raw = await selectedModel.complete({
            system: `你是 ${parameters.role}。\n${renderCuriosityRoleSkill(parameters.role)}\n只返回严格 JSON，不得输出隐藏思维链。输出必须严格符合以下 JSON Schema：${outputSchema}`,
            prompt:
              attempt === 1
                ? parameters.prompt
                : `${parameters.prompt}\n上一轮输出未通过 Schema 校验。修正项：${modelCorrectionDetails(lastError)}。请逐项自检后重新生成完整 JSON；不要省略字段、扩大允许范围或改写单位。`,
            schema: parameters.schema,
          });
          output = parseModelOutput(raw, parameters.schema);
          break;
        } catch (error) {
          lastError = error;
          if (!isRetryableModelOutputError(error) || attempt === MAX_MODEL_OUTPUT_ATTEMPTS) {
            throw error;
          }
        }
      }
      if (output === undefined) throw lastError;
      const artifact = parameters.build(output);
      artifacts.push(artifact);
      agentRuns.push(
        succeededRun({
          agentRunId: parameters.agentRunId,
          runId: identities.runId,
          role: parameters.role,
          model: selectedModel,
          startedAt,
          endedAt: new Date().toISOString(),
          inputArtifactIds: parameters.upstreamArtifactIds,
          outputArtifactId: parameters.artifactId,
          experienceId: identities.experienceId,
          versionId: identities.versionId,
        }),
      );
      await notify(parameters.stage);
      return artifact;
    } catch (error) {
      agentRuns.push(
        failedRun({
          agentRunId: parameters.agentRunId,
          runId: identities.runId,
          role: parameters.role,
          model: selectedModel,
          startedAt,
          endedAt: new Date().toISOString(),
          inputArtifactIds: parameters.upstreamArtifactIds,
          failureCode: parameters.failureCode,
          experienceId: identities.experienceId,
          versionId: identities.versionId,
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

  const question = (await execute({
    role: 'curiosity.question-modeler',
    stage: 'question_modeling',
    failureCode: 'QUESTION_MODEL_INVALID',
    agentRunId: identities.agentRunIds.question,
    artifactId: identities.artifactIds.question,
    upstreamArtifactIds: [],
    prompt: JSON.stringify({
      input,
      allowedKnowledgeFamilies: [mapping.family],
      perspectiveDirective: input.perspectiveDirective,
    }),
    schema: questionOutputSchemaForMapping(mapping.family, input.age),
    build: (output) =>
      questionModelArtifactV1Schema.parse({
        ...output,
        artifactId: identities.artifactIds.question,
        runId: identities.runId,
        agentRole: 'curiosity.question-modeler',
        schemaVersion: '1.0',
        createdAt: identities.createdAt,
        upstreamArtifactIds: [],
        knowledgePackVersion: 'unselected',
      }),
  })) as QuestionModelArtifactV1;

  if (
    question.supportStatus !== 'supported' ||
    question.ageBand !== (input.age <= 7 ? '6-7' : '8-10') ||
    question.knowledgeFamilyCandidates.length !== 1 ||
    question.knowledgeFamilyCandidates[0] !== mapping.family
  ) {
    throw new CuriosityAgentPipelineError(
      'QUESTION_MODEL_INVALID',
      'curiosity.question-modeler',
      '问题建模未返回唯一受支持知识模型族。',
      structuredClone(artifacts),
      structuredClone(agentRuns),
    );
  }

  const knowledge = (await execute({
    role: 'curiosity.knowledge-designer',
    stage: 'knowledge_design',
    failureCode: 'KNOWLEDGE_DESIGN_INVALID',
    agentRunId: identities.agentRunIds.knowledge,
    artifactId: identities.artifactIds.knowledge,
    upstreamArtifactIds: [question.artifactId],
    prompt: JSON.stringify({
      questionArtifact: question,
      knowledgePack: {
        id: selectedPack.id,
        family: selectedPack.family,
        version: selectedPack.version,
      },
      requiredPackId: selectedPack.id,
      packIdPolicy: 'copy-required-pack-id-exactly',
      perspectiveDirective: input.perspectiveDirective,
      preservedCausalRelations: input.preservedCausalRelations,
      causalRelationsPolicy: input.preservedCausalRelations
        ? 'immutable-server-injected-do-not-output-causalRelations'
        : 'generate-within-approved-knowledge-pack',
    }),
    schema: input.preservedCausalRelations
      ? regenerationKnowledgeOutputSchema
      : knowledgeOutputSchema,
    build: (output) =>
      knowledgeDesignArtifactV1Schema.parse({
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
        knowledgePackVersion: selectedPack.version,
      }),
  })) as KnowledgeDesignArtifactV1;

  if (knowledge.knowledgeFamily !== mapping.family || knowledge.packId !== mapping.packId) {
    throw new CuriosityAgentPipelineError(
      'KNOWLEDGE_DESIGN_INVALID',
      'curiosity.knowledge-designer',
      '知识设计与确定性知识包映射不一致。',
      structuredClone(artifacts),
      structuredClone(agentRuns),
    );
  }
  knowledgePlugin.validateKnowledge(knowledge);

  const interaction = (await execute({
    role: 'curiosity.interaction-designer',
    stage: 'interaction_design',
    failureCode: 'INTERACTION_DESIGN_INVALID',
    agentRunId: identities.agentRunIds.interaction,
    artifactId: identities.artifactIds.interaction,
    upstreamArtifactIds: [question.artifactId, knowledge.artifactId],
    prompt: JSON.stringify({
      questionArtifact: question,
      knowledgeArtifact: knowledge,
      allowedVariables: knowledgePlugin.allowedVariables,
      allowedPrimitives: knowledgePlugin.allowedPrimitives,
      transferRule: 'only-use-declared-variables-and-primitives',
      forbiddenInteractionCopy:
        '不得要求孩子执行未由 allowedVariables 与 allowedPrimitives 支持的换物体、换场景或新增机制操作。',
      scientificCopyPolicy: {
        forbiddenExplanations: knowledge.forbiddenExplanations,
        misconceptions: knowledge.misconceptions,
        absoluteLanguage:
          '反馈只能描述这一次观察到的结果；禁止纹丝不动、绝对不会、永远不倒、一定不变等绝对化科学表述。',
      },
      primaryInstructionLimit: input.age <= 7 ? 16 : 28,
      instructionCopyRule: `instructionCopy 中每条 text 去掉标点和空格后不得超过 ${input.age <= 7 ? 16 : 28} 个汉字；必须逐条自行计数并缩短`,
      requiredTaskKinds: [...REQUIRED_RUNTIME_TASK_KINDS],
      maxPrimaryTasks: input.age <= 7 ? 4 : 5,
      variableBoundsPolicy:
        '每个变量必须使用 allowedVariables 中同名变量的 min 和 max，不得缩小、扩大或改单位。',
      perspectiveDirective: input.perspectiveDirective,
    }),
    schema: interactionOutputSchemaForAge(input.age, knowledgePlugin.allowedVariables),
    build: (output) =>
      interactionDesignArtifactV1Schema.parse({
        ...output,
        artifactId: identities.artifactIds.interaction,
        runId: identities.runId,
        agentRole: 'curiosity.interaction-designer',
        schemaVersion: '1.0',
        createdAt: identities.createdAt,
        upstreamArtifactIds: [question.artifactId, knowledge.artifactId],
        knowledgePackVersion: selectedPack.version,
      }),
  })) as InteractionDesignArtifactV1;

  const team = (await execute({
    role: 'curiosity.team-assembler',
    stage: 'team_assembly',
    failureCode: 'TEAM_ASSEMBLY_INVALID',
    agentRunId: identities.agentRunIds.team,
    artifactId: identities.artifactIds.team,
    upstreamArtifactIds: [question.artifactId, knowledge.artifactId, interaction.artifactId],
    prompt: JSON.stringify({
      task: '根据本次问题、知识边界和场景计划组建专属探索团队，不得复用固定角色名单。',
      questionArtifact: question,
      knowledgeArtifact: knowledge,
      sceneOutline: {
        scenario: interaction.scenario,
        variables: interaction.variables,
        taskSequence: interaction.taskSequence,
      },
      constraints: {
        memberCount: '3-5',
        exactlyOneLead: true,
        roles: ['lead', 'science', 'interaction', 'story', 'review'],
        childFacingLanguage: '简体中文，角色姓名和 persona 必须与本题有关且适合儿童。',
        distinctColors: true,
        personaUsage: '后续故事与引导会读取 persona，必须描述具体职责、性格和表达方式。',
      },
    }),
    schema: teamOutputSchema,
    build: (output) =>
      teamAssemblyArtifactV1Schema.parse({
        ...output,
        artifactId: identities.artifactIds.team,
        runId: identities.runId,
        agentRole: 'curiosity.team-assembler',
        schemaVersion: '1.0',
        createdAt: identities.createdAt,
        upstreamArtifactIds: [question.artifactId, knowledge.artifactId, interaction.artifactId],
        knowledgePackVersion: selectedPack.version,
      }),
  })) as TeamAssemblyArtifactV1;

  const story = (await execute({
    role: 'curiosity.story-designer',
    stage: 'story_design',
    failureCode: 'STORY_DESIGN_INVALID',
    agentRunId: identities.agentRunIds.story,
    artifactId: identities.artifactIds.story,
    upstreamArtifactIds: [question.artifactId, knowledge.artifactId, interaction.artifactId, team.artifactId],
    prompt: JSON.stringify({
      questionArtifact: question,
      knowledgeArtifact: knowledge,
      interactionArtifact: interaction,
      explorationTeam: team,
      age: input.age,
      requiredStageKinds: interaction.taskSequence,
      perspectiveDirective: input.perspectiveDirective,
      childLanguagePolicy:
        '使用孩子日常能直接理解的简体中文；禁止成人成语俗语、讽刺挖苦、贬低智力、反问施压和把错误答案说成事实。',
      narrationLoadPolicy:
        input.age <= 7
          ? '每次旁白只表达一个动作或一个观察问题，最多 40 个汉字。'
          : '每次旁白最多表达一个动作和一个观察问题，最多 56 个汉字。',
      hintPolicy: '每条提示最多 36 个汉字；三级提示都只能引导观察，不得直接写出完整因果答案。',
    }),
    schema: storyOutputSchemaForTasks(interaction.taskSequence, input.age),
    build: (output) =>
      storyDesignArtifactV1Schema.parse({
        ...output,
        artifactId: identities.artifactIds.story,
        runId: identities.runId,
        agentRole: 'curiosity.story-designer',
        schemaVersion: '1.0',
        createdAt: identities.createdAt,
        upstreamArtifactIds: [question.artifactId, knowledge.artifactId, interaction.artifactId, team.artifactId],
        knowledgePackVersion: selectedPack.version,
        sourceArtifactIds: {
          questionModel: question.artifactId,
          knowledgeDesign: knowledge.artifactId,
          interactionDesign: interaction.artifactId,
        },
      }),
  })) as StoryDesignArtifactV1;

  let spec: CuriosityExperienceSpecV2;
  let runtimeSpec: CuriosityExperienceSpecV1;
  let compiled: CompiledCuriosityExperience;
  try {
    spec = curiosityExperienceSpecV2Schema.parse({
      artifactId: identities.artifactIds.spec,
      runId: identities.runId,
      agentRole: 'curiosity.interaction-designer',
      schemaVersion: '2.0',
      createdAt: identities.createdAt,
      upstreamArtifactIds: [
        question.artifactId,
        knowledge.artifactId,
        interaction.artifactId,
        story.artifactId,
      ],
      knowledgePackVersion: selectedPack.version,
      experienceId: identities.experienceId,
      versionId: identities.versionId,
      revision: identities.revision ?? 1,
      profile: { age: input.age, interests: input.interests },
      sourceArtifactIds: {
        questionModel: question.artifactId,
        knowledgeDesign: knowledge.artifactId,
        interactionDesign: interaction.artifactId,
      },
      knowledge: {
        family: knowledge.knowledgeFamily,
        packId: knowledge.packId,
        packVersion: selectedPack.version,
      },
      title: question.equivalentQuestions[0] ?? question.coreQuestion,
      visualTheme: interaction.visualTheme,
      observationSuggestions: knowledge.observationSuggestions,
      instructions: interaction.instructionCopy,
      variables: interaction.variables.map(({ id, min, max, initial }) => ({
        id,
        min,
        max,
        initial,
      })),
      primitives: interaction.primitives,
      eventRequirements: [...CURIOSITY_EVENT_TYPES_V2],
    });
    compileCuriosityExperienceV2(spec);
    runtimeSpec = buildRuntimeSpec(input, question, knowledge, interaction, identities);
    compiled = compileCuriosityExperience(runtimeSpec);
    artifacts.push(spec);
    await notify('deterministic_compile');
  } catch (error) {
    throw new CuriosityAgentPipelineError(
      'DETERMINISTIC_VALIDATION_FAILED',
      'curiosity.interaction-designer',
      '确定性 Schema、知识、事件或编译检查失败。',
      structuredClone(artifacts),
      structuredClone(agentRuns),
      error,
    );
  }

  const quality = (await execute({
    role: 'curiosity.quality-reviewer',
    stage: 'quality_review',
    failureCode: 'QUALITY_REVIEW_INVALID',
    agentRunId: identities.agentRunIds.quality,
    artifactId: identities.artifactIds.quality,
    upstreamArtifactIds: [
      question.artifactId,
      knowledge.artifactId,
      interaction.artifactId,
      story.artifactId,
      spec.artifactId,
    ],
    prompt: JSON.stringify({
      reviewContract: {
        checksLength: 7,
        exactlyOnePerCriterion: true,
        languagePolicy: 'simplified-chinese-is-required',
        instructionNarrationPolicy:
          'short-screen-instructions-and-related-spoken-narration-are-intentionally-distinct',
        reviewScope:
          'reject-only-explicit-criterion-violations-supported-by-the-supplied-artifacts',
        copyLoadPolicy: `copy-load 只检查主要屏幕 instructionCopy；每条去掉标点和空格后不得超过 ${input.age <= 7 ? 16 : 28} 个汉字。简体中文、旁白比屏幕指令更完整、指令与旁白语义相关都不是拒绝理由。`,
        criterionRules: {
          'age-fit': `在主要屏幕指令超过 ${input.age <= 7 ? 16 : 28} 个汉字、变量超过 ${input.age <= 7 ? 2 : 3} 个、任务超过 ${input.age <= 7 ? 4 : 5} 个，或故事旁白含儿童难懂的成人成语俗语、讽刺挖苦、智力贬低与反问施压时拒绝。`,
          'interest-link':
            '只在内容声称了 input.interests 中不存在的具体兴趣事实时拒绝；没有使用兴趣不构成拒绝。',
          'knowledge-consistency':
            '只在内容与 knowledgeArtifact 的知识包、因果关系或允许词汇直接冲突时拒绝。',
          'misconception-risk':
            'only-reject-when-copy-affirms-a-forbidden-explanation;do-not-require-an-extra-safety-or-fact-confirmation-stage',
          'interaction-completeness':
            '只在缺少 requiredTaskKinds、使用未声明变量或使用未授权原语时拒绝。',
          'transfer-validity': '只在迁移任务引入知识包外机制、未声明变量或未授权原语时拒绝。',
          'copy-load':
            '按 copyLoadPolicy 判断；不得因中文、旁白更完整、语义重复或缺少国际化键而拒绝。',
        },
        criteria: [
          'age-fit',
          'interest-link',
          'knowledge-consistency',
          'misconception-risk',
          'interaction-completeness',
          'transfer-validity',
          'copy-load',
        ],
      },
      question,
      knowledge,
      interaction,
      team,
      story,
      spec,
    }),
    schema: qualityOutputSchemaForCandidate(input.age, interaction.instructionCopy),
    build: (output) =>
      qualityReviewArtifactV1Schema.parse({
        ...canonicalizeCuriosityQuality(output, 8),
        artifactId: identities.artifactIds.quality,
        runId: identities.runId,
        agentRole: 'curiosity.quality-reviewer',
        schemaVersion: '1.0',
        createdAt: identities.createdAt,
        upstreamArtifactIds: [
          question.artifactId,
          knowledge.artifactId,
          interaction.artifactId,
          story.artifactId,
          spec.artifactId,
        ],
        knowledgePackVersion: '1.0.0',
      }),
  })) as QualityReviewArtifactV1;

  if (quality.verdict !== 'pass') {
    const rejectionSummary = quality.checks
      .filter((check) => check.status === 'reject')
      .map((check) => `${check.criterion}:${check.findings.join('；') || '未提供原因'}`)
      .join('，');
    throw new CuriosityAgentPipelineError(
      'QUALITY_REJECTED',
      'curiosity.quality-reviewer',
      `质量审查拒绝候选体验：${rejectionSummary}`,
      structuredClone(artifacts),
      structuredClone(agentRuns),
    );
  }

  return { artifacts, agentRuns, spec, runtimeSpec, compiled };
}
