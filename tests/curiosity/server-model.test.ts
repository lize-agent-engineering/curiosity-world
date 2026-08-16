import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { resolveCuriosityRoleModel } from '@/lib/curiosity/server-model';
import type { ResolvedModel } from '@/lib/server/resolve-model';
import {
  runCuriosityAgentPipeline,
  type CuriosityPipelineModels,
} from '@/lib/curiosity/agent-pipeline';
import { createCuriosityRevisionCandidateV2 } from '@/lib/curiosity/revision-pipeline';
import { createValidCuriosityExperienceSpecV2, createValidCuriositySpec } from './fixture';

function request(): Parameters<typeof resolveCuriosityRoleModel>[0] {
  return new Request('http://localhost/api/curiosity/generations', {
    headers: { 'x-model': 'openai:gpt-default' },
  }) as Parameters<typeof resolveCuriosityRoleModel>[0];
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('explicit Curiosity test model', () => {
  it('provides a bounded runtime exploration-guide response', async () => {
    vi.stubEnv('CURIOSITY_TEST_MODEL', 'true');
    vi.stubEnv('NODE_ENV', 'test');
    const guide = await resolveCuriosityRoleModel(
      request(),
      {
        request: {
          stageId: 'predict',
          recentEventIds: ['evt_prediction_1'],
        },
        story: { stages: [{ id: 'predict' }, { id: 'explore' }] },
      },
      'curiosity.exploration-guide',
    );
    await expect(guide.complete({ system: 'bounded', prompt: '{}' })).resolves.toContain(
      '"advanceTo":"explore"',
    );
  });

  it('provides strict outputs for the complete initial-generation role pipeline', async () => {
    vi.stubEnv('CURIOSITY_TEST_MODEL', 'true');
    vi.stubEnv('NODE_ENV', 'test');
    const roles = [
      'curiosity.question-modeler',
      'curiosity.knowledge-designer',
      'curiosity.interaction-designer',
      'curiosity.story-designer',
      'curiosity.quality-reviewer',
    ] as const;
    const entries = await Promise.all(
      roles.map(
        async (role) => [role, await resolveCuriosityRoleModel(request(), {}, role)] as const,
      ),
    );

    const result = await runCuriosityAgentPipeline(
      { question: '为什么月亮看起来会跟着我们？', age: 8, interests: ['散步'] },
      Object.fromEntries(entries) as CuriosityPipelineModels,
      {
        runId: 'run_test_pipeline',
        experienceId: 'cur_test_pipeline',
        versionId: 'ver_test_pipeline',
        createdAt: '2026-08-15T03:00:00.000Z',
        artifactIds: {
          question: 'art_test_question',
          knowledge: 'art_test_knowledge',
          interaction: 'art_test_interaction',
          story: 'art_test_story',
          spec: 'art_test_spec',
          quality: 'art_test_quality',
        },
        agentRunIds: {
          question: 'agent_run_test_question',
          knowledge: 'agent_run_test_knowledge',
          interaction: 'agent_run_test_interaction',
          story: 'agent_run_test_story',
          quality: 'agent_run_test_quality',
        },
      },
    );

    expect(result.spec.schemaVersion).toBe('2.0');
    expect(result.artifacts).toHaveLength(6);
  });

  it('translates only recognized test revision intents into allow-listed operations', async () => {
    vi.stubEnv('CURIOSITY_TEST_MODEL', 'true');
    vi.stubEnv('NODE_ENV', 'test');
    const base = createValidCuriositySpec();
    const instruction = '改成适合 10 岁，并增加一个桌上远近物体实验';
    const body = {
      baseSpec: base,
      experienceSpec: createValidCuriosityExperienceSpecV2(),
      sourceArtifacts: [createValidCuriosityExperienceSpecV2()],
      instruction,
    };
    const planner = await resolveCuriosityRoleModel(request(), body, 'curiosity.revision-planner');
    const quality = await resolveCuriosityRoleModel(request(), body, 'curiosity.quality-reviewer');
    const result = await createCuriosityRevisionCandidateV2(
      { ...body, runtimeSpec: base },
      { planner, quality },
      {
        runId: 'run_demo_revision',
        versionId: 'ver_demo_revision',
        createdAt: '2026-08-15T03:05:00.000Z',
        impactArtifactId: 'art_demo_impact',
        patchArtifactId: 'art_demo_patch',
        specArtifactId: 'art_demo_spec',
        qualityArtifactId: 'art_demo_quality',
        plannerAgentRunId: 'agent_run_demo_planner',
        qualityAgentRunId: 'agent_run_demo_quality',
      },
    );
    expect(result.runtimeSpec.profile.age).toBe(10);
    expect(result.spec.observationSuggestions[0]).toContain('桌上');

    const invalidInstruction = '给我加入任意网页代码';
    const invalidBody = { ...body, instruction: invalidInstruction };
    const invalidModel = await resolveCuriosityRoleModel(
      request(),
      invalidBody,
      'curiosity.revision-planner',
    );
    await expect(
      createCuriosityRevisionCandidateV2(
        { ...invalidBody, runtimeSpec: base },
        { planner: invalidModel, quality },
        {
          runId: 'run_demo_invalid',
          versionId: 'ver_demo_invalid',
          createdAt: '2026-08-15T03:06:00.000Z',
          impactArtifactId: 'art_invalid_impact',
          patchArtifactId: 'art_invalid_patch',
          specArtifactId: 'art_invalid_spec',
          qualityArtifactId: 'art_invalid_quality',
          plannerAgentRunId: 'agent_run_invalid_planner',
          qualityAgentRunId: 'agent_run_invalid_quality',
        },
      ),
    ).rejects.toMatchObject({ code: 'REVISION_IMPACT_INVALID' });
  });

  it('rejects the test model outside Vitest or an explicit Playwright server', async () => {
    vi.stubEnv('CURIOSITY_TEST_MODEL', 'true');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PLAYWRIGHT_TEST', 'false');
    const resolveModel = vi.fn();

    await expect(
      resolveCuriosityRoleModel(request(), {}, 'curiosity.question-modeler', {
        resolveModel,
        callModel: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
    expect(resolveModel).not.toHaveBeenCalled();
  });

  it('fails with MODEL_UNAVAILABLE and never tries another route', async () => {
    vi.stubEnv('CURIOSITY_TEST_MODEL', 'false');
    const resolveModel = vi.fn(async () => {
      throw new Error('configured route is unavailable');
    });

    await expect(
      resolveCuriosityRoleModel(request(), {}, 'curiosity.question-modeler', {
        resolveModel,
        callModel: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
    expect(resolveModel).toHaveBeenCalledTimes(1);
  });

  it('uses the exact role for model resolution and LLM telemetry', async () => {
    vi.stubEnv('CURIOSITY_TEST_MODEL', 'false');
    const resolved = {
      model: {} as ResolvedModel['model'],
      modelInfo: { id: 'gpt-role', name: 'Role Model', outputWindow: 2048 },
      modelString: 'openai:gpt-role',
      providerId: 'openai',
      modelId: 'gpt-role',
      apiKey: 'test-key',
      thinkingConfig: { effort: 'medium' as const },
    } satisfies ResolvedModel;
    const resolveModel = vi.fn(async () => resolved);
    let telemetrySource = '';
    const callModel = vi.fn(async (_params: unknown, source: string) => {
      telemetrySource = source;
      return { text: '{"ok":true}' };
    });
    const model = await resolveCuriosityRoleModel(request(), {}, 'curiosity.knowledge-designer', {
      resolveModel,
      callModel,
    });

    await expect(model.complete({ system: 'system', prompt: 'prompt' })).resolves.toBe(
      '{"ok":true}',
    );
    expect(resolveModel).toHaveBeenCalledWith(
      expect.anything(),
      {},
      'curiosity.knowledge-designer',
    );
    expect(telemetrySource).toBe('curiosity.knowledge-designer');
  });

  it('uses provider-native structured output when the role supplies a schema', async () => {
    vi.stubEnv('CURIOSITY_TEST_MODEL', 'false');
    const resolved = {
      model: {} as ResolvedModel['model'],
      modelInfo: { id: 'glm-role', name: 'Role Model', outputWindow: 16384 },
      modelString: 'glm:glm-role',
      providerId: 'glm',
      modelId: 'glm-role',
      apiKey: 'test-key',
    } satisfies ResolvedModel;
    const callModel = vi.fn(
      async (_params: unknown, _source?: string, _retry?: unknown, _thinking?: unknown) => ({
        text: 'not free-form text',
        output: { answer: 'structured' },
      }),
    );
    const model = await resolveCuriosityRoleModel(request(), {}, 'curiosity.interaction-designer', {
      resolveModel: vi.fn(async () => resolved),
      callModel,
    });

    await expect(
      model.complete({
        system: 'system',
        prompt: 'prompt',
        schema: z.strictObject({ answer: z.string() }),
      }),
    ).resolves.toBe('{"answer":"structured"}');
    expect(callModel.mock.calls[0]?.[0]).toMatchObject({ output: expect.anything() });
    expect(callModel.mock.calls[0]?.[0]).toMatchObject({ maxOutputTokens: 8192 });
    expect(
      (callModel.mock.calls[0]?.[0] as { abortSignal?: unknown } | undefined)?.abortSignal,
    ).toBeInstanceOf(AbortSignal);
    expect(callModel.mock.calls[0]?.[3]).toEqual({ mode: 'disabled', enabled: false });
  });

  it.each([
    ['curiosity.question-modeler', 1536],
    ['curiosity.knowledge-designer', 3072],
    ['curiosity.interaction-designer', 8192],
    ['curiosity.story-designer', 8192],
    ['curiosity.quality-reviewer', 4096],
    ['curiosity.exploration-guide', 1024],
    ['curiosity.revision-planner', 3072],
  ] as const)('caps %s output at %i tokens', async (role, expectedMaxOutputTokens) => {
    vi.stubEnv('CURIOSITY_TEST_MODEL', 'false');
    const callModel = vi.fn(async () => ({ text: '{}', output: {} }));
    const model = await resolveCuriosityRoleModel(request(), {}, role, {
      resolveModel: vi.fn(async () => ({
        model: {} as ResolvedModel['model'],
        modelInfo: { id: 'role-model', name: 'Role Model', outputWindow: 16384 },
        modelString: 'openrouter:role-model',
        providerId: 'openrouter',
        modelId: 'role-model',
        apiKey: 'test-key',
      })),
      callModel,
    });

    await model.complete({ system: 'system', prompt: 'prompt' });

    const firstCall = callModel.mock.calls[0] as unknown as [{ maxOutputTokens: number }];
    expect(firstCall[0]).toMatchObject({
      maxOutputTokens: expectedMaxOutputTokens,
    });
  });

  it('fast-fails the first provider structured-output failure', async () => {
    vi.stubEnv('CURIOSITY_TEST_MODEL', 'false');
    const structuredFailure = Object.assign(new Error('provider returned invalid JSON'), {
      name: 'AI_NoObjectGeneratedError',
    });
    const callModel = vi.fn().mockRejectedValue(structuredFailure);
    const model = await resolveCuriosityRoleModel(request(), {}, 'curiosity.question-modeler', {
      resolveModel: vi.fn(async () => ({
        model: {} as ResolvedModel['model'],
        modelInfo: { id: 'glm-role', name: 'Role Model', outputWindow: 16384 },
        modelString: 'glm:glm-role',
        providerId: 'glm',
        modelId: 'glm-role',
        apiKey: 'test-key',
      })),
      callModel,
    });

    await expect(
      model.complete({
        system: 'system',
        prompt: 'prompt',
        schema: z.strictObject({ answer: z.string() }),
      }),
    ).rejects.toThrow('provider returned invalid JSON');
    expect(callModel).toHaveBeenCalledTimes(1);
  });

  it('requires a structured-output-compatible OpenRouter provider for schema roles', async () => {
    vi.stubEnv('CURIOSITY_TEST_MODEL', 'false');
    const callModel = vi.fn(async () => ({ text: '{}', output: { answer: 'structured' } }));
    const model = await resolveCuriosityRoleModel(request(), {}, 'curiosity.interaction-designer', {
      resolveModel: vi.fn(async () => ({
        model: {} as ResolvedModel['model'],
        modelInfo: { id: 'glm-5.2', name: 'GLM 5.2', outputWindow: 16384 },
        modelString: 'openrouter:z-ai/glm-5.2',
        providerId: 'openrouter',
        modelId: 'z-ai/glm-5.2',
        apiKey: 'test-key',
      })),
      callModel,
    });

    await model.complete({
      system: 'system',
      prompt: 'prompt',
      schema: z.strictObject({ answer: z.string() }),
    });

    const firstCall = callModel.mock.calls[0] as unknown as [unknown, unknown, unknown, unknown];
    expect(firstCall[3]).toEqual({
      mode: 'disabled',
      enabled: false,
      requireStructuredOutputProvider: true,
    });
  });

  it('does not retry unrelated model failures', async () => {
    vi.stubEnv('CURIOSITY_TEST_MODEL', 'false');
    const callModel = vi.fn().mockRejectedValue(new Error('authentication failed'));
    const model = await resolveCuriosityRoleModel(request(), {}, 'curiosity.question-modeler', {
      resolveModel: vi.fn(async () => ({
        model: {} as ResolvedModel['model'],
        modelInfo: { id: 'glm-role', name: 'Role Model', outputWindow: 16384 },
        modelString: 'glm:glm-role',
        providerId: 'glm',
        modelId: 'glm-role',
        apiKey: 'test-key',
      })),
      callModel,
    });

    await expect(
      model.complete({
        system: 'system',
        prompt: 'prompt',
        schema: z.strictObject({ answer: z.string() }),
      }),
    ).rejects.toThrow('authentication failed');
    expect(callModel).toHaveBeenCalledTimes(1);
  });
});
