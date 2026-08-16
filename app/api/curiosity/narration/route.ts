import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { DEFAULT_TTS_MODELS, DEFAULT_TTS_VOICES } from '@/lib/audio/constants';
import { generateTTS, type TTSGenerationResult } from '@/lib/audio/tts-providers';
import type { BuiltInTTSProviderId, TTSModelConfig } from '@/lib/audio/types';
import {
  getServerTTSProviders,
  isServerTTSProviderDisabled,
  resolveTTSApiKey,
  resolveTTSBaseUrl,
  resolveTTSModel,
} from '@/lib/server/provider-config';

export const maxDuration = 30;

const narrationRequestSchema = z.strictObject({
  text: z.string().trim().min(1).max(240),
});

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  opus: 'audio/opus',
  pcm: 'audio/pcm',
};

export function getCuriosityNarrationConfig(): TTSModelConfig {
  const selectedProvider = process.env.CURIOSITY_TTS_PROVIDER?.trim();
  if (selectedProvider === 'openrouter-tts') {
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) throw new Error('CURIOSITY_TTS_UNAVAILABLE');
    const configuredSpeed = Number(process.env.CURIOSITY_TTS_SPEED ?? '0.92');
    if (!Number.isFinite(configuredSpeed) || configuredSpeed < 0.5 || configuredSpeed > 2) {
      throw new Error('CURIOSITY_TTS_INVALID_SPEED');
    }
    return {
      providerId: 'openai-tts',
      modelId: process.env.CURIOSITY_TTS_MODEL?.trim(),
      voice: process.env.CURIOSITY_TTS_VOICE?.trim() || 'longanxiaoxin',
      speed: configuredSpeed,
      format: 'mp3',
      apiKey,
      baseUrl: (process.env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1').replace(
        /\/$/,
        '',
      ),
    };
  }
  const providerId = selectedProvider as BuiltInTTSProviderId | undefined;
  if (
    !providerId ||
    providerId === 'browser-native-tts' ||
    !Object.hasOwn(getServerTTSProviders(), providerId) ||
    isServerTTSProviderDisabled(providerId)
  ) {
    throw new Error('CURIOSITY_TTS_UNAVAILABLE');
  }
  const configuredSpeed = Number(process.env.CURIOSITY_TTS_SPEED ?? '0.92');
  if (!Number.isFinite(configuredSpeed) || configuredSpeed < 0.5 || configuredSpeed > 2) {
    throw new Error('CURIOSITY_TTS_INVALID_SPEED');
  }
  return {
    providerId,
    modelId: resolveTTSModel(providerId, DEFAULT_TTS_MODELS[providerId]),
    voice: process.env.CURIOSITY_TTS_VOICE?.trim() || DEFAULT_TTS_VOICES[providerId],
    speed: configuredSpeed,
    apiKey: resolveTTSApiKey(providerId),
    baseUrl: resolveTTSBaseUrl(providerId),
  };
}

export function createCuriosityNarrationPostHandler(dependencies: {
  getConfig: () => TTSModelConfig;
  generate: (config: TTSModelConfig, text: string) => Promise<TTSGenerationResult>;
}) {
  return async function POST(request: NextRequest): Promise<NextResponse> {
    try {
      const { text } = narrationRequestSchema.parse(await request.json());
      const result = await dependencies.generate(dependencies.getConfig(), text);
      return new NextResponse(Buffer.from(result.audio), {
        status: 200,
        headers: {
          'content-type': CONTENT_TYPES[result.format] ?? 'application/octet-stream',
          'cache-control': 'private, no-store',
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { success: false, errorCode: 'INVALID_REQUEST', error: '旁白请求不符合严格 Schema。' },
          { status: 400 },
        );
      }
      if (error instanceof Error && error.message.startsWith('CURIOSITY_TTS_')) {
        return NextResponse.json(
          { success: false, errorCode: 'TTS_UNAVAILABLE', error: '语音旁白服务尚未配置。' },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { success: false, errorCode: 'TTS_FAILED', error: '语音旁白生成失败，请重试。' },
        { status: 502 },
      );
    }
  };
}

const post = createCuriosityNarrationPostHandler({
  getConfig: getCuriosityNarrationConfig,
  generate: generateTTS,
});

export async function POST(...args: Parameters<typeof post>) {
  return post(...args);
}
