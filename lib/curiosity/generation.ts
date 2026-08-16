import { z } from 'zod';

import {
  CURIOUSITY_EVENT_TYPES,
  curiosityExperienceSpecSchema,
  curiosityPatchSchema,
  tabletopExperimentSchema,
  type CuriosityExperienceSpecV1,
} from './contracts';
import { compileCuriosityExperience, type CompiledCuriosityExperience } from './compiler';
import {
  classifyCuriosityRequest,
  MOON_KNOWLEDGE_PACK,
  validateKnowledgeBoundaries,
} from './knowledge';
import { applyCuriosityPatch } from './revisions';

const shortText = z.string().trim().min(1).max(180);

export const curiosityAuthoringSchema = z.strictObject({
  coreQuestion: z.string().trim().min(4).max(180),
  presentation: z.strictObject({
    title: shortText,
    hook: shortText,
    explorePrompt: shortText,
    challengePrompt: shortText,
    completion: shortText,
  }),
  simulation: z.strictObject({
    observerTravel: z.number().min(40).max(100),
    nearObjectDistance: z.number().min(10).max(30),
    farObjectDistance: z.number().min(200).max(600),
  }),
  taskCopy: z.strictObject({
    predictionPrompt: shortText,
    challengePrompt: shortText,
    explanationPrompt: shortText,
    nearLabel: shortText,
    mountainLabel: shortText,
    moonLabel: shortText,
    nearerLabel: shortText,
    fartherLabel: shortText,
    correctExplanationLabel: shortText,
    misconceptionLabel: shortText,
  }),
  tabletopExperiment: tabletopExperimentSchema.optional(),
});

export interface CuriosityTextModel {
  complete(input: { system: string; prompt: string; schema?: z.ZodType }): Promise<string>;
}

export type CuriosityGenerationErrorCode =
  | 'INVALID_MODEL_OUTPUT'
  | 'INVALID_GENERATED_SPEC'
  | 'INVALID_REVISION_REQUEST';

export class CuriosityGenerationError extends Error {
  constructor(
    readonly code: CuriosityGenerationErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CuriosityGenerationError';
  }
}

export interface CuriosityCandidate {
  spec: CuriosityExperienceSpecV1;
  compiled: CompiledCuriosityExperience;
}

function parseStrictModelJson<T>(raw: string, schema: z.ZodType<T>): T {
  try {
    return schema.parse(JSON.parse(raw));
  } catch (error) {
    throw new CuriosityGenerationError(
      'INVALID_MODEL_OUTPUT',
      '模型输出不是符合 Curiosity 严格 Schema 的 JSON。',
      error,
    );
  }
}

function buildAuthoringPrompt(input: {
  question: string;
  age: number;
  interests: string[];
}): string {
  return `请为儿童好奇心互动体验生成严格 JSON 数据。\n\n输入：${JSON.stringify(input)}\n\n知识边界：${MOON_KNOWLEDGE_PACK.coreExplanation}\n\n只允许改写适龄文案、选择给定范围内的三个距离参数，以及可选的桌上远近观察实验。不要输出 HTML、JavaScript、Markdown、额外字段或新的科学机制。任务固定包含预测、移动观察者、远近迁移挑战和解释选择。输出字段必须严格为 coreQuestion、presentation、simulation、taskCopy，可选 tabletopExperiment。`;
}

function buildRevisionPrompt(base: CuriosityExperienceSpecV1, instruction: string): string {
  return `把自然语言修改转换为严格的 CuriosityPatchV1 JSON。\n\n当前规格：${JSON.stringify(base)}\n\n修改要求：${JSON.stringify(instruction)}\n\n只允许操作 set_age、set_interests、replace_copy、set_parameter、set_tabletop_experiment、remove_tabletop_experiment。baseVersionId 必须为 ${base.versionId}。不得输出 HTML、JavaScript、Markdown、任意 JSON Pointer 或额外字段。`;
}

