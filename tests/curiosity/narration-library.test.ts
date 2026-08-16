import { describe, expect, it } from 'vitest';

describe('reviewed narration selection', () => {
  it('normalizes an event and deterministically chooses the most specific reviewed line', async () => {
    const narration = await import('@/lib/curiosity/narration-library').catch(() => null);
    expect(narration).not.toBeNull();
    if (!narration) return;

    const library = [
      {
        id: 'narration_default',
        eventType: 'variable_changed',
        action: '*',
        text: '看看前后有什么不同。',
      },
      {
        id: 'narration_warmer',
        eventType: 'variable_changed',
        action: 'set-warmer',
        text: '温暖的一边变化得更快。',
      },
    ];

    expect(
      narration.selectReviewedNarration(library, {
        type: 'variable_changed',
        action: '  SET warmer  ',
      }),
    ).toEqual(library[1]);
    expect(
      narration.selectReviewedNarration([...library].reverse(), {
        type: 'variable_changed',
        action: 'unknown action',
      }),
    ).toEqual(library[0]);
  });

  it('returns null instead of generating temporary narration', async () => {
    const narration = await import('@/lib/curiosity/narration-library').catch(() => null);
    expect(narration).not.toBeNull();
    if (!narration) return;

    expect(
      narration.selectReviewedNarration(
        [
          {
            id: 'narration_start',
            eventType: 'experiment_started',
            action: '*',
            text: '开始观察。',
          },
        ],
        { type: 'variable_changed', action: 'set-temperature' },
      ),
    ).toBeNull();
    expect(narration).not.toHaveProperty('generateNarration');
  });
});
