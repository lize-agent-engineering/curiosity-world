import type { NextRequest } from 'next/server';
import { Output } from 'ai';

import { callLLM } from '@/lib/ai/llm';
import { resolveModelFromRequest, type ResolvedModel } from '@/lib/server/resolve-model';
import { CuriosityModelUnavailableError } from './api-handlers';
import type { CuriosityAgentRole } from './agent-contracts';
import { getCuriosityRoleStage, type CuriosityRoleRoute } from './agent-routing';
import type { CuriosityExperienceSpecV3 } from './experience-spec-v3';
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
      scene: {
        type: 'relative-motion',
        title: '月亮真的在跟着我吗？',
        instructions: ['拖动小朋友，再比较近处路灯和远处月亮。'],
        observerTravel: 80,
        nearObjectDistance: 20,
        farObjectDistance: 400,
      },
      feedback: [
        {
          trigger: 'observer-moved',
          message: '近处路灯的方向变化更明显。',
          explains: '距离会影响观察方向的变化大小。',
        },
      ],
    });
  }
  if (role === 'curiosity.presentation-designer') {
    return jsonModel({
      narrationLibrary: [
        {
          id: 'narration_start',
          eventType: 'exploration_started',
          action: '*',
          text: '先猜一猜，路灯和月亮谁变化得更快？',
        },
        {
          id: 'narration_move',
          eventType: 'control_changed',
          action: '*',
          text: '比较远处和近处，找找变化的规律。',
        },
        {
          id: 'narration_finish',
          eventType: 'exploration_ended',
          action: '*',
          text: '你用自己的观察找到了原因。',
        },
      ],
      discoveryPrompts: [
        { id: 'card_mountain', prompt: '远山为什么也像在跟着车走？', skippable: true },
      ],
      limitations: ['这个场景只比较观察方向，不表示月亮真的移动。'],
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
    baseVersionId?: string;
    spec?: CuriosityExperienceSpecV3;
    instruction?: string;
  };
  if (!revision.baseVersionId || !revision.spec || typeof revision.instruction !== 'string') {
    throw new CuriosityModelUnavailableError('测试修改请求缺少基础版本或修改指令。');
  }
  const instruction = revision.instruction;
  return {
    async complete() {
      const changedFields: string[] = [];
      const operations: Array<Record<string, unknown>> = [];
      if (/6\s*岁|六岁/.test(instruction)) {
        changedFields.push('targetAge');
        operations.push({ op: 'set_target_age', value: 6 });
      }
      if (/10\s*岁|十岁/.test(instruction)) {
        changedFields.push('targetAge');
        operations.push({ op: 'set_target_age', value: 10 });
      }
      if (/文字.*(?:少|减)|减少.*文字/.test(instruction)) {
        changedFields.push('scene.instructions');
        operations.push({
          op: 'replace_instruction',
          index: 0,
          value: '拖动看看',
        });
      }
      if (/桌上|动手|手指/.test(instruction)) {
        changedFields.push('scene.title');
        operations.push({
          op: 'replace_scene_title',
          value: '用手指比较远近变化',
        });
      }
      if (changedFields.length === 0) {
        return JSON.stringify({ unsupported: true });
      }
      return JSON.stringify({ baseVersionId: revision.baseVersionId, operations });
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
  'curiosity.question-modeler': 1_536,
  'curiosity.knowledge-designer': 3_072,
  'curiosity.interaction-designer': 8_192,
  'curiosity.presentation-designer': 8_192,
  'curiosity.quality-reviewer': 4_096,
  'curiosity.revision-planner': 3_072,
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
