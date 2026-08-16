import { NextResponse, type NextRequest } from 'next/server';

import { ASR_PROVIDERS } from '@/lib/audio/constants';
import { transcribeAudio, type ASRTranscriptionResult } from '@/lib/audio/asr-providers';
import type { ASRModelConfig, ASRProviderId } from '@/lib/audio/types';
import {
  getServerASRProviders,
  resolveASRApiKey,
  resolveASRBaseUrl,
} from '@/lib/server/provider-config';

export const maxDuration = 60;

const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

export function getCuriosityTranscriptionConfig(): ASRModelConfig {
  const providerId = process.env.CURIOSITY_ASR_PROVIDER?.trim() as ASRProviderId | undefined;
  if (providerId === 'openrouter-asr') {
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) throw new Error('CURIOSITY_ASR_UNAVAILABLE');
    return {
      providerId,
      modelId: process.env.CURIOSITY_ASR_MODEL?.trim() || 'qwen/qwen3-asr-1.7b',
      language: process.env.CURIOSITY_ASR_LANGUAGE?.trim() || 'zh',
      apiKey,
      baseUrl: (process.env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1').replace(
        /\/$/,
        '',
      ),
    };
  }
  if (
    !providerId ||
    providerId === 'browser-native' ||
    !Object.hasOwn(getServerASRProviders(), providerId)
  ) {
    throw new Error('CURIOSITY_ASR_UNAVAILABLE');
  }
  const provider = ASR_PROVIDERS[providerId as keyof typeof ASR_PROVIDERS];
  return {
    providerId,
    modelId: process.env.CURIOSITY_ASR_MODEL?.trim() || provider?.defaultModelId,
    language: process.env.CURIOSITY_ASR_LANGUAGE?.trim() || 'zh',
    apiKey: resolveASRApiKey(providerId),
    baseUrl: resolveASRBaseUrl(providerId),
  };
}

export function createCuriosityTranscriptionPostHandler(dependencies: {
  getConfig: () => ASRModelConfig;
  transcribe: (config: ASRModelConfig, audio: Buffer | Blob) => Promise<ASRTranscriptionResult>;
}) {
  return async function POST(request: NextRequest): Promise<NextResponse> {
    try {
      const form = await request.formData();
      if ([...form.keys()].some((key) => key !== 'audio')) {
        return NextResponse.json(
          { success: false, errorCode: 'INVALID_REQUEST', error: '语音请求包含未知字段。' },
          { status: 400 },
        );
      }
      const audio = form.get('audio');
      if (!(audio instanceof File) || audio.size === 0 || audio.size > MAX_AUDIO_BYTES) {
        return NextResponse.json(
          { success: false, errorCode: 'INVALID_AUDIO', error: '请提交一段不超过 5MB 的录音。' },
          { status: 400 },
        );
      }
      const result = await dependencies.transcribe(dependencies.getConfig(), audio);
      const transcript = result.text.trim();
      if (!transcript) {
        return NextResponse.json(
          { success: false, errorCode: 'ASR_UNCLEAR', error: '没有听清，请再说一次。' },
          { status: 422 },
        );
      }
      return NextResponse.json({ success: true, transcript });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('CURIOSITY_ASR_')) {
        return NextResponse.json(
          { success: false, errorCode: 'ASR_UNAVAILABLE', error: '语音识别服务尚未配置。' },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { success: false, errorCode: 'ASR_FAILED', error: '语音识别失败，请重试。' },
        { status: 502 },
      );
    }
  };
}

const post = createCuriosityTranscriptionPostHandler({
  getConfig: getCuriosityTranscriptionConfig,
  transcribe: transcribeAudio,
});

export async function POST(...args: Parameters<typeof post>) {
  return post(...args);
}
