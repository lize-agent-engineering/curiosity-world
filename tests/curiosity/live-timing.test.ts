import { describe, expect, it } from 'vitest';

import {
  CURIOSITY_GENERATION_POLL_INTERVAL_MS,
  CURIOSITY_GENERATION_TIMEOUT_MS,
  curiosityGenerationPollLimit,
} from '@/lib/curiosity/live-timing';

describe('Curiosity live generation timing', () => {
  it('keeps polling through a real multi-agent generation without hiding progress', () => {
    expect(CURIOSITY_GENERATION_POLL_INTERVAL_MS).toBe(500);
    expect(CURIOSITY_GENERATION_TIMEOUT_MS).toBe(360_000);
    expect(curiosityGenerationPollLimit()).toBe(720);
  });
});
