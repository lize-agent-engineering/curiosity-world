import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CuriosityRepositoryError, IndexedDbCuriosityRepository } from '@/lib/curiosity/repository';
import type { CuriosityEventV1 } from '@/lib/curiosity/contracts';
import {
  createValidCuriosityAgentRun,
  createValidCuriosityExperienceSpecV2,
  createValidCuriositySpec,
} from './fixture';

function evidence() {
  const experienceSpec = createValidCuriosityExperienceSpecV2();
  return {
    experienceSpec,
    artifacts: [experienceSpec],
    agentRuns: [createValidCuriosityAgentRun()],
  };
}

function curiosityEvent(eventId: string, versionId = 'ver_moon_demo_1'): CuriosityEventV1 {
  return {
    source: 'curiosity-world',
    protocolVersion: '1.0',
    eventId,
    experienceId: 'cur_moon_demo',
    versionId,
    type: 'variable_changed',
    taskId: 'exploration',
    action: 'observer_moved',
    occurredAt: '2026-08-15T04:00:00.000Z',
    payload: { position: 20 },
  };
}

describe('IndexedDbCuriosityRepository', () => {
  let repository: IndexedDbCuriosityRepository;

  beforeEach(() => {
    repository = new IndexedDbCuriosityRepository({
      name: `Curiosity-Test-${crypto.randomUUID()}`,
      indexedDB: new IDBFactory(),
      IDBKeyRange,
    });
  });

  afterEach(async () => {
    await repository.deleteDatabase();
  });

  it('stores a new experience as a non-active candidate', async () => {
    const spec = createValidCuriositySpec();
    await repository.createExperienceWithCandidate(spec, 'cw1-hash', evidence());

    const stored = await repository.getExperience(spec.experienceId);
    expect(stored).toMatchObject({
      experience: { id: spec.experienceId },
      versions: [{ id: spec.versionId, status: 'candidate', specHash: 'cw1-hash' }],
    });
    expect(stored?.experience.activeVersionId).toBeUndefined();
    expect(stored?.versions[0]?.experienceSpec.artifactId).toBe('art_spec_1');
    expect(stored?.versions[0]?.agentRuns).toHaveLength(1);
  });

  it('activates a candidate atomically and supersedes the previous active version', async () => {
    const first = createValidCuriositySpec();
    await repository.createExperienceWithCandidate(first, 'cw1-first', evidence());
    await repository.activateVersion(first.experienceId, first.versionId);

    const second = structuredClone(first);
    second.versionId = 'ver_moon_demo_2';
    second.revision = 2;
    second.createdAt = '2026-08-15T04:05:00.000Z';
    const secondEvidence = evidence();
    secondEvidence.experienceSpec.versionId = second.versionId;
    secondEvidence.experienceSpec.revision = second.revision;
    secondEvidence.experienceSpec.artifactId = 'art_spec_2';
    secondEvidence.agentRuns[0]!.candidateVersionId = second.versionId;
    await repository.addCandidateVersion(second, 'cw1-second', secondEvidence);
    await repository.activateVersion(first.experienceId, second.versionId);

    const stored = await repository.getExperience(first.experienceId);
    expect(stored?.experience.activeVersionId).toBe(second.versionId);
    expect(stored?.versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: first.versionId, status: 'superseded' }),
        expect.objectContaining({ id: second.versionId, status: 'active' }),
      ]),
    );
  });

  it('marks a failed candidate without changing the current active version', async () => {
    const first = createValidCuriositySpec();
    await repository.createExperienceWithCandidate(first, 'cw1-first', evidence());
    await repository.activateVersion(first.experienceId, first.versionId);
    const second = structuredClone(first);
    second.versionId = 'ver_moon_demo_2';
    second.revision = 2;
    const secondEvidence = evidence();
    secondEvidence.experienceSpec.versionId = second.versionId;
    secondEvidence.experienceSpec.revision = second.revision;
    secondEvidence.experienceSpec.artifactId = 'art_spec_2';
    secondEvidence.agentRuns[0]!.candidateVersionId = second.versionId;
    await repository.addCandidateVersion(second, 'cw1-second', secondEvidence);

    await repository.markVersionFailed(first.experienceId, second.versionId, 'RUNTIME_FAILED');

    const stored = await repository.getExperience(first.experienceId);
    expect(stored?.experience.activeVersionId).toBe(first.versionId);
    expect(stored?.versions).toContainEqual(
      expect.objectContaining({
        id: second.versionId,
        status: 'failed',
        failureCode: 'RUNTIME_FAILED',
      }),
    );
  });

  it('writes events only for the active version and deduplicates exact repeats', async () => {
    const spec = createValidCuriositySpec();
    await repository.createExperienceWithCandidate(spec, 'cw1-first', evidence());
    await expect(repository.appendEvent(curiosityEvent('evt_1'))).rejects.toMatchObject({
      code: 'VERSION_NOT_ACTIVE',
    });
    await repository.activateVersion(spec.experienceId, spec.versionId);

    const first = curiosityEvent('evt_1');
    await repository.appendEvent(first);
    await repository.appendEvent(first);
    expect(await repository.listEvents(spec.experienceId, spec.versionId)).toEqual([first]);

    await expect(
      repository.appendEvent({ ...first, payload: { position: 99 } }),
    ).rejects.toBeInstanceOf(CuriosityRepositoryError);
  });

  it('restores the active version and ordered events through a fresh repository instance', async () => {
    const spec = createValidCuriositySpec();
    await repository.createExperienceWithCandidate(spec, 'cw1-first', evidence());
    await repository.activateVersion(spec.experienceId, spec.versionId);
    await repository.appendEvent(curiosityEvent('evt_2'));
    await repository.appendEvent({
      ...curiosityEvent('evt_1'),
      occurredAt: '2026-08-15T03:59:00.000Z',
    });

    const restored = await repository.getActiveExperience(spec.experienceId);
    expect(restored?.version.spec.versionId).toBe(spec.versionId);
    expect(restored?.events.map((event) => event.eventId)).toEqual(['evt_1', 'evt_2']);
  });

  it('exports and imports a complete experience snapshot for another browser', async () => {
    const spec = createValidCuriositySpec();
    await repository.createExperienceWithCandidate(spec, 'cw1-first', evidence());
    await repository.activateVersion(spec.experienceId, spec.versionId);
    await repository.appendEvent(curiosityEvent('evt_shared'));
    const snapshot = await repository.exportSnapshot(spec.experienceId);
    const otherBrowser = new IndexedDbCuriosityRepository({
      name: `Curiosity-Other-${crypto.randomUUID()}`,
      indexedDB: new IDBFactory(),
      IDBKeyRange,
    });
    await otherBrowser.importSnapshot(snapshot);

    await expect(otherBrowser.getExperience(spec.experienceId)).resolves.toMatchObject({
      experience: { activeVersionId: spec.versionId },
      versions: [{ id: spec.versionId, status: 'active' }],
    });
    await expect(otherBrowser.listEvents(spec.experienceId, spec.versionId)).resolves.toEqual([
      curiosityEvent('evt_shared'),
    ]);
    await otherBrowser.deleteDatabase();
  });

  it('persists accepted voice evidence without storing raw audio', async () => {
    const spec = createValidCuriositySpec();
    await repository.createExperienceWithCandidate(spec, 'cw1-first', evidence());
    await repository.activateVersion(spec.experienceId, spec.versionId);
    const voiceEvent = {
      schemaVersion: '1.0' as const,
      eventId: 'evt_voice_1',
      experienceId: spec.experienceId,
      versionId: spec.versionId,
      stageId: 'predict',
      status: 'accepted' as const,
      transcript: '我猜路灯变化更快',
      confidence: 0.92,
      occurredAt: '2026-08-15T04:01:00.000Z',
    };

    await repository.appendVoiceEvent(voiceEvent);
    await repository.appendVoiceEvent(voiceEvent);

    await expect(repository.listVoiceEvents(spec.experienceId, spec.versionId)).resolves.toEqual([
      voiceEvent,
    ]);
    await expect(
      repository.appendVoiceEvent({ ...voiceEvent, transcript: '另一句话' }),
    ).rejects.toMatchObject({ code: 'EVENT_ID_COLLISION' });
  });
});
