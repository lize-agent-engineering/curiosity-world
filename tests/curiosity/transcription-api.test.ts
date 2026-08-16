import { describe, expect, it, vi } from 'vitest';

import {
  createCuriosityTranscriptionPostHandler,
  getCuriosityTranscriptionConfig,
} from '@/app/api/curiosity/transcribe/route';

function audioRequest(extra?: Record<string, string>) {
  const form = new FormData();
  form.set('audio', new File(['voice'], 'answer.webm', { type: 'audio/webm' }));
  for (const [key, value] of Object.entries(extra ?? {})) form.set(key, value);
  return new Request('http://localhost/api/curiosity/transcribe', { method: 'POST', body: form });
}

describe('Curiosity managed transcription API', () => {
  it('uses the single OpenRouter key for the configured domestic ASR model', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'openrouter-secret');
    vi.stubEnv('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1');
    vi.stubEnv('CURIOSITY_ASR_PROVIDER', 'openrouter-asr');
    vi.stubEnv('CURIOSITY_ASR_MODEL', 'qwen/qwen3-asr-1.7b');

    expect(getCuriosityTranscriptionConfig()).toMatchObject({
      providerId: 'openrouter-asr',
      modelId: 'qwen/qwen3-asr-1.7b',
      apiKey: 'openrouter-secret',
      baseUrl: 'https://openrouter.ai/api/v1',
    });
    vi.unstubAllEnvs();
  });
  it('transcribes short child audio with the server-owned ASR configuration', async () => {
    const transcribe = vi.fn(async () => ({ text: '我觉得路灯变化更快' }));
    const config = {
      providerId: 'openai-whisper' as const,
      modelId: 'gpt-4o-mini-transcribe',
      language: 'zh',
      apiKey: 'server-secret',
    };
    const post = createCuriosityTranscriptionPostHandler({
      getConfig: () => config,
      transcribe,
    });

    const response = await post(audioRequest() as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      transcript: '我觉得路灯变化更快',
    });
    expect(transcribe).toHaveBeenCalledWith(config, expect.any(File));
  });

  it('fails explicitly when speech is empty or unclear', async () => {
    const post = createCuriosityTranscriptionPostHandler({
      getConfig: () => ({ providerId: 'openai-whisper', voice: 'unused' }) as never,
      transcribe: async () => ({ text: '   ' }),
    });

    const response = await post(audioRequest() as never);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      errorCode: 'ASR_UNCLEAR',
    });
  });

  it('rejects visitor provider selection instead of accepting client secrets', async () => {
    const getConfig = vi.fn();
    const post = createCuriosityTranscriptionPostHandler({ getConfig, transcribe: vi.fn() });

    const response = await post(
      audioRequest({ providerId: 'visitor-provider', apiKey: 'visitor-secret' }) as never,
    );

    expect(response.status).toBe(400);
    expect(getConfig).not.toHaveBeenCalled();
  });

  it('fails fast when managed ASR is not configured', async () => {
    const post = createCuriosityTranscriptionPostHandler({
      getConfig: () => {
        throw new Error('CURIOSITY_ASR_UNAVAILABLE');
      },
      transcribe: vi.fn(),
    });

    const response = await post(audioRequest() as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      errorCode: 'ASR_UNAVAILABLE',
    });
  });
});
