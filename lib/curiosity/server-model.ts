import type { NextRequest } from 'next/server';
import { Output } from 'ai';

import { callLLM, type LLMRetryOptions } from '@/lib/ai/llm';
import { resolveModelFromRequest, type ResolvedModel } from '@/lib/server/resolve-model';
import { CuriosityModelUnavailableError } from './api-handlers';
import type { CuriosityAgentRole } from './agent-contracts';
import { getCuriosityRoleStage, type CuriosityRoleRoute } from './agent-routing';
import type { CuriosityExperienceSpecV1 } from './contracts';
import type { CuriosityTextModel } from './generation';

function jsonModel(value: unknown): CuriosityTextModel {
  return { complete: async () => JSON.stringify(value) };
}

function createTestInitialRoleModel(role: CuriosityAgentRole): CuriosityTextModel {
  if (role === 'curiosity.team-assembler') {
    return jsonModel({
      teamName: '月光观察队',
      rationale: '围绕远近比较和儿童动手观察，组建精简的科学探索团队。',
      members: [
        {
          id: 'member_lead',
          name: '小满队长',
          role: 'lead',
          persona: '温和地串起问题和任务，只给孩子下一步线索。',
          avatar: '🌙',
          color: '#4F7DA1',
          priority: 10,
          voiceStyle: '温暖清楚，语速舒缓',
        },
        {
          id: 'member_science',
          name: '远近博士',
          role: 'science',
          persona: '专门核对远近物体与观察方向，守住科学解释边界。',
          avatar: '🔭',
          color: '#927236',
          priority: 8,
          voiceStyle: '沉稳准确，句子简短',
        },
        {
          id: 'member_interaction',
          name: '动手阿桥',
          role: 'interaction',
          persona: '把抽象规律变成孩子可以移动、比较和验证的动作。',
          avatar: '🧩',
          color: '#3F8066',
          priority: 7,
          voiceStyle: '活泼鼓励，节奏明快',
        },
      ],
    });
  }
  if (role === 'curiosity.question-modeler') {
    return jsonModel({
      coreQuestion: '为什么我们移动时，月亮看起来还在原来的方向？',
      equivalentQuestions: ['月亮为什么像在跟着我？'],
      ageBand: '8-10',
      interestSignals: ['散步'],
      safetyTags: [],
      supportStatus: 'supported',
      knowledgeFamilyCandidates: ['relative-motion'],
      clarifications: [],
    });
  }
  if (role === 'curiosity.knowledge-designer') {
    return jsonModel({
      knowledgeFamily: 'relative-motion',
      packId: 'relative-motion.moon-following.v1',
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
      forbiddenExplanations: ['月亮真的在追着观察者移动'],
      misconceptions: ['视角变化等于真实速度'],
      ageExpressionStrategy: '比较路灯和月亮。',
      observationSuggestions: ['散步时比较路灯和月亮。'],
      packReferences: ['relative-motion.moon-following.v1#core'],
    });
  }
  if (role === 'curiosity.interaction-designer') {
    return jsonModel({
      scenario: '走过一盏路灯时，它很快被甩到身后；月亮为什么还在原来的方向？',
      visualTheme: '安静的蓝色夜空',
      variables: [
        { id: 'observer-position', label: '观察者位置', min: -80, max: 80, initial: 0 },
        { id: 'object-distance', label: '物体距离', min: 20, max: 400, initial: 200 },
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
  if (role === 'curiosity.story-designer') {
    const hints = (subject: string) => [
      { level: 0, text: `先看看${subject}。`, revealsAnswer: false },
      { level: 1, text: `再比较${subject}的变化。`, revealsAnswer: false },
      { level: 2, text: `用刚才看到的${subject}来回答。`, revealsAnswer: false },
    ];
    return jsonModel({
      stages: [
        {
          id: 'predict',
          kind: 'prediction',
          openingNarration: '先猜一猜，路灯和月亮谁变化得更快？',
          prompt: '说出你的猜想。',
          allowedEventTypes: ['prediction_submitted'],
          hints: hints('远处和近处'),
          completionCondition: '提交一次预测',
        },
        {
          id: 'explore',
          kind: 'exploration',
          openingNarration: '移动小朋友，观察三个物体。',
          prompt: '拖动看看。',
          allowedEventTypes: ['variable_changed'],
          hints: hints('实验变量'),
          completionCondition: '产生一次变量变化',
        },
        {
          id: 'discover',
          kind: 'guided-discovery',
          openingNarration: '比较远处和近处，找找规律。',
          prompt: '距离改变后，看到的移动有什么不同？',
          allowedEventTypes: ['variable_changed'],
          hints: hints('远近规律'),
          completionCondition: '说出一次远近比较结果',
        },
        {
          id: 'transfer',
          kind: 'transfer',
          openingNarration: '换成坐车看远山，再试一次。',
          prompt: '哪一个看起来移动得慢？',
          allowedEventTypes: ['transfer_attempted'],
          hints: hints('新情境'),
          completionCondition: '完成一次迁移选择',
        },
        {
          id: 'explain',
          kind: 'explanation',
          openingNarration: '把你的发现说给家长听。',
          prompt: '为什么月亮看起来跟着我们？',
          allowedEventTypes: ['explanation_selected'],
          hints: hints('观察现象'),
          completionCondition: '留下一个解释事件',
        },
      ],
    });
  }
  if (role === 'curiosity.quality-reviewer') {
    return jsonModel({
      checks: [
        'age-fit',
        'interest-link',
        'knowledge-consistency',
        'misconception-risk',
        'interaction-completeness',
        'transfer-validity',
        'copy-load',
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
    retryOptions: LLMRetryOptions | undefined,
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
  'curiosity.team-assembler': 3072,
  'curiosity.knowledge-designer': 3072,
  'curiosity.interaction-designer': 8192,
  'curiosity.story-designer': 8192,
  'curiosity.quality-reviewer': 4096,
  'curiosity.exploration-guide': 1024,
  'curiosity.revision-planner': 3072,
};

function createTestRoleModel(
  role: CuriosityAgentRole,
  body: unknown,
): CuriosityTextModel & { route: CuriosityRoleRoute } {
  let selected: CuriosityTextModel;
  if (role === 'curiosity.revision-planner') {
    selected = createTestRevisionPlannerModel(body);
  } else if (role === 'curiosity.exploration-guide') {
    const input = body as {
      request?: { stageId?: string };
      story?: { stages?: Array<{ id?: string }> };
    };
    const stages = input.story?.stages ?? [];
    const currentIndex = stages.findIndex((stage) => stage.id === input.request?.stageId);
    const advanceTo = stages[Math.min(Math.max(currentIndex, 0) + 1, stages.length - 1)]?.id;
    if (!input.request?.stageId || !advanceTo) {
      throw new CuriosityModelUnavailableError('测试引导请求缺少有效故事阶段。');
    }
    selected = jsonModel({
      narration: '记住刚才的发现，我们继续试一试。',
      feedbackKind: 'observation',
      hintLevel: 0,
      advanceTo,
    });
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
        system: input.system,
        prompt: input.prompt,
        maxOutputTokens: Math.min(
          resolved.modelInfo?.outputWindow ?? CURIOSITY_ROLE_OUTPUT_TOKENS[role],
          CURIOSITY_ROLE_OUTPUT_TOKENS[role],
        ),
        abortSignal: AbortSignal.timeout(curiosityModelTimeoutMs()),
        ...(input.schema ? { output: Output.object({ schema: input.schema }) } : {}),
      };
      // Structured-output calls occasionally come back with nothing generated
      // (AI_NoOutputGeneratedError). That is thrown, so a retry recovers it.
      // `validate` must stay permissive: the payload lands in `result.output`,
      // and the default validator inspects `result.text`, which is empty for a
      // schema call and would retry every success. The abort signal lives in
      // `parameters` and is shared across attempts, so retries cannot extend
      // the per-call timeout budget.
      const retryOptions = input.schema ? { retries: 2, validate: () => true } : { retries: 2 };
      const result = await dependencies.callModel(parameters, role, retryOptions, thinkingConfig);
      return input.schema ? JSON.stringify(result.output) : result.text;
    },
  };
}
