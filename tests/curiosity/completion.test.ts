import { describe, expect, it } from 'vitest';

import { isExperienceComplete } from '@/lib/curiosity/completion';
import { createValidCuriositySpec } from './fixture';

describe('Curiosity completion gate', () => {
  it('requires every declared interaction event before showing completion', () => {
    const spec = createValidCuriositySpec();
    const eventTypes = spec.eventRequirements.map((type, index) => ({
      eventId: `evt_${index}`,
      type,
    }));

    expect(
      isExperienceComplete(
        spec,
        eventTypes.filter((event) => event.type !== 'challenge_completed'),
      ),
    ).toBe(false);
    expect(isExperienceComplete(spec, eventTypes)).toBe(true);
  });
});
