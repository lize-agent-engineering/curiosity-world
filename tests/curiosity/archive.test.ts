import { describe, expect, it } from 'vitest';

import { buildCuriosityArchive } from '@/lib/curiosity/archive';
import type { CuriosityEventV3 } from '@/lib/curiosity/experience-spec-v3';
import { validateCuriosityExperienceSpecV3 } from '@/lib/curiosity/experience-spec-v3';
import type {
  CuriosityExperienceAggregate,
  CuriosityVersionRecord,
} from '@/lib/curiosity/repository';
import { validV3Spec } from './v3-fixture';

function versionRecord(revision: number): CuriosityVersionRecord {
  const { spec, specHash } = validateCuriosityExperienceSpecV3(validV3Spec);
  return {
    id: `ver_moon_demo_${revision}`,
    experienceId: 'cur_moon_demo',
    revision,
    createdAt: '2026-08-15T04:00:00.000Z',
    status: revision === 2 ? 'active' : 'superseded',
    spec,
    artifacts: [],
    agentRuns: [],
    specHash,
  };
}

function event(
  eventId: string,
  versionId: string,
  type: CuriosityEventV3['type'],
): CuriosityEventV3 {
  return {
    source: 'curiosity-world',
    protocolVersion: '3.0',
    eventId,
    experienceId: 'cur_moon_demo',
    versionId,
    type,
    action: type === 'control_changed' ? 'observer_moved' : 'finished',
    occurredAt: '2026-08-15T04:00:00.000Z',
    payload: type === 'control_changed' ? { position: 40 } : {},
  };
}

describe('Curiosity archive projection', () => {
  it('summarizes only selected V3-version evidence and uses pack-bounded next questions', () => {
    const aggregate: CuriosityExperienceAggregate = {
      experience: {
        id: 'cur_moon_demo',
        question: '为什么月亮看起来会跟着我们？',
        age: 8,
        createdAt: '2026-08-15T00:00:00.000Z',
        updatedAt: '2026-08-15T00:00:00.000Z',
        activeVersionId: 'ver_moon_demo_2',
      },
      versions: [versionRecord(1), versionRecord(2)],
    };
    const archive = buildCuriosityArchive(aggregate, 'ver_moon_demo_2', [
      event('evt_ver_1', 'ver_moon_demo_1', 'exploration_ended'),
      event('evt_ver_2_move', 'ver_moon_demo_2', 'control_changed'),
      event('evt_ver_2_done', 'ver_moon_demo_2', 'exploration_ended'),
    ]);

    expect(archive.facts.every((fact) => fact.eventIds.length > 0)).toBe(true);
    expect(archive.facts.flatMap((fact) => fact.eventIds)).not.toContain('evt_ver_1');
    expect(archive.nextQuestions).toEqual(['远山为什么移动得慢？', '车窗近景为什么移动得快？']);
    expect(archive.observationSuggestions).toEqual(['比较近处路灯和远处月亮。']);
  });
});
