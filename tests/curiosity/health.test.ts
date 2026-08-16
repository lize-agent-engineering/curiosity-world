import { afterEach, describe, expect, it } from 'vitest';

import { GET } from '@/app/api/health/route';

const originalProvider = process.env.CURIOSITY_TTS_PROVIDER;
const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;

afterEach(() => {
  if (originalProvider === undefined) delete process.env.CURIOSITY_TTS_PROVIDER;
  else process.env.CURIOSITY_TTS_PROVIDER = originalProvider;
  if (originalOpenRouterKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
});

describe('Curiosity health capabilities', () => {
  it('reports the configured OpenRouter narration route as TTS capable', async () => {
    process.env.CURIOSITY_TTS_PROVIDER = 'openrouter-tts';
    process.env.OPENROUTER_API_KEY = 'test-key';

    const response = await GET();
    const body = await response.json();

    expect(body.capabilities.tts).toBe(true);
  });
});
