import { describe, expect, it } from 'vitest';

import { isExperienceComplete } from '@/lib/curiosity/completion';
import type { CuriosityEventV3 } from '@/lib/curiosity/experience-spec-v3';
import { curiosityExperienceSpecV3Schema } from '@/lib/curiosity/experience-spec-v3';
import { validV3Spec } from './v3-fixture';

describe('Curiosity completion gate', () => {
  it('ends only after the child explicitly emits exploration_ended', () => {
    const spec = curiosityExperienceSpecV3Schema.parse(validV3Spec);
    const eventTypes: Array<Pick<CuriosityEventV3, 'type'>> = [
      { type: 'exploration_started' },
      { type: 'relationship_revealed' },
      { type: 'reflection_recorded' },
    ];

    expect(isExperienceComplete(spec, eventTypes)).toBe(false);
    expect(isExperienceComplete(spec, [...eventTypes, { type: 'exploration_ended' }])).toBe(true);
  });
});
