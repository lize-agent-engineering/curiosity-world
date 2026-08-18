import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { studioPlannerOutputSchema, studioReviewSchema } from '@/lib/studio/contracts';
import { parseStudioEditBlocks, applyStudioEditBlocks } from '@/lib/studio/edit-blocks';
import {
  resolveStudioRoleModel,
  StudioModelUnavailableError,
  studioModelTimeoutMs,
} from '@/lib/studio/server-model';
import { extractStudioHtmlDocument, validateStudioHtml } from '@/lib/studio/validate';

const request = new NextRequest('http://studio.local/internal');

afterEach(() => {
  delete process.env.STUDIO_TEST_MODEL;
  delete process.env.STUDIO_MODEL_TIMEOUT_MS;
  vi.unstubAllEnvs();
});

describe('the test model guard', () => {
  it('refuses to serve canned output outside an explicit test environment', async () => {
    process.env.STUDIO_TEST_MODEL = 'true';
    vi.stubEnv('NODE_ENV', 'production');
    await expect(resolveStudioRoleModel(request, {}, 'studio.planner')).rejects.toBeInstanceOf(
      StudioModelUnavailableError,
    );
  });

  it('serves a plan that satisfies the planner contract', async () => {
    process.env.STUDIO_TEST_MODEL = 'true';
    const model = await resolveStudioRoleModel(request, {}, 'studio.planner');
    const plan = studioPlannerOutputSchema.parse(
      JSON.parse(await model.complete({ prompt: '做个应用' })),
    );
    expect(plan.features.length).toBeGreaterThan(0);
  });

  it('serves a valid document for a create round', async () => {
    process.env.STUDIO_TEST_MODEL = 'true';
    const model = await resolveStudioRoleModel(request, {}, 'studio.coder');
    const html = extractStudioHtmlDocument(
      await model.complete({ prompt: '现在输出完整的 HTML 文档。' }),
    );
    expect(validateStudioHtml(html).errors).toEqual([]);
  });

  it('serves edit blocks that apply to its own document for a patch round', async () => {
    process.env.STUDIO_TEST_MODEL = 'true';
    const model = await resolveStudioRoleModel(request, {}, 'studio.coder');
    const html = extractStudioHtmlDocument(
      await model.complete({ prompt: '创建：现在输出完整的 HTML 文档。' }),
    );
    const patch = await model.complete({ prompt: '【修改方式：只输出编辑块，不要重发整份文件】' });
    const next = applyStudioEditBlocks(html, parseStudioEditBlocks(patch));
    expect(next).not.toBe(html);
    expect(validateStudioHtml(next).errors).toEqual([]);
  });

  it('streams its output through onDelta so the UI path is exercised in tests', async () => {
    process.env.STUDIO_TEST_MODEL = 'true';
    const model = await resolveStudioRoleModel(request, {}, 'studio.coder');
    const chunks: string[] = [];
    const text = await model.complete({
      prompt: '现在输出完整的 HTML 文档。',
      onDelta: (chunk) => {
        chunks.push(chunk);
      },
    });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe(text);
  });

  it('serves a passing review', async () => {
    process.env.STUDIO_TEST_MODEL = 'true';
    const model = await resolveStudioRoleModel(request, {}, 'studio.reviewer');
    expect(
      studioReviewSchema.parse(JSON.parse(await model.complete({ prompt: '审查' }))).verdict,
    ).toBe('pass');
  });
});

describe('resolving real models', () => {
  it('routes each role through its own stage', async () => {
    const seen: string[] = [];
    const model = await resolveStudioRoleModel(request, {}, 'studio.coder', {
      resolveModel: async (_request, _body, stage) => {
        seen.push(String(stage));
        return {
          model: 'stub' as never,
          modelInfo: null,
          modelString: 'openrouter:test',
          providerId: 'openrouter',
          modelId: 'test',
          apiKey: 'k',
        };
      },
      callModel: async () => ({ text: '<html></html>' }),
      streamModel: async () => ({ text: '<html></html>' }),
    });
    expect(seen).toEqual(['studio.coder']);
    expect(model.route).toEqual({ providerId: 'openrouter', modelId: 'test' });
  });

  it('reports an unavailable model as a studio error rather than a raw failure', async () => {
    await expect(
      resolveStudioRoleModel(request, {}, 'studio.planner', {
        resolveModel: async () => {
          throw new Error('no model');
        },
        callModel: async () => ({ text: '' }),
        streamModel: async () => ({ text: '' }),
      }),
    ).rejects.toBeInstanceOf(StudioModelUnavailableError);
  });

  it('streams when the caller wants deltas and falls back to a single call otherwise', async () => {
    const used: string[] = [];
    const model = await resolveStudioRoleModel(request, {}, 'studio.coder', {
      resolveModel: async () => ({
        model: 'stub' as never,
        modelInfo: null,
        modelString: 'openrouter:test',
        providerId: 'openrouter',
        modelId: 'test',
        apiKey: 'k',
      }),
      callModel: async () => {
        used.push('call');
        return { text: 'a' };
      },
      streamModel: async (_params, _source, _thinking, onDelta) => {
        used.push('stream');
        await onDelta?.('a');
        return { text: 'a' };
      },
    });
    await model.complete({ prompt: 'x' });
    await model.complete({ prompt: 'x', onDelta: () => {} });
    expect(used).toEqual(['call', 'stream']);
  });
});

describe('studioModelTimeoutMs', () => {
  it('defaults to five minutes', () => {
    expect(studioModelTimeoutMs()).toBe(300_000);
  });

  it('rejects a value outside the supported range', () => {
    process.env.STUDIO_MODEL_TIMEOUT_MS = '5';
    expect(() => studioModelTimeoutMs()).toThrow(StudioModelUnavailableError);
  });

  it('accepts a longer budget for slow coding models', () => {
    process.env.STUDIO_MODEL_TIMEOUT_MS = '600000';
    expect(studioModelTimeoutMs()).toBe(600_000);
  });
});
