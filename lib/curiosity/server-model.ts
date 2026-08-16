import type { NextRequest } from 'next/server';
import { Output } from 'ai';

import { callLLM } from '@/lib/ai/llm';
import { resolveModelFromRequest, type ResolvedModel } from '@/lib/server/resolve-model';
import { CuriosityModelUnavailableError } from './api-handlers';
import type { CuriosityAgentRole } from './agent-contracts';
import { getCuriosityRoleStage, type CuriosityRoleRoute } from './agent-routing';
import type { CuriosityExperienceSpecV1 } from './contracts';
import type { CuriosityTextModel } from './model';

function jsonModel(value: unknown): CuriosityTextModel {
  return { complete: async () => JSON.stringify(value) };
}

function createTestInitialRoleModel(role: CuriosityAgentRole): CuriosityTextModel {
  if (role === 'curiosity.question-modeler') {
    return jsonModel({
      coreQuestion: '为什么我们移动时，月亮看起来还在原来的方向？',
      equivalentQuestions: ['月亮为什么像在跟着我？'],
      ageBand: '8-10',
      safetyTags: [],
      supportStatus: 'supported',
      knowledgeRoute: 'curated',
      knowledgeFamilyCandidates: ['relative-motion'],
      clarifications: [],
    });
  }
  if (role === 'curiosity.knowledge-designer') {
    return jsonModel({
      objectives: ['比较近处与远处物体的视角变化'],
      causalRelations: [
        {
          cause: '观察者移动相同距离',
          relation: '距离越远，观察方向变化越小',
          effect: '月亮看起来几乎停在原来的方向',
        },
      ],
      prerequisites: ['知道远和近'],
      allowedVocabulary: ['远', '近', '观察方向'],
      allowedExplanations: ['距离越远，观察方向变化越小。'],
      forbiddenExplanations: ['月亮真的在追着观察者移动'],
      misconceptions: ['视角变化等于真实速度'],
      uncertainties: [],
      timeSensitive: false,
      ageExpressionStrategy: '比较路灯和月亮。',
      observationSuggestions: ['散步时比较路灯和月亮。'],
      packReferences: ['relative-motion.moon-following.v1#core'],
    });
  }
  if (role === 'curiosity.interaction-designer') {
    return jsonModel({
      scenario: '走过一盏路灯时，它很快被甩到身后；月亮为什么还在原来的方向？',
      visualTheme: '安静的蓝色夜空',
      sceneType: 'relation-explorer',
      variables: [
        { id: 'observer-position', label: '观察者位置', min: -80, max: 80, initial: 0 },
        { id: 'object-distance', label: '物体距离', min: 20, max: 400, initial: 200 },
      ],
      relations: [
        {
          id: 'distance-change',
          fromVariableId: 'object-distance',
          toVariableId: 'observer-position',
          direction: 'inverse',
        },
      ],
      tasks: [
        {
          id: 'prediction',
          kind: 'prediction',
          prompt: '谁变化得更明显？',
          options: [
            { id: 'near-lamp', label: '近处路灯' },
            { id: 'moon', label: '月亮' },
          ],
          expectedOptionId: 'near-lamp',
        },
        {
          id: 'exploration',
          kind: 'exploration',
          prompt: '移动看看。',
          variable: 'observer-position',
        },
        {
          id: 'challenge',
          kind: 'challenge',
          prompt: '放远后会怎样？',
          options: [
            { id: 'nearer', label: '变化更大' },
            { id: 'farther', label: '变化更小' },
          ],
          expectedOptionId: 'farther',
        },
        {
          id: 'explanation',
          kind: 'explanation',
          prompt: '为什么像在跟着？',
          options: [
            { id: 'small-angle-change', label: '月亮很远，观察方向变化小' },
            { id: 'object-follows', label: '月亮真的在追着我们' },
          ],
          expectedOptionId: 'small-angle-change',
        },
      ],
      taskSequence: ['prediction', 'exploration', 'guided-discovery', 'transfer', 'explanation'],
      instructionCopy: [
        { taskId: 'prediction', kind: 'prediction', text: '先猜一猜' },
        { taskId: 'exploration', kind: 'exploration', text: '拖动看看' },
        { taskId: 'guided-discovery', kind: 'guided-discovery', text: '比较远和近' },
        { taskId: 'transfer', kind: 'transfer', text: '换个距离试试' },
        { taskId: 'explanation', kind: 'explanation', text: '选一个说给家长听' },
      ],
      primitives: ['move-observer', 'compare-near-far'],
      feedback: [
        {
          trigger: 'observer-moved',
          message: '近处路灯的方向变化更明显。',
          explains: '距离会影响观察方向的变化大小。',
        },
      ],
      endConditions: ['完成一次远近比较', '选择一个解释'],
    });
  }
  if (role === 'curiosity.presentation-designer') {
    return jsonModel({
      title: '月亮为什么像在跟着我？',
      hook: '先猜猜路灯和月亮谁变化更明显。',
      explorePrompt: '移动小朋友，比较远近物体。',
      challengePrompt: '把物体放远再比较。',
      completion: '你发现了：距离越远，观察方向变化越小。',
      narrationLibrary: [
        {
          id: 'narration_start',
          eventType: 'experiment_started',
          action: '*',
          text: '先猜一猜，路灯和月亮谁变化得更快？',
        },
        {
          id: 'narration_move',
          eventType: 'variable_changed',
          action: '*',
          text: '比较远处和近处，找找变化的规律。',
        },
        {
          id: 'narration_finish',
          eventType: 'experience_completed',
          action: '*',
          text: '你用自己的观察找到了原因。',
        },
      ],
      immediateFeedback: [
        {
          id: 'feedback_move',
          eventType: 'variable_changed',
          outcome: 'observe',
          text: '记住近处和远处变化的不同。',
        },
      ],
      discoveryPrompts: [
        { id: 'card_mountain', prompt: '远山为什么也像在跟着车走？', skippable: true },
      ],
    });
  }
  if (role === 'curiosity.quality-reviewer') {
    return jsonModel({
      checks: [
        'age-fit',
        'knowledge-grounding',
        'misconception-risk',
        'scene-safety',
        'interaction-completeness',
        'narration-coverage',
        'discovery-card-quality',
      ].map((criterion) => ({ criterion, status: 'pass', findings: [] })),
      verdict: 'pass',
    });
  }
  throw new CuriosityModelUnavailableError(`没有初次生成测试模型：${role}`);
}

