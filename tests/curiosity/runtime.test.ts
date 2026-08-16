import { describe, expect, it } from 'vitest';

import { compileCuriosityExperience } from '@/lib/curiosity/compiler';
import { interpretCuriosityFrameMessage, summarizeCuriosityEvents } from '@/lib/curiosity/runtime';
import type { CuriosityEventV1 } from '@/lib/curiosity/contracts';
import { createValidCuriositySpec } from './fixture';

function event(
  eventId: string,
  type: CuriosityEventV1['type'],
  taskId: string,
  action: string,
  payload: Record<string, unknown> = {},
): CuriosityEventV1 {
  return {
    source: 'curiosity-world',
    protocolVersion: '1.0',
    eventId,
    experienceId: 'cur_moon_demo',
    versionId: 'ver_moon_demo_1',
    type,
    taskId,
    action,
    occurredAt: `2026-08-15T00:00:${eventId.slice(-1).padStart(2, '0')}.000Z`,
    payload,
  };
}

describe('deterministic Curiosity compiler', () => {
  it('compiles the same validated specification to the same isolated document', () => {
    const spec = createValidCuriositySpec();
    const first = compileCuriosityExperience(spec);
    const second = compileCuriosityExperience(spec);

    expect(first).toEqual(second);
    expect(first.html).toContain('data-curiosity-runtime');
    expect(first.html).toContain('data-iframe-error-shim');
    expect(first.html).toContain("kind === 'request_ready'");
    expect(first.html).not.toMatch(/https?:\/\//);
    expect(first.html).not.toContain('fetch(');
  });

  it('escapes model-authored copy before embedding it in a script', () => {
    const spec = createValidCuriositySpec();
    spec.presentation.hook = '</script><script>window.parent.hacked=true</script>';

    const compiled = compileCuriosityExperience(spec);

    expect(compiled.html).not.toContain('</script><script>window.parent.hacked');
    expect(compiled.html).toContain('\\u003c/script\\u003e');
  });

  it('maps validated story kinds instead of model-authored stage ids', () => {
    const compiled = compileCuriosityExperience(createValidCuriositySpec());

    expect(compiled.html).toContain("'guided-discovery': 'exploration-stage'");
    expect(compiled.html).toContain('hostStageKinds[message.stageKind]');
    expect(compiled.html).not.toContain('hostStageIds[message.stageId]');
  });

  it('lets the guided host own stage changes and exposes a distance experiment', () => {
    const compiled = compileCuriosityExperience(createValidCuriositySpec());

    expect(compiled.html).toContain('id="object-distance"');
    expect(compiled.html).toContain('state.hostControlled = true');
    expect(compiled.html).toContain("if (!state.hostControlled) showStage('challenge-stage')");
    expect(compiled.html).toContain("'distance_changed'");
  });

  it('restores prerequisite runtime milestones when the host restores a later stage', () => {
    const compiled = compileCuriosityExperience(createValidCuriositySpec());

    expect(compiled.html).toContain(
      "if (message.stageKind === 'transfer' || message.stageKind === 'explanation') state.moved = true",
    );
    expect(compiled.html).toContain(
      "if (message.stageKind === 'explanation') state.challengeComplete = true",
    );
  });

  it.each([
    ['balance-support', 'balance-support.bridge.v1', 'balance-support-v1', 'support-position'],
    ['light-path', 'light-path.shadow-length.v1', 'light-path-v1', 'light-position'],
  ] as const)(
    'renders the declared exploration control for %s',
    (family, packId, preset, variable) => {
      const spec = createValidCuriositySpec();
      spec.knowledge = { family, packId };
      spec.simulation.preset = preset;
      const exploration = spec.tasks.find((task) => task.kind === 'exploration');
      if (!exploration || exploration.kind !== 'exploration')
        throw new Error('missing exploration');
      exploration.variable = variable;

      const compiled = compileCuriosityExperience(spec);

      expect(compiled.html).toContain(`id="${variable}"`);
      expect(compiled.html).toContain(`variableId: '${variable}'`);
      expect(compiled.html).not.toContain('id="observer-position"');
    },
  );
});

describe('iframe protocol boundary', () => {
  const expected = { experienceId: 'cur_moon_demo', versionId: 'ver_moon_demo_1' };

  it('accepts readiness and events only for the active experience version', () => {
    expect(
      interpretCuriosityFrameMessage(
        {
          source: 'curiosity-world',
          protocolVersion: '1.0',
          kind: 'experience_ready',
          ...expected,
        },
        expected,
      ),
    ).toEqual({ kind: 'ready' });

    const changed = event('evt_1', 'variable_changed', 'exploration', 'observer_moved', {
      position: 24,
    });
    expect(interpretCuriosityFrameMessage(changed, expected)).toEqual({
      kind: 'event',
      event: changed,
    });
    expect(
      interpretCuriosityFrameMessage({ ...changed, versionId: 'ver_moon_demo_0' }, expected),
    ).toBeNull();
  });

  it('rejects unknown messages and unsupported event types', () => {
    expect(interpretCuriosityFrameMessage({ source: 'other' }, expected)).toBeNull();
    expect(
      interpretCuriosityFrameMessage(
        { ...event('evt_2', 'experience_completed', 'completion', 'finished'), type: 'mastery' },
        expected,
      ),
    ).toBeNull();
  });
});

describe('traceable parent summary', () => {
  it('describes balance-support evidence as a bridge test instead of observer motion', () => {
    const spec = createValidCuriositySpec();
    spec.knowledge = { family: 'balance-support', packId: 'balance-support.bridge.v1' };
    const summary = summarizeCuriosityEvents(spec, [
      event('evt_1', 'variable_changed', 'exploration', 'scene_adjusted', {
        variableId: 'support-position',
        value: 1,
      }),
    ]);

    expect(summary.facts[0]?.text).toBe('孩子移动桥墩并完成了 1 次承重观察。');
    expect(summary.facts[0]?.text).not.toContain('观察者');
  });

  it('records a submitted prediction as a parent-visible behavior fact', () => {
    const summary = summarizeCuriosityEvents(createValidCuriositySpec(), [
      event('evt_1', 'prediction_submitted', 'prediction', 'option_selected', {
        optionId: 'near-lamp',
      }),
    ]);

    expect(summary.facts).toEqual([
      expect.objectContaining({ kind: 'prediction', eventIds: ['evt_1'] }),
    ]);
  });

  it('deduplicates events and attaches evidence ids to every behavior fact', () => {
    const events = [
      event('evt_1', 'experiment_started', 'prediction', 'started'),
      event('evt_2', 'variable_changed', 'exploration', 'observer_moved', { position: 20 }),
      event('evt_2', 'variable_changed', 'exploration', 'observer_moved', { position: 20 }),
      event('evt_3', 'challenge_attempted', 'challenge', 'selected', { optionId: 'nearer' }),
      event('evt_4', 'challenge_attempted', 'challenge', 'selected', { optionId: 'farther' }),
      event('evt_5', 'challenge_completed', 'challenge', 'completed'),
      event('evt_6', 'explanation_selected', 'explanation', 'selected', {
        optionId: 'small-angle-change',
      }),
      event('evt_7', 'experience_completed', 'completion', 'finished'),
    ];

    const summary = summarizeCuriosityEvents(createValidCuriositySpec(), events);

    expect(summary.eventCount).toBe(7);
    expect(summary.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'exploration', eventIds: ['evt_2'] }),
        expect.objectContaining({ kind: 'challenge', eventIds: ['evt_3', 'evt_4', 'evt_5'] }),
        expect.objectContaining({ kind: 'explanation', eventIds: ['evt_6'] }),
        expect.objectContaining({ kind: 'completion', eventIds: ['evt_7'] }),
      ]),
    );
    expect(summary.facts.every((fact) => fact.eventIds.length > 0)).toBe(true);
    expect(JSON.stringify(summary)).not.toMatch(/掌握度|能力标签|mastery/i);
  });
});
