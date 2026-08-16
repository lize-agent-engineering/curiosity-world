import Dexie from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CuriosityRepositoryError,
  IndexedDbCuriosityRepository,
  type CreateCuriosityVersionInput,
} from '@/lib/curiosity/repository';
import type { CuriosityEventV3 } from '@/lib/curiosity/experience-spec-v3';
import { curiosityExperienceSpecV3Schema } from '@/lib/curiosity/experience-spec-v3';
import { validV3Spec } from './v3-fixture';

function legacySpec() {
  return {
    schemaVersion: '1.0',
    experienceId: 'cur_moon_demo',
    versionId: 'ver_moon_demo_1',
    revision: 1,
    createdAt: '2026-08-15T00:00:00.000Z',
    profile: { age: 8, interests: ['散步'] },
    question: {
      original: '为什么月亮看起来会跟着我们？',
      coreQuestion: '为什么移动时月亮的位置看起来几乎不变？',
    },
    knowledge: { family: 'relative-motion', packId: 'relative-motion.moon-following.v1' },
    presentation: {
      title: '月亮真的在跟着我吗？',
      hook: '先比较路灯和月亮。',
      completion: '距离越远，观察方向变化越小。',
    },
    simulation: { observerTravel: 80, nearObjectDistance: 20, farObjectDistance: 400 },
  };
}

function legacyCompiledSpec() {
  return {
    artifactId: 'art_spec_1',
    runId: 'run_generation_1',
    agentRole: 'curiosity.interaction-designer',
    schemaVersion: '2.0',
    createdAt: '2026-08-15T00:00:00.000Z',
    upstreamArtifactIds: ['art_question_1', 'art_knowledge_1', 'art_interaction_1'],
    knowledgePackVersion: '1.0.0',
    experienceId: 'cur_moon_demo',
    versionId: 'ver_moon_demo_1',
    revision: 1,
    profile: { age: 8, interests: ['散步'] },
    knowledge: {
      family: 'relative-motion',
      packId: 'relative-motion.moon-following.v1',
      packVersion: '1.0.0',
    },
    title: '月亮为什么像在跟着我？',
    observationSuggestions: ['散步时比较路灯和月亮。'],
    instructions: [
      { text: '先猜一猜' },
      { text: '拖动看看' },
      { text: '比较远和近' },
      { text: '换个距离试试' },
    ],
    variables: [
      { id: 'observer-position', initial: 0 },
      { id: 'object-distance', initial: 200 },
    ],
  };
}

function versionInput(
  overrides: Partial<CreateCuriosityVersionInput> = {},
): CreateCuriosityVersionInput {
  return {
    experienceId: 'cur_moon_demo',
    versionId: 'ver_moon_demo_1',
    revision: 1,
    createdAt: '2026-08-15T04:00:00.000Z',
    spec: curiosityExperienceSpecV3Schema.parse(validV3Spec),
    artifacts: [],
    agentRuns: [],
    ...overrides,
  };
}

function event(eventId: string, versionId = 'ver_moon_demo_1'): CuriosityEventV3 {
  return {
    source: 'curiosity-world',
    protocolVersion: '3.0',
    eventId,
    experienceId: 'cur_moon_demo',
    versionId,
    type: 'control_changed',
    action: 'observer_moved',
    occurredAt: '2026-08-15T04:01:00.000Z',
    payload: { position: 20 },
  };
}