function createTestRevisionPlannerModel(body: unknown): CuriosityTextModel {
  const revision = body as {
    baseSpec?: CuriosityExperienceSpecV1;
    instruction?: string;
  };
  if (!revision.baseSpec || typeof revision.instruction !== 'string') {
    throw new CuriosityModelUnavailableError('测试修改请求缺少基础版本或修改指令。');
  }
  const baseSpec = revision.baseSpec;
  const instruction = revision.instruction;
  return {
    async complete({ prompt }) {
      const changedFields: string[] = [];
      const operations: Array<Record<string, unknown>> = [];
      if (/6\s*岁|六岁/.test(instruction)) {
        changedFields.push('profile.age');
        operations.push({ op: 'set_age', age: 6 });
      }
      if (/10\s*岁|十岁/.test(instruction)) {
        changedFields.push('profile.age');
        operations.push({ op: 'set_age', age: 10 });
      }
      if (/文字.*(?:少|减)|减少.*文字/.test(instruction)) {
        changedFields.push('presentation.instructions');
        operations.push({
          op: 'replace_instruction',
          taskId: 'exploration',
          value: '拖动看看',
        });
      }
      if (/桌上|动手|手指/.test(instruction)) {
        changedFields.push('observationSuggestions');
        operations.push({
          op: 'replace_observation_suggestion',
          index: 0,
          value: '桌上用手指比较近处和远处物体的视角变化。',
        });
      }
      if (changedFields.length === 0) {
        return JSON.stringify({ unsupported: true });
      }
      if (prompt.includes('"phase":"impact"')) {
        return JSON.stringify({
          baseVersionId: baseSpec.versionId,
          summary: '只调整年龄表达或现实观察建议，保持知识模型不变。',
          changedFields: [...new Set(changedFields)],
          preservedFields: ['knowledge.packId', 'knowledge.packVersion'],
          knowledgeFamily: baseSpec.knowledge.family,
        });
      }
      return JSON.stringify({ operations });
    },
  };
}

