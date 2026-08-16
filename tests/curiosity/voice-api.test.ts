import { describe, expect, it, vi } from 'vitest';

import {
  createCuriosityNarrationPostHandler,
  getCuriosityNarrationConfig,
} from '@/app/api/curiosity/narration/route';

describe('Curiosity managed narration API', () => {
  it('maps the single OpenRouter key to its OpenAI-compatible speech endpoint', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'openrouter-secret');
    vi.stubEnv('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1');
    vi.stubEnv('CURIOSITY_TTS_PROVIDER', 'openrouter-tts');
    vi.stubEnv('CURIOSITY_TTS_MODEL', 'qwen/qwen-audio-3.0-tts-flash');
    vi.stubEnv('CURIOSITY_TTS_VOICE', 'longanxiaoxin');

    expect(getCuriosityNarrationConfig()).toMatchObject({
      providerId: 'openai-tts',
      modelId: 'qwen/qwen-audio-3.0-tts-flash',
      voice: 'longanxiaoxin',
      apiKey: 'openrouter-secret',
      baseUrl: 'https://openrouter.ai/api/v1',
    });
    vi.unstubAllEnvs();
  });
  it('returns playable audio using only the server-owned voice configuration', async () => {
    const generate = vi.fn(async () => ({
      audio: new Uint8Array([73, 68, 51]),
      format: 'mp3',
    }));
    const post = createCuriosityNarrationPostHandler({
      getConfig: () => ({
        providerId: 'openai-tts',
        modelId: 'gpt-4o-mini-tts',
        voice: 'coral',
        speed: 0.92,
        apiKey: 'server-secret',
      }),
      generate,
    });

    const response = await post(
      new Request('http://localhost/api/curiosity/narration', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: '移动小朋友，看看月亮。' }),
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/mpeg');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([73, 68, 51]));
    expect(generate).toHaveBeenCalledWith(
      {
        providerId: 'openai-tts',
        modelId: 'gpt-4o-mini-tts',
        voice: 'coral',
        speed: 0.92,
        apiKey: 'server-secret',
      },
      '移动小朋友，看看月亮。',
    );
  });

  it('fails fast when the deployment has no managed narration provider', async () => {
    const post = createCuriosityNarrationPostHandler({
      getConfig: () => {
        throw new Error('CURIOSITY_TTS_UNAVAILABLE');
      },
      generate: vi.fn(),
    });

    const response = await post(
      new Request('http://localhost/api/curiosity/narration', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: '开始探索。' }),
      }) as never,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      success: false,
      errorCode: 'TTS_UNAVAILABLE',
      error: '语音旁白服务尚未配置。',
    });
  });

  it('rejects client-selected providers and secrets', async () => {
    const post = createCuriosityNarrationPostHandler({
      getConfig: vi.fn(),
      generate: vi.fn(),
    });
    const response = await post(
      new Request('http://localhost/api/curiosity/narration', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: '开始探索。',
          providerId: 'attacker-provider',
          apiKey: 'visitor-secret',
        }),
      }) as never,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      errorCode: 'INVALID_REQUEST',
    });
  });
});
