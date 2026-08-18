/**
 * Role → model resolution for the studio pipeline.
 *
 * Mirrors lib/curiosity/server-model.ts: each role is an `LLM_STAGES` entry, so
 * an operator routes `studio.planner` / `studio.coder` / `studio.reviewer`
 * independently through `MODEL_ROUTES`. Two differences matter:
 *  - the coder returns plain text, not a schema-constrained object, so it is not
 *    restricted to providers that support strict structured output and it gets a
 *    much larger output budget (it writes a whole document);
 *  - the coder streams, so the worker can persist partial code as it arrives.
 */

import type { NextRequest } from 'next/server';
import { Output } from 'ai';

import { callLLM, streamLLM } from '@/lib/ai/llm';
import { resolveModelFromRequest, type ResolvedModel } from '@/lib/server/resolve-model';
import type { ThinkingConfig } from '@/lib/types/provider';
import type { StudioAgentRole } from './contracts';
import type { StudioTextModel } from './pipeline';

export class StudioModelUnavailableError extends Error {
  readonly code = 'MODEL_UNAVAILABLE';
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'StudioModelUnavailableError';
  }
}

const STUDIO_ROLE_OUTPUT_TOKENS: Record<StudioAgentRole, number> = {
  'studio.planner': 2_048,
  // A single-file app is the whole output; this has to fit a complete document.
  'studio.coder': 32_768,
  'studio.reviewer': 3_072,
};

export function studioModelTimeoutMs(): number {
  const configured = process.env.STUDIO_MODEL_TIMEOUT_MS;
  if (!configured) return 300_000;
  const value = Number(configured);
  if (!Number.isInteger(value) || value < 10_000 || value > 600_000) {
    throw new StudioModelUnavailableError(
      'STUDIO_MODEL_TIMEOUT_MS 必须是 10000 到 600000 之间的整数。',
    );
  }
  return value;
}

function isExplicitTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_TEST === 'true';
}

const TEST_DOCUMENT = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>测试应用</title>
    <style>
      :root { --bg:#0f1720; --surface:#16212c; --text:#eef4f8; --muted:#9fb3c0; --accent:#ffd479; --border:#26333f; }
      body { margin:0; background:var(--bg); color:var(--text); font-family:system-ui, sans-serif; padding:24px; }
      button { background:var(--accent); color:#1a1206; border:0; border-radius:10px; padding:12px 16px; font-weight:700; }
      button:focus-visible { outline:2px solid var(--text); outline-offset:2px; }
    </style>
  </head>
  <body>
    <h1 id="title">测试应用</h1>
    <button id="action" type="button">开始</button>
    <p id="status">未开始</p>
    <script>
      document.getElementById('action').addEventListener('click', function () {
        document.getElementById('status').textContent = '已开始';
      });
    </script>
  </body>
</html>`;

const TEST_PATCH = `<<<<<<< SEARCH
    <p id="status">未开始</p>
=======
    <p id="status">未开始</p>
    <p id="patched">已按要求修改</p>
>>>>>>> REPLACE`;

function testResponse(role: StudioAgentRole, prompt: string): string {
  if (role === 'studio.planner') {
    return JSON.stringify({
      appName: '测试应用',
      appKind: 'tool',
      summary: '用于自动化测试的最小应用。',
      changeNote: prompt.includes('修改') ? '按要求修改了测试应用。' : '生成了测试应用。',
      features: ['点击按钮切换状态'],
      layout: '单栏，标题在上、按钮在下。',
      interactions: ['点击开始'],
      persistence: 'none',
    });
  }
  if (role === 'studio.reviewer') return JSON.stringify({ verdict: 'pass', findings: [] });
  return prompt.includes('只输出编辑块') ? TEST_PATCH : TEST_DOCUMENT;
}

function createTestRoleModel(role: StudioAgentRole): StudioTextModel {
  return {
    route: { providerId: 'test', modelId: 'studio-test' },
    async complete(input) {
      const response = testResponse(role, input.prompt);
      if (input.onDelta) {
        for (const chunk of response.match(/[\s\S]{1,64}/g) ?? []) await input.onDelta(chunk);
      }
      return response;
    },
  };
}

type CallParams = {
  model: ResolvedModel['model'];
  system: string;
  prompt: string;
  maxOutputTokens: number;
  abortSignal: AbortSignal;
  output?: ReturnType<typeof Output.object>;
};

export interface StudioRoleModelDependencies {
  resolveModel(request: NextRequest, body: unknown, stage: StudioAgentRole): Promise<ResolvedModel>;
  callModel(
    params: CallParams,
    source: string,
    thinking: ThinkingConfig | undefined,
  ): Promise<{ text: string; output?: unknown }>;
  streamModel(
    params: CallParams,
    source: string,
    thinking: ThinkingConfig | undefined,
    onDelta?: (chunk: string) => void | Promise<void>,
  ): Promise<{ text: string }>;
}

const defaultDependencies: StudioRoleModelDependencies = {
  resolveModel: (request, body, stage) => resolveModelFromRequest(request, body, stage),
  callModel: (params, source, thinking) => callLLM(params, source, undefined, thinking),
  async streamModel(params, source, thinking, onDelta) {
    const result = streamLLM(params, source, thinking);
    for await (const chunk of result.textStream) await onDelta?.(chunk);
    return { text: await result.text };
  },
};

export async function resolveStudioRoleModel(
  request: NextRequest,
  body: unknown,
  role: StudioAgentRole,
  dependencies: StudioRoleModelDependencies = defaultDependencies,
): Promise<StudioTextModel> {
  if (process.env.STUDIO_TEST_MODEL === 'true') {
    if (!isExplicitTestEnvironment()) {
      throw new StudioModelUnavailableError(
        'STUDIO_TEST_MODEL 只能在测试或显式 Playwright 环境启用。',
      );
    }
    return createTestRoleModel(role);
  }

  let resolved: ResolvedModel;
  try {
    resolved = await dependencies.resolveModel(request, body, role);
  } catch (error) {
    throw new StudioModelUnavailableError(
      `角色 ${role} 没有可用模型。请配置 MODEL_ROUTES 或 DEFAULT_MODEL。`,
      error,
    );
  }

  return {
    route: { providerId: resolved.providerId, modelId: resolved.modelId },
    async complete(input) {
      // Structured roles disable reasoning so the provider is free to enforce the
      // schema; the coder is plain text and keeps whatever the route configured.
      const thinking =
        input.schema && !resolved.thinkingConfig
          ? {
              mode: 'disabled' as const,
              enabled: false,
              ...(resolved.providerId === 'openrouter'
                ? { requireStructuredOutputProvider: true }
                : {}),
            }
          : resolved.thinkingConfig;
      const params: CallParams = {
        model: resolved.model,
        system: input.system ?? '',
        prompt: input.prompt,
        maxOutputTokens: STUDIO_ROLE_OUTPUT_TOKENS[role],
        abortSignal: AbortSignal.timeout(studioModelTimeoutMs()),
        ...(input.schema ? { output: Output.object({ schema: input.schema }) } : {}),
      };
      if (input.onDelta && !input.schema) {
        const streamed = await dependencies.streamModel(params, role, thinking, input.onDelta);
        return streamed.text;
      }
      const result = await dependencies.callModel(params, role, thinking);
      return input.schema ? JSON.stringify(result.output) : result.text;
    },
  };
}
