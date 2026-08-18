'use client';

export interface NarrationCacheDependencies {
  fetch?: typeof globalThis.fetch;
}

interface NarrationEntry {
  blob: Promise<Blob>;
  settled: 'pending' | 'ready' | 'failed';
}

/**
 * Caches managed narration audio by its text.
 *
 * The narration endpoint is deterministic for a given text and voice config, so
 * the same sentence never needs to be synthesized twice — replays become
 * instant. `prefetch` also lets a caller start synthesis the moment the text is
 * known, in parallel with unrelated persistence work, instead of paying the
 * round trip only once playback is requested.
 */
export class CuriosityNarrationCache {
  private readonly entries = new Map<string, NarrationEntry>();

  constructor(
    private readonly dependencies: NarrationCacheDependencies = {},
    private readonly limit = 24,
  ) {}

  /** Start synthesizing without waiting. Safe to call repeatedly for one text. */
  prefetch(text: string): void {
    const key = text.trim();
    if (!key) return;
    void this.entry(key).blob.catch(() => undefined);
  }

  /** Resolve the audio for `text`, reusing an in-flight or completed synthesis. */
  async resolve(text: string, signal?: AbortSignal): Promise<Blob> {
    const key = text.trim();
    if (!key) throw new Error('TTS_FAILED: 语音旁白文本为空。');
    const entry = this.entry(key);
    try {
      const blob = await entry.blob;
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      return blob;
    } catch (cause) {
      // A failed synthesis must not poison the cache: drop it so a retry can
      // reach the network again.
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw cause;
    }
  }

  has(text: string): boolean {
    return this.entries.get(text.trim())?.settled === 'ready';
  }

  clear(): void {
    this.entries.clear();
  }

  private entry(key: string): NarrationEntry {
    const existing = this.entries.get(key);
    if (existing) return existing;
    const entry: NarrationEntry = { settled: 'pending', blob: this.synthesize(key) };
    entry.blob.then(
      () => {
        entry.settled = 'ready';
      },
      () => {
        entry.settled = 'failed';
      },
    );
    this.entries.set(key, entry);
    this.evict();
    return entry;
  }

  private evict(): void {
    while (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next();
      if (oldest.done) return;
      this.entries.delete(oldest.value);
    }
  }

  private async synthesize(text: string): Promise<Blob> {
    const fetchNarration = this.dependencies.fetch ?? globalThis.fetch;
    const response = await fetchNarration('/api/curiosity/narration', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error('TTS_FAILED: 语音旁白生成失败，请重试。');
    return response.blob();
  }
}
