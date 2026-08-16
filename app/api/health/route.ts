import { apiSuccess } from '@/lib/server/api-response';
import {
  getServerWebSearchProviders,
  getServerImageProviders,
  getServerVideoProviders,
  getServerTTSProviders,
} from '@/lib/server/provider-config';

const version = process.env.npm_package_version || '0.1.0';

function hasConfiguredTts(): boolean {
  if (
    process.env.CURIOSITY_TTS_PROVIDER?.trim() === 'openrouter-tts' &&
    Boolean(process.env.OPENROUTER_API_KEY?.trim())
  ) {
    return true;
  }
  return Object.values(getServerTTSProviders()).some((info) => !info.disabled);
}

export async function GET() {
  return apiSuccess({
    status: 'ok',
    version,
    capabilities: {
      webSearch: Object.keys(getServerWebSearchProviders()).length > 0,
      imageGeneration: Object.keys(getServerImageProviders()).length > 0,
      videoGeneration: Object.keys(getServerVideoProviders()).length > 0,
      tts: hasConfiguredTts(),
    },
  });
}