async function seedLegacyV3Database(
  name: string,
  indexedDB: IDBFactory,
  options: { eventType?: string } = {},
): Promise<void> {
  const legacy = new Dexie(name, { indexedDB, IDBKeyRange });
  legacy.version(3).stores({
    experiences: '&id, updatedAt',
    versions: '&id, experienceId, [experienceId+revision], status',
    events: '&eventId, [experienceId+versionId], occurredAt',
    agentRuns: '&agentRunId, runId, experienceId, candidateVersionId, status',
    artifacts: '&artifactId, runId, agentRole, schemaVersion',
    guidanceStates: '&[experienceId+versionId]',
    voiceEvents: '&eventId, [experienceId+versionId], stageId, occurredAt',
  });
  const oldSpec = legacySpec();
  const oldExperienceSpec = legacyCompiledSpec();
  await legacy.open();
  await legacy.transaction(
    'rw',
    legacy.table('experiences'),
    legacy.table('versions'),
    legacy.table('events'),
    legacy.table('voiceEvents'),
    async () => {
      await legacy.table('experiences').add({
        id: oldSpec.experienceId,
        question: oldSpec.question.original,
        age: oldSpec.profile.age,
        interests: ['散步'],
        createdAt: oldSpec.createdAt,
        updatedAt: oldSpec.createdAt,
        activeVersionId: oldSpec.versionId,
      });
      await legacy.table('versions').add({
        id: oldSpec.versionId,
        experienceId: oldSpec.experienceId,
        revision: oldSpec.revision,
        createdAt: oldSpec.createdAt,
        status: 'active',
        spec: oldSpec,
        experienceSpec: oldExperienceSpec,
        artifacts: [oldExperienceSpec],
        agentRuns: [],
        specHash: 'cw1-legacy',
      });
      await legacy.table('events').add({
        eventId: 'evt_legacy_control',
        experienceId: oldSpec.experienceId,
        versionId: oldSpec.versionId,
        occurredAt: oldSpec.createdAt,
        event: {
          source: 'curiosity-world',
          protocolVersion: '1.0',
          eventId: 'evt_legacy_control',
          experienceId: oldSpec.experienceId,
          versionId: oldSpec.versionId,
          type: options.eventType ?? 'variable_changed',
          taskId: 'exploration',
          action: 'observer_moved',
          occurredAt: oldSpec.createdAt,
          payload: { position: 20 },
        },
      });
      await legacy.table('voiceEvents').add({
        eventId: 'evt_voice_legacy',
        experienceId: oldSpec.experienceId,
        versionId: oldSpec.versionId,
        stageId: 'prediction',
        occurredAt: oldSpec.createdAt,
        event: {
          schemaVersion: '1.0',
          eventId: 'evt_voice_legacy',
          experienceId: oldSpec.experienceId,
          versionId: oldSpec.versionId,
          stageId: 'prediction',
          status: 'accepted',
          transcript: '我猜路灯变化更快',
          occurredAt: oldSpec.createdAt,
        },
      });
    },
  );
  legacy.close();
}

