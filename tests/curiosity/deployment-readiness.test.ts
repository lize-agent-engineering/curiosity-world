import { describe, expect, it } from 'vitest';

import {
  assessCuriosityDeploymentReadiness,
  probeExpectedHttpStatus,
} from '@/lib/curiosity/deployment-readiness';

describe('Curiosity deployment readiness', () => {
  it('accepts an endpoint that becomes healthy during the bounded startup window', () => {
    const statuses = [404, undefined, 200];

    expect(probeExpectedHttpStatus(() => statuses.shift(), 200, 5)).toBe(true);
    expect(statuses).toEqual([]);
  });

  it('fails after the bounded startup window is exhausted', () => {
    expect(probeExpectedHttpStatus(() => 404, 200, 3)).toBe(false);
  });

  it('fails fast with every missing public-deployment capability', () => {
    expect(
      assessCuriosityDeploymentReadiness({
        environment: {},
        gitClean: false,
        dockerRunning: false,
        publicUrl: undefined,
        publicHealthOk: false,
        legacyRoutesBlocked: false,
        publicUrlStable: false,
      }),
    ).toEqual({
      ready: false,
      issues: [
        'WORKTREE_DIRTY',
        'DOCKER_CONTAINER_NOT_RUNNING',
        'PUBLIC_HTTPS_UNCONFIGURED',
        'PUBLIC_HEALTH_UNREACHABLE',
        'LEGACY_SURFACE_EXPOSED',
        'PUBLIC_URL_NOT_STABLE',
        'PUBLIC_MODE_DISABLED',
        'TEXT_MODEL_UNCONFIGURED',
        'PROVIDER_CREDENTIAL_UNCONFIGURED',
        'TTS_UNCONFIGURED',
        'ASR_UNCONFIGURED',
      ],
    });
  });

  it('accepts a clean Docker deployment with a stable HTTPS endpoint and managed voice', () => {
    expect(
      assessCuriosityDeploymentReadiness({
        environment: {
          DEFAULT_MODEL: 'openrouter:z-ai/glm-5.2',
          OPENROUTER_API_KEY: 'server-secret',
          CURIOSITY_TTS_PROVIDER: 'openrouter-tts',
          CURIOSITY_TTS_MODEL: 'qwen/qwen-audio-3.0-tts-flash',
          CURIOSITY_ASR_PROVIDER: 'openrouter-asr',
          CURIOSITY_ASR_MODEL: 'qwen/qwen3-asr-1.7b',
          CURIOSITY_PUBLIC_MODE: '1',
        },
        gitClean: true,
        dockerRunning: true,
        publicUrl: 'https://curiosity.example.com',
        publicHealthOk: true,
        legacyRoutesBlocked: true,
        publicUrlStable: true,
      }),
    ).toEqual({ ready: true, issues: [] });
  });

  it('requires every Curiosity role when MODEL_ROUTES replaces DEFAULT_MODEL', () => {
    expect(
      assessCuriosityDeploymentReadiness({
        environment: {
          MODEL_ROUTES: JSON.stringify({
            'curiosity.question-modeler': 'openai:gpt-5.5',
          }),
          OPENROUTER_API_KEY: 'server-secret',
          CURIOSITY_TTS_PROVIDER: 'openrouter-tts',
          CURIOSITY_TTS_MODEL: 'qwen/qwen-audio-3.0-tts-flash',
          CURIOSITY_ASR_PROVIDER: 'openrouter-asr',
          CURIOSITY_ASR_MODEL: 'qwen/qwen3-asr-1.7b',
          CURIOSITY_PUBLIC_MODE: '1',
        },
        gitClean: true,
        dockerRunning: true,
        publicUrl: 'https://curiosity.example.com',
        publicHealthOk: true,
        legacyRoutesBlocked: true,
        publicUrlStable: true,
      }).issues,
    ).toContain('TEXT_MODEL_ROUTES_INCOMPLETE');
  });
});
