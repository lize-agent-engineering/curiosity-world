import { describe, expect, it } from 'vitest';

import {
  CURIOSITY_EVENT_TYPES_V3,
  LEGACY_EVENT_TYPE_MAP_V1,
  LEGACY_EVENT_TYPE_MAP_V2,
  curiosityExperienceSpecV3Schema,
  migrateLegacyEvent,
  validateCuriosityExperienceSpecV3,
} from '@/lib/curiosity/experience-spec-v3';
import { validV3Spec } from './v3-fixture';

describe('CuriosityExperienceSpecV3', () => {
  it('uses the exact approved ten-event vocabulary', () => {
    expect(CURIOSITY_EVENT_TYPES_V3).toEqual(validV3Spec.eventRequirements);
  });

  it('contains exactly the nine approved top-level fields and rejects interests', () => {
    const parsed = curiosityExperienceSpecV3Schema.parse(validV3Spec);
    expect(Object.keys(parsed)).toEqual([
      'question',
      'targetAge',
      'route',
      'knowledge',
      'scene',
      'narrationLibrary',
      'discoveryPrompts',
      'limitations',
      'eventRequirements',
    ]);
    expect(() =>
      curiosityExperienceSpecV3Schema.parse({ ...validV3Spec, interests: ['散步'] }),
    ).toThrow();
  });

  it('requires every approved event exactly once', () => {
    expect(() =>
      curiosityExperienceSpecV3Schema.parse({
        ...validV3Spec,
        eventRequirements: [...validV3Spec.eventRequirements.slice(0, 9), 'exploration_started'],
      }),
    ).toThrow(/event/i);
  });

  it('moves compiler validation and canonical hashing into the V3 validator', () => {
    const first = validateCuriosityExperienceSpecV3(validV3Spec);
    const reordered = {
      eventRequirements: validV3Spec.eventRequirements,
      limitations: validV3Spec.limitations,
      discoveryPrompts: validV3Spec.discoveryPrompts,
      narrationLibrary: validV3Spec.narrationLibrary,
      scene: validV3Spec.scene,
      knowledge: validV3Spec.knowledge,
      route: validV3Spec.route,
      targetAge: validV3Spec.targetAge,
      question: validV3Spec.question,
    };
    expect(validateCuriosityExperienceSpecV3(reordered).specHash).toBe(first.specHash);
    expect(first.spec).toEqual(validV3Spec);
  });
});

describe('legacy event migration', () => {
  it('uses the approved V1 mapping', () => {
    expect(LEGACY_EVENT_TYPE_MAP_V1).toEqual({
      experiment_started: 'exploration_started',
      variable_changed: 'control_changed',
      prediction_submitted: 'response_recorded',
      challenge_attempted: 'response_recorded',
      challenge_completed: 'relationship_revealed',
      explanation_selected: 'reflection_recorded',
      experience_completed: 'exploration_ended',
    });
  });

  it('uses the approved V2 mapping', () => {
    expect(LEGACY_EVENT_TYPE_MAP_V2).toEqual({
      experience_started: 'exploration_started',
      prediction_submitted: 'response_recorded',
      transfer_attempted: 'response_recorded',
      variable_changed: 'control_changed',
      feedback_shown: 'feedback_presented',
      explanation_selected: 'reflection_recorded',
      experience_completed: 'exploration_ended',
    });
  });

  it('preserves identity, time and payload while recording metadata.legacyType', () => {
    expect(
      migrateLegacyEvent('v1', {
        source: 'curiosity-world',
        protocolVersion: '1.0',
        eventId: 'evt_legacy_1',
        experienceId: 'cur_legacy_1',
        versionId: 'ver_legacy_1',
        type: 'variable_changed',
        taskId: 'exploration',
        action: 'observer_moved',
        occurredAt: '2026-08-15T00:00:00.000Z',
        payload: { position: 42 },
      }),
    ).toMatchObject({
      eventId: 'evt_legacy_1',
      experienceId: 'cur_legacy_1',
      versionId: 'ver_legacy_1',
      type: 'control_changed',
      occurredAt: '2026-08-15T00:00:00.000Z',
      payload: { position: 42 },
      metadata: { legacyType: 'variable_changed' },
    });
  });
});
