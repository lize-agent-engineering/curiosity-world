import { describe, expect, it } from 'vitest';

import { isExperienceComplete } from '@/lib/curiosity/completion';
import { summarizeCuriosityEvents } from '@/lib/curiosity/runtime';
import type { CuriosityEventV3 } from '@/lib/curiosity/experience-spec-v3';
import { curiosityExperienceSpecV3Schema } from '@/lib/curiosity/experience-spec-v3';
import { validV3Spec } from './v3-fixture';

function event(
  eventId: string,
  type: CuriosityEventV3['type'],
  payload: Record<string, unknown> = {},
): CuriosityEventV3 {
  return {
    source: 'curiosity-world',
    protocolVersion: '3.0',
    eventId,
    experienceId: 'cur_moon_demo',
    versionId: 'ver_moon_demo_1',
    type,
    action: type,
    occurredAt: `2026-08-17T00:00:0${eventId.at(-1)}.000Z`,
    payload,
  };
}

describe('V3 runtime summary', () => {
  it('summarizes only real V3 evidence and does not infer mastery', () => {
    const summary = summarizeCuriosityEvents(
      {
        experienceId: 'cur_moon_demo',
        versionId: 'ver_moon_demo_1',
        spec: curiosityExperienceSpecV3Schema.parse(validV3Spec),
      },
      [
        event('evt_1', 'object_inspected', { objectId: 'moon' }),
        event('evt_2', 'control_changed', { controlId: 'observer', value: 40 }),
        event('evt_3', 'relationship_revealed', { relationId: 'near-far' }),
        event('evt_4', 'reflection_recorded', { text: '远处看起来变化更小' }),
        event('evt_5', 'exploration_ended'),
        { ...event('evt_other', 'object_moved'), versionId: 'ver_other' },
      ],
    );

    expect(summary.eventCount).toBe(5);
    expect(summary.facts.flatMap((fact) => fact.eventIds)).not.toContain('evt_other');
    expect(summary.facts.map((fact) => fact.kind)).toEqual([
      'inspection',
      'change',
      'relationship',
      'reflection',
      'completion',
    ]);
    expect(JSON.stringify(summary)).not.toMatch(/掌握|能力|正确率/);
  });

  it('allows the child to end exploration without completing other event types', () => {
    const spec = curiosityExperienceSpecV3Schema.parse(validV3Spec);
    expect(isExperienceComplete(spec, [event('evt_1', 'exploration_ended')])).toBe(true);
    expect(isExperienceComplete(spec, [event('evt_1', 'control_changed')])).toBe(false);
  });
});
