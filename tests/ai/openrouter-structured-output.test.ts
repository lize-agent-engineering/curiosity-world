import { describe, expect, it } from 'vitest';

import { requireOpenRouterStructuredOutputProvider } from '@/lib/ai/providers';

describe('OpenRouter structured output routing', () => {
  it('requires a provider compatible with every schema request parameter', () => {
    const body: Record<string, unknown> = {
      provider: { order: ['existing-provider'] },
      response_format: { type: 'json_schema' },
    };

    requireOpenRouterStructuredOutputProvider(body);

    expect(body).toEqual({
      provider: { order: ['existing-provider'], require_parameters: true },
      response_format: { type: 'json_schema' },
    });
  });
});
