import { z } from 'zod';

import {
  guidanceTurnRequestV1Schema,
  guidanceTurnResponseV1Schema,
  knowledgeDesignArtifactV1Schema,
  storyDesignArtifactV1Schema,
  type GuidanceTurnResponseV1,
} from './agent-contracts';
import type { CuriosityPipelineModel } from './agent-pipeline';
import { applyGuidanceTurn, createGuidanceState, GuidanceStageConflictError } from './guidance';
import { renderCuriosityRoleSkill } from './agent-skills';

const guideModelOutputSchema = z.strictObject({
  narration: z.string().trim().min(1).max(240),
  feedbackKind: z.enum(['prompt', 'observation', 'hint', 'encouragement', 'retry']),
  hintLevel: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  advanceTo: z
    .string()
    .trim()
    .min(3)
    .max(96)
    .regex(/^[a-zA-Z0-9_-]+$/),
});

export const curiosityGuidanceInputSchema = z.strictObject({
  request: guidanceTurnRequestV1Schema,
  story: storyDesignArtifactV1Schema,
  knowledge: knowledgeDesignArtifactV1Schema,
});

export type CuriosityGuidanceErrorCode =
  | 'GUIDANCE_MODEL_INVALID'
  | 'GUIDANCE_STAGE_CONFLICT'
  | 'GUIDANCE_KNOWLEDGE_VIOLATION'
  | 'MODEL_UNAVAILABLE';

export class CuriosityGuidanceError extends Error {
  constructor(
    readonly code: CuriosityGuidanceErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CuriosityGuidanceError';
  }
}

export async function runCuriosityGuidanceTurn(
  input: z.input<typeof curiosityGuidanceInputSchema>,
  model: CuriosityPipelineModel,
): Promise<GuidanceTurnResponseV1> {
  const parsed = curiosityGuidanceInputSchema.parse(input);
  const { request, story, knowledge } = parsed;
  if (
    request.storyArtifactId !== story.artifactId ||
    story.sourceArtifactIds.knowledgeDesign !== knowledge.artifactId ||
    story.knowledgePackVersion !== knowledge.knowledgePackVersion
  ) {
    throw new CuriosityGuidanceError(
      'GUIDANCE_STAGE_CONFLICT',
      '引导请求、故事和知识产物绑定不一致。',
    );
  }
  const stage = story.stages.find((candidate) => candidate.id === request.stageId);
  if (!stage) {
    throw new CuriosityGuidanceError('GUIDANCE_STAGE_CONFLICT', '当前故事阶段不存在。');
  }
  const stageIndex = story.stages.indexOf(stage);
  const nextStageId = story.stages[stageIndex + 1]?.id;
  const allowedAdvanceTo = (
    request.childInput.kind === 'event' && nextStageId ? [nextStageId] : [stage.id, nextStageId]
  ).filter((stageId): stageId is string => Boolean(stageId));

  let output: z.infer<typeof guideModelOutputSchema>;
  try {
    const outputSchema = JSON.stringify(z.toJSONSchema(guideModelOutputSchema));
    const raw = await model.complete({
      system: `你是儿童探索引导者。\n${renderCuriosityRoleSkill('curiosity.exploration-guide')}\n只返回严格 JSON；只能使用给定知识、提示和相邻阶段，不得直接泄露答案或扩展科学机制。输出必须严格符合以下 JSON Schema：${outputSchema}`,
      prompt: JSON.stringify({
        stage,
        childInput: request.childInput,
        recentEventIds: request.recentEventIds,
        allowedAdvanceTo,
        allowedVocabulary: knowledge.allowedVocabulary,
        forbiddenExplanations: knowledge.forbiddenExplanations,
      }),
      schema: guideModelOutputSchema,
    });
    output = guideModelOutputSchema.parse(JSON.parse(raw));
  } catch (error) {
    throw new CuriosityGuidanceError(
      'GUIDANCE_MODEL_INVALID',
      '探索引导模型输出未通过严格 Schema。',
      error,
    );
  }

  const advanceTo =
    request.childInput.kind === 'event' ? (nextStageId ?? stage.id) : output.advanceTo;

  if (!allowedAdvanceTo.includes(advanceTo)) {
    throw new CuriosityGuidanceError(
      'GUIDANCE_STAGE_CONFLICT',
      `引导阶段只能推进到：${allowedAdvanceTo.join('、')}。`,
    );
  }

  if (knowledge.forbiddenExplanations.some((forbidden) => output.narration.includes(forbidden))) {
    throw new CuriosityGuidanceError(
      'GUIDANCE_KNOWLEDGE_VIOLATION',
      '探索引导包含知识包禁止解释。',
    );
  }

  const response = guidanceTurnResponseV1Schema.parse({
    schemaVersion: '1.0',
    experienceId: request.experienceId,
    versionId: request.versionId,
    storyArtifactId: story.artifactId,
    stageId: request.stageId,
    triggeredByEventIds: request.recentEventIds,
    ...output,
    advanceTo,
  });
  const state = { ...createGuidanceState(story), stageId: request.stageId };
  try {
    applyGuidanceTurn(state, response, story, {
      experienceId: request.experienceId,
      versionId: request.versionId,
    });
  } catch (error) {
    if (error instanceof GuidanceStageConflictError) {
      throw new CuriosityGuidanceError('GUIDANCE_STAGE_CONFLICT', error.message, error);
    }
    throw error;
  }
  return response;
}