describe('IndexedDbCuriosityRepository V3', () => {
  it('treats activating the current active version as an idempotent success', async () => {
    const factory = new IDBFactory();
    const repository = new IndexedDbCuriosityRepository({
      name: `curiosity-v3-idempotent-${crypto.randomUUID()}`,
      indexedDB: factory,
      IDBKeyRange,
    });
    await repository.createExperienceWithCandidate({
      experienceId: 'cur_v3_idempotent',
      versionId: 'ver_v3_idempotent',
      revision: 1,
      createdAt: '2026-08-17T00:00:00.000Z',
      spec: curiosityExperienceSpecV3Schema.parse(validV3Spec),
      artifacts: [],
      agentRuns: [],
    });

    await repository.activateVersion('cur_v3_idempotent', 'ver_v3_idempotent');
    await expect(
      repository.activateVersion('cur_v3_idempotent', 'ver_v3_idempotent'),
    ).resolves.toBeUndefined();
  });

  let indexedDB: IDBFactory;
  let name: string;
  let repository: IndexedDbCuriosityRepository;

  beforeEach(() => {
    indexedDB = new IDBFactory();
    name = `Curiosity-V3-${crypto.randomUUID()}`;
    repository = new IndexedDbCuriosityRepository({ name, indexedDB, IDBKeyRange });
  });

  afterEach(async () => {
    await repository.deleteDatabase();
  });

  it('stores one V3 spec without V1/V2 evidence duplication', async () => {
    await repository.createExperienceWithCandidate(versionInput());
    const stored = await repository.getExperience('cur_moon_demo');
    expect(stored?.versions[0]).toMatchObject({
      id: 'ver_moon_demo_1',
      status: 'candidate',
      spec: validV3Spec,
    });
    expect(stored?.versions[0]).not.toHaveProperty('experienceSpec');
    expect(stored?.versions[0]?.specHash).toMatch(/^cw3-/);
  });

  it('keeps a failed candidate and its evidence instead of deleting it', async () => {
    await repository.createExperienceWithCandidate(versionInput());
    await repository.markVersionFailed(
      'cur_moon_demo',
      'ver_moon_demo_1',
      'SCENE_VALIDATION_FAILED',
    );
    await expect(repository.getExperience('cur_moon_demo')).resolves.toMatchObject({
      versions: [
        {
          id: 'ver_moon_demo_1',
          status: 'failed',
          failureCode: 'SCENE_VALIDATION_FAILED',
          spec: validV3Spec,
        },
      ],
    });
  });

  it('keeps exact event retries idempotent and rejects collisions', async () => {
    await repository.createExperienceWithCandidate(versionInput());
    await repository.activateVersion('cur_moon_demo', 'ver_moon_demo_1');
    const first = event('evt_control_1');
    await repository.appendEvent(first);
    await repository.appendEvent(first);
    await expect(repository.listEvents('cur_moon_demo', 'ver_moon_demo_1')).resolves.toEqual([
      first,
    ]);
    await expect(
      repository.appendEvent({ ...first, payload: { position: 99 } }),
    ).rejects.toBeInstanceOf(CuriosityRepositoryError);
  });

  it('upgrades legacy records transactionally and preserves ids, history and voice evidence', async () => {
    await repository.deleteDatabase();
    await seedLegacyV3Database(name, indexedDB);
    repository = new IndexedDbCuriosityRepository({ name, indexedDB, IDBKeyRange });

    const restored = await repository.getActiveExperience('cur_moon_demo');
    expect(restored?.version.spec.scene.type).toBe('relative-motion');
    expect(restored?.experience).not.toHaveProperty('interests');
    expect(restored?.events).toEqual([
      expect.objectContaining({
        eventId: 'evt_legacy_control',
        versionId: 'ver_moon_demo_1',
        type: 'control_changed',
        payload: { position: 20 },
        metadata: { legacyType: 'variable_changed' },
      }),
    ]);
    await expect(repository.listVoiceEvents('cur_moon_demo', 'ver_moon_demo_1')).resolves.toEqual([
      expect.objectContaining({ eventId: 'evt_voice_legacy', transcript: '我猜路灯变化更快' }),
    ]);
  });

  it('marks an unmigratable version failed, clears activation and keeps the legacy row', async () => {
    await repository.deleteDatabase();
    await seedLegacyV3Database(name, indexedDB, { eventType: 'unknown_legacy_event' });
    repository = new IndexedDbCuriosityRepository({ name, indexedDB, IDBKeyRange });

    await expect(repository.getActiveExperience('cur_moon_demo')).resolves.toBeNull();
    const inspector = new Dexie(name, { indexedDB, IDBKeyRange });
    inspector.version(4).stores({
      experiences: '&id, updatedAt',
      versions: '&id, experienceId, [experienceId+revision], status',
      events: '&eventId, [experienceId+versionId], occurredAt',
      agentRuns: '&agentRunId, runId, experienceId, candidateVersionId, status',
      artifacts: '&artifactId, runId, agentRole, schemaVersion',
      guidanceStates: '&[experienceId+versionId]',
      voiceEvents: '&eventId, [experienceId+versionId], stageId, occurredAt',
    });
    await inspector.open();
    const failedVersion = await inspector.table('versions').get('ver_moon_demo_1');
    expect(failedVersion).toMatchObject({
      status: 'failed',
      failureCode: 'SCHEMA_MIGRATION_FAILED',
      spec: { scene: { type: 'relative-motion' } },
    });
    expect(failedVersion.artifacts[0]).toMatchObject({ schemaVersion: '2.0' });
    expect(await inspector.table('events').get('evt_legacy_control')).toMatchObject({
      migrationFailure: 'SCHEMA_MIGRATION_FAILED',
      event: { type: 'unknown_legacy_event' },
    });
    inspector.close();
  });
});
