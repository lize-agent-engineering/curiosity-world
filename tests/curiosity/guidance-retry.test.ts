import { describe, expect, it, vi } from 'vitest';

import { runGuidanceWithRetry } from '@/lib/curiosity/guidance-retry';

describe('Curiosity guidance recovery', () => {
  it('retries a transient model schema failure without surfacing it', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('GUIDANCE_MODEL_INVALID: strict schema failed'))
      .mockRejectedValueOnce(new Error('MODEL_UNAVAILABLE: upstream timeout'))
      .mockResolvedValue('继续探索');
    const onRetry = vi.fn();

    await expect(
      runGuidanceWithRetry(operation, { attempts: 3, delayMs: 0, onRetry }),
    ).resolves.toBe('继续探索');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('fast-fails deterministic guidance conflicts instead of retrying them', async () => {
    const operation = vi.fn(async () => {
      throw new Error('GUIDANCE_STAGE_CONFLICT: stage already advanced');
    });

    await expect(runGuidanceWithRetry(operation, { attempts: 3, delayMs: 0 })).rejects.toThrow(
      /GUIDANCE_STAGE_CONFLICT/,
    );
    expect(operation).toHaveBeenCalledOnce();
  });
});
