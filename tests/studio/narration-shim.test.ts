import { describe, expect, it, vi } from 'vitest';

import { patchHtmlForIframe } from '@/lib/utils/iframe';

/**
 * The shim is injected as source text, so it is exercised the way the browser
 * runs it: pull the script out of the patched document and evaluate it against
 * a stub window.
 */
function runNarrationShim() {
  const patched = patchHtmlForIframe('<!doctype html><html><head></head><body></body></html>');
  const source = /<script data-iframe-narration-shim>([\s\S]*?)<\/script>/.exec(patched)?.[1];
  if (!source) throw new Error('narration shim not injected');

  const posted: unknown[] = [];
  const spoken: string[] = [];
  const listeners: Array<(event: { data: unknown }) => void> = [];
  const stub = {
    parent: { postMessage: (message: unknown) => posted.push(message) },
    speechSynthesis: { cancel: vi.fn(), speak: (u: { text: string }) => spoken.push(u.text) },
    addEventListener: (type: string, listener: (event: { data: unknown }) => void) => {
      if (type === 'message') listeners.push(listener);
    },
  } as Record<string, unknown>;

  const utterances: Array<{ text: string; lang?: string; rate?: number }> = [];
  class FakeUtterance {
    text: string;
    lang = '';
    rate = 1;
    constructor(text: string) {
      this.text = text;
      utterances.push(this);
    }
  }

  new Function('window', 'SpeechSynthesisUtterance', source)(stub, FakeUtterance);
  return { stub, posted, spoken, listeners, utterances };
}

describe('the narration bridge', () => {
  it('gives the page a curiositySay to call', () => {
    const { stub } = runNarrationShim();
    expect(typeof stub.curiositySay).toBe('function');
    expect(stub.__curiosityNarrationHost).toBe(true);
  });

  it('hands the line to the host rather than speaking it locally', () => {
    const { stub, posted, spoken } = runNarrationShim();
    (stub.curiositySay as (text: string) => void)('先猜猜看，毛毛虫会变成什么？');
    expect(posted).toEqual([
      {
        __curiosityInteractive: true,
        kind: 'narrate',
        text: '先猜猜看，毛毛虫会变成什么？',
      },
    ]);
    expect(spoken).toEqual([]);
  });

  it('ignores an empty line and caps a very long one', () => {
    const { stub, posted } = runNarrationShim();
    const say = stub.curiositySay as (text: unknown) => void;
    say('');
    say(null);
    expect(posted).toEqual([]);
    say('长'.repeat(400));
    expect((posted[0] as { text: string }).text).toHaveLength(240);
  });

  it('speaks in the page voice when the host hands the line back', () => {
    const { listeners, spoken, utterances } = runNarrationShim();
    expect(listeners).toHaveLength(1);
    listeners[0]!({ data: { __curiosityNarrationFallback: true, text: '再试一次看看' } });
    expect(spoken).toEqual(['再试一次看看']);
    expect(utterances[0]!.lang).toBe('zh-CN');
  });

  it('does nothing for an unrelated message', () => {
    const { listeners, spoken } = runNarrationShim();
    listeners[0]!({ data: { __curiosityErrorReplayRequest: true } });
    expect(spoken).toEqual([]);
  });
});
