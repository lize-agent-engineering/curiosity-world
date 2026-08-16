import { describe, expect, it, vi } from 'vitest';

import {
  describeVoiceFailure,
  requestMicrophoneStream,
  ReviewedNarrationPlayer,
  transcribeChildRecording,
} from '@/lib/curiosity/voice-client';

const reviewedLine = {
  id: 'narration_test',
  eventType: 'variable_changed',
  action: '*',
  text: '观察前后发生了什么变化。',
};

describe('Curiosity browser voice client', () => {
  it('turns microphone failures into actionable Chinese messages', async () => {
    expect(
      describeVoiceFailure(new DOMException('Permission denied', 'NotAllowedError')),
    ).toContain('允许使用麦克风');
    await expect(
      requestMicrophoneStream(() => new Promise<MediaStream>(() => undefined), 5),
    ).rejects.toThrow(/MICROPHONE_PERMISSION_TIMEOUT/);
  });

  it('sends only a reviewed narration line to managed TTS and stops prior audio', async () => {
    const revokeObjectURL = vi.fn();
    const fetchNarration = vi.fn(async () => new Response(new Blob(['audio']), { status: 200 }));
    const audios: Array<{
      pause: ReturnType<typeof vi.fn>;
      currentTime: number;
      onended: (() => void) | null;
      onerror: (() => void) | null;
      play: ReturnType<typeof vi.fn>;
    }> = [];
    const player = new ReviewedNarrationPlayer({
      fetch: fetchNarration,
      createObjectURL: () => `blob:voice-${audios.length}`,
      revokeObjectURL,
      createAudio: () => {
        const audio = {
          pause: vi.fn(),
          currentTime: 0,
          onended: null,
          onerror: null,
          play: vi.fn(async () => undefined),
        };
        audios.push(audio);
        return audio;
      },
    });

    const first = player.play(reviewedLine);
    await vi.waitFor(() => expect(audios).toHaveLength(1));
    const second = player.play({ ...reviewedLine, id: 'narration_second', text: '再比较一次。' });
    await vi.waitFor(() => expect(audios).toHaveLength(2));
    expect(audios[0]!.pause).toHaveBeenCalledOnce();
    expect(fetchNarration).toHaveBeenLastCalledWith(
      '/api/curiosity/narration',
      expect.objectContaining({ body: JSON.stringify({ text: '再比较一次。' }) }),
    );
    audios[1]!.onended?.();
    await expect(second).resolves.toBeUndefined();
    await expect(first).resolves.toBeUndefined();
  });

  it('uploads only recorded audio to transcription', async () => {
    const fetchTranscription = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect([...(init?.body as FormData).keys()]).toEqual(['audio']);
      return Response.json({ transcript: '我发现温度会影响变化速度' });
    });
    await expect(
      transcribeChildRecording(new Blob(['voice'], { type: 'audio/webm' }), {
        fetch: fetchTranscription,
      }),
    ).resolves.toEqual({
      transcript: '我发现温度会影响变化速度',
    });
  });
});