export async function createCuriosityCandidate(
  input: { question: string; age: number; interests: string[] },
  model: CuriosityTextModel,
  identity: { experienceId: string; versionId: string; createdAt: string },
): Promise<CuriosityCandidate> {
  const mapping = classifyCuriosityRequest(input);
  const raw = await model.complete({
    system:
      '你是受约束的儿童科学体验规格作者。只返回一个严格 JSON 对象；任何边界外请求都不得扩展知识机制。',
    prompt: buildAuthoringPrompt(input),
  });
  const authored = parseStrictModelJson(raw, curiosityAuthoringSchema);

  try {
    const spec = curiosityExperienceSpecSchema.parse({
      schemaVersion: '1.0',
      ...identity,
      revision: 1,
      profile: { age: input.age, interests: input.interests },
      question: { original: input.question, coreQuestion: authored.coreQuestion },
      knowledge: mapping,
      presentation: authored.presentation,
      simulation: { preset: 'moon-parallax-v1', ...authored.simulation },
      tasks: [
        {
          id: 'prediction',
          kind: 'prediction',
          prompt: authored.taskCopy.predictionPrompt,
          options: [
            { id: 'near-lamp', label: authored.taskCopy.nearLabel },
            { id: 'far-mountain', label: authored.taskCopy.mountainLabel },
            { id: 'moon', label: authored.taskCopy.moonLabel },
          ],
          expectedOptionId: 'near-lamp',
        },
        {
          id: 'exploration',
          kind: 'exploration',
          prompt: authored.presentation.explorePrompt,
          variable: 'observer-position',
        },
        {
          id: 'challenge',
          kind: 'challenge',
          prompt: authored.taskCopy.challengePrompt,
          options: [
            { id: 'nearer', label: authored.taskCopy.nearerLabel },
            { id: 'farther', label: authored.taskCopy.fartherLabel },
          ],
          expectedOptionId: 'farther',
        },
        {
          id: 'explanation',
          kind: 'explanation',
          prompt: authored.taskCopy.explanationPrompt,
          options: [
            { id: 'small-angle-change', label: authored.taskCopy.correctExplanationLabel },
            { id: 'moon-follows', label: authored.taskCopy.misconceptionLabel },
          ],
          expectedOptionId: 'small-angle-change',
        },
      ],
      ...(authored.tabletopExperiment ? { tabletopExperiment: authored.tabletopExperiment } : {}),
      eventRequirements: [...CURIOUSITY_EVENT_TYPES],
    });
    validateKnowledgeBoundaries(spec);
    return { spec, compiled: compileCuriosityExperience(spec) };
  } catch (error) {
    throw new CuriosityGenerationError(
      'INVALID_GENERATED_SPEC',
      '生成规格未通过知识、Schema、事件或编译检查。',
      error,
    );
  }
}

export async function createCuriosityRevisionCandidate(
  base: CuriosityExperienceSpecV1,
  instructionInput: string,
  model: CuriosityTextModel,
  identity: { versionId: string; createdAt: string },
): Promise<CuriosityCandidate> {
  const instruction = instructionInput.trim();
  if (instruction.length < 2 || instruction.length > 240) {
    throw new CuriosityGenerationError(
      'INVALID_REVISION_REQUEST',
      '修改要求长度必须为 2–240 个字符。',
    );
  }
  const validatedBase = curiosityExperienceSpecSchema.parse(base);
  classifyCuriosityRequest({
    question: validatedBase.question.original,
    age: validatedBase.profile.age,
  });
  const raw = await model.complete({
    system:
      '你是受约束的儿童科学体验修改器。只返回 CuriosityPatchV1 JSON；无法满足时输出无效请求而不是改写知识边界。',
    prompt: buildRevisionPrompt(validatedBase, instruction),
  });
  const patch = parseStrictModelJson(raw, curiosityPatchSchema);

  try {
    const spec = applyCuriosityPatch(validatedBase, patch, identity);
    return { spec, compiled: compileCuriosityExperience(spec) };
  } catch (error) {
    throw new CuriosityGenerationError(
      'INVALID_GENERATED_SPEC',
      '修改后的规格未通过完整检查，原版本保持不变。',
      error,
    );
  }
}
