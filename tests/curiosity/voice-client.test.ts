import { describe, expect, it, vi } from 'vitest';

import {
  recognizeChildAnswer,
  speakGuidance,
  speakManagedGuidance,
  transcribeChildRecording,
} from '@/lib/curiosity/voice-client';

describe('Curiosity browser voice client', () => {
  it('speaks Chinese guidance and cancels the previous utterance', async () => {
    const cancel = vi.fn();
    const speak = vi.fn((utterance: { onend?: (() => void) | null }) => utterance.onend?.());
    class Utterance {
      lang = '';
      rate = 1;
      onend?: () => void;
      onerror?: () => void;
      constructor(readonly text: string) {}
    }
    await expect(
      speakGuidance('移动看看。', {
        speechSynthesis: { cancel, speak },
        Utterance: Utterance as never,
      }),
    ).resolves.toBeUndefined();
    expect(cancel).toHaveBeenCalledOnce();
    expect(speak.mock.calls[0]?.[0]).toMatchObject({ text: '移动看看。', lang: 'zh-CN' });
  });

  it('returns a recognized child answer and fails on an empty result', async () => {
    class Recognition {
      lang = '';
      continuous = true;
      interimResults = true;
      onresult?: (event: unknown) => void;
      onerror?: (event: unknown) => void;
      onend?: () => void;
      start() {
        this.onresult?.({ results: [[{ transcript: '我猜路灯变化更快', confidence: 0.92 }]] });
      }
      stop() {}
      abort() {}
    }
    await expect(recognizeChildAnswer({ Recognition: Recognition as never })).resolves.toEqual({
      transcript: '我猜路灯变化更快',
      confidence: 0.92,
    });

    class EmptyRecognition extends Recognition {
      override start() {
        this.onend?.();
      }
    }
    await expect(recognizeChildAnswer({ Recognition: EmptyRecognition as never })).rejects.toThrow(
      /ASR_UNCLEAR/,
    );
  });

  it('plays managed narration audio and revokes its object URL', async () => {
    const revokeObjectURL = vi.fn();
    const play = vi.fn(async () => undefined);
    const fetchNarration = vi.fn(
      async () =>
        new Response(new Blob(['audio'], { type: 'audio/mpeg' }), {
          status: 200,
          headers: { 'content-type': 'audio/mpeg' },
        }),
    );

    await expect(
      speakManagedGuidance('移动小朋友。', {
        fetch: fetchNarration,
        createObjectURL: () => 'blob:curiosity-audio',
        revokeObjectURL,
        createAudio: (src) => ({ src, play }),
      }),
    ).resolves.toBeUndefined();

    expect(fetchNarration).toHaveBeenCalledWith('/api/curiosity/narration', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: '移动小朋友。' }),
      signal: undefined,
    });
    expect(play).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:curiosity-audio');
  });

  it('does not pretend narration succeeded when the managed service fails', async () => {
    await expect(
      speakManagedGuidance('开始探索。', {
        fetch: async () => new Response('unavailable', { status: 503 }),
        createObjectURL: vi.fn(),
        revokeObjectURL: vi.fn(),
        createAudio: vi.fn(),
      }),
    ).rejects.toThrow(/TTS_FAILED/);
  });

  it('uploads only recorded audio to the managed transcription endpoint', async () => {
    const fetchTranscription = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const form = init?.body as FormData;
      expect([...form.keys()]).toEqual(['audio']);
      expect(form.get('audio')).toBeInstanceOf(File);
      return Response.json({ success: true, transcript: '我觉得月亮离得很远' });
    });

    await expect(
      transcribeChildRecording(new Blob(['voice'], { type: 'audio/webm' }), {
        fetch: fetchTranscription,
      }),
    ).resolves.toEqual({ transcript: '我觉得月亮离得很远' });
    expect(fetchTranscription).toHaveBeenCalledWith('/api/curiosity/transcribe', {
      method: 'POST',
      body: expect.any(FormData),
      signal: undefined,
    });
  });
});