interface CuriosityRoleModelDependencies {
  resolveModel(
    request: NextRequest,
    body: unknown,
    stage: ReturnType<typeof getCuriosityRoleStage>,
  ): Promise<ResolvedModel>;
  callModel(
    params: {
      model: ResolvedModel['model'];
      system: string;
      prompt: string;
      maxOutputTokens: number;
      abortSignal: AbortSignal;
      output?: ReturnType<typeof Output.object>;
    },
    source: string,
    retryOptions: undefined,
    thinkingConfig: ResolvedModel['thinkingConfig'],
  ): Promise<{ text: string; output?: unknown }>;
}

const defaultDependencies: CuriosityRoleModelDependencies = {
  resolveModel: resolveModelFromRequest,
  callModel: (params, source, retryOptions, thinkingConfig) =>
    callLLM(params, source, retryOptions, thinkingConfig),
};

function isExplicitTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_TEST === 'true';
}

function curiosityModelTimeoutMs(): number {
  const configured = process.env.CURIOSITY_MODEL_TIMEOUT_MS;
  if (!configured) return 120_000;
  const value = Number(configured);
  if (!Number.isInteger(value) || value < 10_000 || value > 300_000) {
    throw new CuriosityModelUnavailableError(
      'CURIOSITY_MODEL_TIMEOUT_MS 必须是 10000 到 300000 之间的整数。',
    );
  }
  return value;
}

const CURIOSITY_ROLE_OUTPUT_TOKENS: Record<CuriosityAgentRole, number> = {
  'curiosity.question-modeler': 1536,
  'curiosity.knowledge-designer': 3072,
  'curiosity.interaction-designer': 8192,
  'curiosity.presentation-designer': 8192,
  'curiosity.quality-reviewer': 4096,
  'curiosity.revision-planner': 3072,
};

function createTestRoleModel(
  role: CuriosityAgentRole,
  body: unknown,
): CuriosityTextModel & { route: CuriosityRoleRoute } {
  let selected: CuriosityTextModel;
  if (role === 'curiosity.revision-planner') {
    selected = createTestRevisionPlannerModel(body);
  } else {
    selected = createTestInitialRoleModel(role);
  }
  return {
    ...selected,
    route: { providerId: 'test', modelId: 'curiosity-strict-json' },
  };
}

export async function resolveCuriosityRoleModel(
  request: NextRequest,
  body: unknown,
  role: CuriosityAgentRole,
  dependencies: CuriosityRoleModelDependencies = defaultDependencies,
): Promise<CuriosityTextModel & { route: CuriosityRoleRoute }> {
  if (process.env.CURIOSITY_TEST_MODEL === 'true') {
    if (!isExplicitTestEnvironment()) {
      throw new CuriosityModelUnavailableError(
        'CURIOSITY_TEST_MODEL 只能在测试或显式 Playwright 环境启用。',
      );
    }
    return createTestRoleModel(role, body);
  }

  let resolved: ResolvedModel;
  try {
    resolved = await dependencies.resolveModel(request, body, getCuriosityRoleStage(role));
  } catch (error) {
    throw new CuriosityModelUnavailableError(
      `角色 ${role} 没有可用模型。请配置角色路由或默认模型。`,
      error,
    );
  }

  return {
    route: {
      providerId: resolved.providerId,
      modelId: resolved.modelId,
      ...(resolved.thinkingConfig ? { thinkingConfig: resolved.thinkingConfig } : {}),
    },
    async complete(input) {
      const thinkingConfig =
        input.schema && !resolved.thinkingConfig
          ? {
              mode: 'disabled' as const,
              enabled: false,
              ...(resolved.providerId === 'openrouter'
                ? { requireStructuredOutputProvider: true }
                : {}),
            }
          : resolved.thinkingConfig;
      const parameters = {
        model: resolved.model,
        system: input.system ?? '',
        prompt: input.prompt,
        maxOutputTokens: Math.min(
          resolved.modelInfo?.outputWindow ?? CURIOSITY_ROLE_OUTPUT_TOKENS[role],
          CURIOSITY_ROLE_OUTPUT_TOKENS[role],
        ),
        abortSignal: AbortSignal.timeout(curiosityModelTimeoutMs()),
        ...(input.schema ? { output: Output.object({ schema: input.schema }) } : {}),
      };
      const result = await dependencies.callModel(parameters, role, undefined, thinkingConfig);
      return input.schema ? JSON.stringify(result.output) : result.text;
    },
  };
}
