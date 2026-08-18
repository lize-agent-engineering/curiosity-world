import { describe, expect, it, vi } from 'vitest';

import { CuriosityNarrationCache } from '@/lib/curiosity/narration-cache';

function audioResponse() {
  return new Response(new Blob(['audio']), { status: 200 });
}

describe('Curiosity narration cache', () => {
  it('synthesizes one sentence once and replays it without another round trip', async () => {
    const fetchNarration = vi.fn(async () => audioResponse());
    const cache = new CuriosityNarrationCache({ fetch: fetchNarration });

    await cache.resolve('月亮为什么跟着我？');
    await cache.resolve('月亮为什么跟着我？');

    expect(fetchNarration).toHaveBeenCalledOnce();
  });

  it('lets a prefetch started before playback serve the later request', async () => {
    const fetchNarration = vi.fn(async () => audioResponse());
    const cache = new CuriosityNarrationCache({ fetch: fetchNarration });

    cache.prefetch('先猜一猜。');
    await vi.waitFor(() => expect(cache.has('先猜一猜。')).toBe(true));
    await cache.resolve('先猜一猜。');

    expect(fetchNarration).toHaveBeenCalledOnce();
  });

  it('collapses concurrent requests for the same sentence into one synthesis', async () => {
    const fetchNarration = vi.fn(async () => audioResponse());
    const cache = new CuriosityNarrationCache({ fetch: fetchNarration });

    await Promise.all([cache.resolve('一起看看。'), cache.resolve('一起看看。')]);

    expect(fetchNarration).toHaveBeenCalledOnce();
  });

  it('does not cache a failure, so the next attempt reaches the service again', async () => {
    const fetchNarration = vi
      .fn()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(audioResponse());
    const cache = new CuriosityNarrationCache({ fetch: fetchNarration });

    await expect(cache.resolve('换个说法。')).rejects.toThrow(/TTS_FAILED/);
    await expect(cache.resolve('换个说法。')).resolves.toBeInstanceOf(Blob);
    expect(fetchNarration).toHaveBeenCalledTimes(2);
  });

  it('keeps distinct sentences apart', async () => {
    const fetchNarration = vi.fn(async () => audioResponse());
    const cache = new CuriosityNarrationCache({ fetch: fetchNarration });

    await cache.resolve('第一段');
    await cache.resolve('第二段');

    expect(fetchNarration).toHaveBeenCalledTimes(2);
  });

  it('evicts the oldest sentence once the cache is full', async () => {
    const fetchNarration = vi.fn(async () => audioResponse());
    const cache = new CuriosityNarrationCache({ fetch: fetchNarration }, 2);

    await cache.resolve('a');
    await cache.resolve('b');
    await cache.resolve('c');
    expect(cache.has('a')).toBe(false);

    await cache.resolve('a');
    expect(fetchNarration).toHaveBeenCalledTimes(4);
  });
});
