import Dexie, { type Table } from 'dexie';
import { z } from 'zod';

import {
  curiosityAgentRunSchema,
  curiosityExperienceSpecV2Schema,
  childVoiceEventV1Schema,
  type CuriosityAgentRun,
  type ChildVoiceEventV1,
  type CuriosityExperienceSpecV2,
} from './agent-contracts';
import { curiosityPipelineArtifactSchema, type CuriosityPipelineArtifact } from './agent-pipeline';

import {
  curiosityEventSchema,
  curiosityExperienceSpecSchema,
  type CuriosityEventV1,
  type CuriosityExperienceSpecV1,
} from './contracts';
import type { GuidanceState } from './guidance';

export type CuriosityVersionStatus = 'candidate' | 'active' | 'superseded' | 'failed';

export interface CuriosityExperienceRecord {
  id: string;
  question: string;
  age: number;
  interests: string[];
  createdAt: string;
  updatedAt: string;
  activeVersionId?: string;
}

export interface CuriosityVersionRecord {
  id: string;
  experienceId: string;
  revision: number;
  createdAt: string;
  status: CuriosityVersionStatus;
  spec: CuriosityExperienceSpecV1;
  experienceSpec: CuriosityExperienceSpecV2;
  artifacts: CuriosityPipelineArtifact[];
  agentRuns: CuriosityAgentRun[];
  specHash: string;
  failureCode?: string;
}

export interface CuriosityVersionEvidence {
  experienceSpec: CuriosityExperienceSpecV2;
  artifacts: CuriosityPipelineArtifact[];
  agentRuns: CuriosityAgentRun[];
}

const curiosityVersionEvidenceSchema = z.strictObject({
  experienceSpec: curiosityExperienceSpecV2Schema,
  artifacts: z.array(curiosityPipelineArtifactSchema).min(1),
  agentRuns: z.array(curiosityAgentRunSchema).min(1),
});

interface CuriosityEventRecord {
  eventId: string;
  experienceId: string;
  versionId: string;
  occurredAt: string;
  event: CuriosityEventV1;
}

interface GuidanceStateRecord extends GuidanceState {
  experienceId: string;
  versionId: string;
}

interface ChildVoiceEventRecord {
  eventId: string;
  experienceId: string;
  versionId: string;
  stageId: string;
  occurredAt: string;
  event: ChildVoiceEventV1;
}

export interface CuriosityExperienceAggregate {
  experience: CuriosityExperienceRecord;
  versions: CuriosityVersionRecord[];
}

export interface CuriosityExperienceSnapshot {
  experience: CuriosityExperienceRecord;
  versions: CuriosityVersionRecord[];
  events: CuriosityEventV1[];
  guidanceStates: Array<{ versionId: string; state: GuidanceState }>;
  voiceEvents: ChildVoiceEventV1[];
}

const curiosityExperienceRecordSchema = z.strictObject({
  id: z.string().regex(/^cur_[a-zA-Z0-9_-]+$/),
  question: z.string().min(1).max(240),
  age: z.number().int().min(6).max(10),
  interests: z.array(z.string().min(1).max(30)).max(5),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  activeVersionId: z
    .string()
    .regex(/^ver_[a-zA-Z0-9_-]+$/)
    .optional(),
});

const curiosityVersionRecordSchema = z.strictObject({
  id: z.string().regex(/^ver_[a-zA-Z0-9_-]+$/),
  experienceId: z.string().regex(/^cur_[a-zA-Z0-9_-]+$/),
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  status: z.enum(['candidate', 'active', 'superseded', 'failed']),
  spec: curiosityExperienceSpecSchema,
  experienceSpec: curiosityExperienceSpecV2Schema,
  artifacts: z.array(curiosityPipelineArtifactSchema).min(1).max(32),
  agentRuns: z.array(curiosityAgentRunSchema).min(1).max(32),
  specHash: z.string().min(1).max(256),
  failureCode: z.string().min(1).max(128).optional(),
});

const guidanceStateSchema = z.strictObject({
  storyArtifactId: z.string().min(1).max(128),
  stageId: z.string().min(1).max(128),
  hintLevel: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  completedStageIds: z.array(z.string().min(1).max(128)).max(32),
  lastTriggerEventIds: z.array(z.string().min(1).max(128)).max(128),
});

const curiosityExperienceSnapshotSchema = z.strictObject({
  experience: curiosityExperienceRecordSchema,
  versions: z.array(curiosityVersionRecordSchema).min(1).max(24),
  events: z.array(curiosityEventSchema).max(2_000),
  guidanceStates: z
    .array(
      z.strictObject({
        versionId: z.string().regex(/^ver_[a-zA-Z0-9_-]+$/),
        state: guidanceStateSchema,
      }),
    )
    .max(24),
  voiceEvents: z.array(childVoiceEventV1Schema).max(500),
});

export function parseCuriosityExperienceSnapshot(input: unknown): CuriosityExperienceSnapshot {
  return curiosityExperienceSnapshotSchema.parse(input);
}

export interface ActiveCuriosityExperience {
  experience: CuriosityExperienceRecord;
  version: CuriosityVersionRecord;
  events: CuriosityEventV1[];
}

export interface CuriosityRepository {
  createExperienceWithCandidate(
    spec: CuriosityExperienceSpecV1,
    specHash: string,
    evidence: CuriosityVersionEvidence,
  ): Promise<void>;
  addCandidateVersion(
    spec: CuriosityExperienceSpecV1,
    specHash: string,
    evidence: CuriosityVersionEvidence,
  ): Promise<void>;
  activateVersion(experienceId: string, versionId: string): Promise<void>;
  markVersionFailed(experienceId: string, versionId: string, failureCode: string): Promise<void>;
  appendEvent(event: CuriosityEventV1): Promise<void>;
  listEvents(experienceId: string, versionId: string): Promise<CuriosityEventV1[]>;
  saveGuidanceState(experienceId: string, versionId: string, state: GuidanceState): Promise<void>;
  getGuidanceState(experienceId: string, versionId: string): Promise<GuidanceState | null>;
  appendVoiceEvent(event: ChildVoiceEventV1): Promise<void>;
  listVoiceEvents(experienceId: string, versionId: string): Promise<ChildVoiceEventV1[]>;
  getExperience(experienceId: string): Promise<CuriosityExperienceAggregate | null>;
  getActiveExperience(experienceId: string): Promise<ActiveCuriosityExperience | null>;
  listExperiences(): Promise<CuriosityExperienceRecord[]>;
  exportSnapshot(experienceId: string): Promise<CuriosityExperienceSnapshot>;
  importSnapshot(snapshot: CuriosityExperienceSnapshot): Promise<void>;
}

export type CuriosityRepositoryErrorCode =
  | 'EXPERIENCE_NOT_FOUND'
  | 'VERSION_NOT_FOUND'
  | 'VERSION_NOT_CANDIDATE'
  | 'VERSION_NOT_ACTIVE'
  | 'EVENT_ID_COLLISION'
  | 'INVALID_VERSION_EVIDENCE';

export class CuriosityRepositoryError extends Error {
  constructor(
    readonly code: CuriosityRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CuriosityRepositoryError';
  }
}

class CuriosityDatabase extends Dexie {
  experiences!: Table<CuriosityExperienceRecord, string>;
  versions!: Table<CuriosityVersionRecord, string>;
  events!: Table<CuriosityEventRecord, string>;
  agentRuns!: Table<CuriosityAgentRun, string>;
  artifacts!: Table<CuriosityPipelineArtifact, string>;
  guidanceStates!: Table<GuidanceStateRecord, [string, string]>;
  voiceEvents!: Table<ChildVoiceEventRecord, string>;

  constructor(options: {
    name: string;
    indexedDB?: IDBFactory;
    IDBKeyRange?: typeof globalThis.IDBKeyRange;
  }) {
    super(options.name, {
      ...(options.indexedDB ? { indexedDB: options.indexedDB } : {}),
      ...(options.IDBKeyRange ? { IDBKeyRange: options.IDBKeyRange } : {}),
    });
    this.version(1).stores({
      experiences: '&id, updatedAt',
      versions: '&id, experienceId, [experienceId+revision], status',
      events: '&eventId, [experienceId+versionId], occurredAt',
    });
    this.version(2).stores({
      experiences: '&id, updatedAt',
      versions: '&id, experienceId, [experienceId+revision], status',
      events: '&eventId, [experienceId+versionId], occurredAt',
      agentRuns: '&agentRunId, runId, experienceId, candidateVersionId, status',
      artifacts: '&artifactId, runId, agentRole, schemaVersion',
    });
    this.version(3).stores({
      experiences: '&id, updatedAt',
      versions: '&id, experienceId, [experienceId+revision], status',
      events: '&eventId, [experienceId+versionId], occurredAt',
      agentRuns: '&agentRunId, runId, experienceId, candidateVersionId, status',
      artifacts: '&artifactId, runId, agentRole, schemaVersion',
      guidanceStates: '&[experienceId+versionId]',
      voiceEvents: '&eventId, [experienceId+versionId], stageId, occurredAt',
    });
  }
}

function parseEvidence(
  spec: CuriosityExperienceSpecV1,
  input: CuriosityVersionEvidence,
): CuriosityVersionEvidence {
  const evidence = curiosityVersionEvidenceSchema.parse(input);
  if (
    evidence.experienceSpec.experienceId !== spec.experienceId ||
    evidence.experienceSpec.versionId !== spec.versionId ||
    evidence.experienceSpec.revision !== spec.revision ||
    !evidence.artifacts.some(
      (artifact) => artifact.artifactId === evidence.experienceSpec.artifactId,
    ) ||
    evidence.agentRuns.some(
      (run) => run.experienceId !== spec.experienceId || run.candidateVersionId !== spec.versionId,
    )
  ) {
    throw new CuriosityRepositoryError(
      'INVALID_VERSION_EVIDENCE',
      '候选版本与 V2 规格、产物或 Agent 运行记录不一致。',
    );
  }
  return evidence;
}

function versionRecord(
  spec: CuriosityExperienceSpecV1,
  specHash: string,
  evidence: CuriosityVersionEvidence,
): CuriosityVersionRecord {
  return {
    id: spec.versionId,
    experienceId: spec.experienceId,
    revision: spec.revision,
    createdAt: spec.createdAt,
    status: 'candidate',
    spec,
    ...evidence,
    specHash,
  };
}

export class IndexedDbCuriosityRepository implements CuriosityRepository {
  private readonly database: CuriosityDatabase;

  constructor(
    options: {
      name?: string;
      indexedDB?: IDBFactory;
      IDBKeyRange?: typeof globalThis.IDBKeyRange;
    } = {},
  ) {
    this.database = new CuriosityDatabase({
      name: options.name ?? 'Curiosity-World',
      ...(options.indexedDB ? { indexedDB: options.indexedDB } : {}),
      ...(options.IDBKeyRange ? { IDBKeyRange: options.IDBKeyRange } : {}),
    });
  }

  async createExperienceWithCandidate(
    input: CuriosityExperienceSpecV1,
    specHash: string,
    inputEvidence: CuriosityVersionEvidence,
  ): Promise<void> {
    const spec = curiosityExperienceSpecSchema.parse(input);
    const evidence = parseEvidence(spec, inputEvidence);
    const experience: CuriosityExperienceRecord = {
      id: spec.experienceId,
      question: spec.question.original,
      age: spec.profile.age,
      interests: [...spec.profile.interests],
      createdAt: spec.createdAt,
      updatedAt: spec.createdAt,
    };
    await this.database.transaction(
      'rw',
      this.database.experiences,
      this.database.versions,
      this.database.artifacts,
      this.database.agentRuns,
      () =>
        Promise.all([
          this.database.experiences.add(experience),
          this.database.versions.add(versionRecord(spec, specHash, evidence)),
          this.database.artifacts.bulkPut(evidence.artifacts),
          this.database.agentRuns.bulkPut(evidence.agentRuns),
        ]),
    );
  }

  async addCandidateVersion(
    input: CuriosityExperienceSpecV1,
    specHash: string,
    inputEvidence: CuriosityVersionEvidence,
  ): Promise<void> {
    const spec = curiosityExperienceSpecSchema.parse(input);
    const evidence = parseEvidence(spec, inputEvidence);
    await this.database.transaction(
      'rw',
      this.database.experiences,
      this.database.versions,
      this.database.artifacts,
      this.database.agentRuns,
      async () => {
        const experience = await this.database.experiences.get(spec.experienceId);
        if (!experience) {
          throw new CuriosityRepositoryError('EXPERIENCE_NOT_FOUND', '体验不存在。');
        }
        await this.database.versions.add(versionRecord(spec, specHash, evidence));
        await this.database.artifacts.bulkPut(evidence.artifacts);
        await this.database.agentRuns.bulkPut(evidence.agentRuns);
        await this.database.experiences.update(spec.experienceId, { updatedAt: spec.createdAt });
      },
    );
  }

  async activateVersion(experienceId: string, versionId: string): Promise<void> {
    await this.database.transaction(
      'rw',
      this.database.experiences,
      this.database.versions,
      async () => {
        const experience = await this.database.experiences.get(experienceId);
        if (!experience) {
          throw new CuriosityRepositoryError('EXPERIENCE_NOT_FOUND', '体验不存在。');
        }
        const version = await this.database.versions.get(versionId);
        if (!version || version.experienceId !== experienceId) {
          throw new CuriosityRepositoryError('VERSION_NOT_FOUND', '候选版本不存在。');
        }
        if (version.status !== 'candidate' && version.status !== 'superseded') {
          throw new CuriosityRepositoryError('VERSION_NOT_CANDIDATE', '该版本不能被激活。');
        }
        if (experience.activeVersionId) {
          await this.database.versions.update(experience.activeVersionId, { status: 'superseded' });
        }
        await this.database.versions.update(versionId, {
          status: 'active',
          failureCode: undefined,
        });
        await this.database.experiences.update(experienceId, {
          activeVersionId: versionId,
          age: version.spec.profile.age,
          interests: [...version.spec.profile.interests],
          updatedAt: new Date().toISOString(),
        });
      },
    );
  }

  async markVersionFailed(
    experienceId: string,
    versionId: string,
    failureCode: string,
  ): Promise<void> {
    await this.database.transaction(
      'rw',
      this.database.experiences,
      this.database.versions,
      async () => {
        const experience = await this.database.experiences.get(experienceId);
        if (!experience) {
          throw new CuriosityRepositoryError('EXPERIENCE_NOT_FOUND', '体验不存在。');
        }
        const version = await this.database.versions.get(versionId);
        if (!version || version.experienceId !== experienceId) {
          throw new CuriosityRepositoryError('VERSION_NOT_FOUND', '候选版本不存在。');
        }
        if (version.status !== 'candidate') {
          throw new CuriosityRepositoryError('VERSION_NOT_CANDIDATE', '只有候选版本可以标记失败。');
        }
        await this.database.versions.update(versionId, { status: 'failed', failureCode });
        await this.database.experiences.update(experienceId, {
          updatedAt: new Date().toISOString(),
        });
      },
    );
  }

  async appendEvent(input: CuriosityEventV1): Promise<void> {
    const event = curiosityEventSchema.parse(input);
    await this.database.transaction(
      'rw',
      this.database.experiences,
      this.database.versions,
      this.database.events,
      async () => {
        const experience = await this.database.experiences.get(event.experienceId);
        if (experience?.activeVersionId !== event.versionId) {
          throw new CuriosityRepositoryError('VERSION_NOT_ACTIVE', '事件只能写入当前活动版本。');
        }
        const existing = await this.database.events.get(event.eventId);
        if (existing) {
          if (JSON.stringify(existing.event) === JSON.stringify(event)) return;
          throw new CuriosityRepositoryError('EVENT_ID_COLLISION', '相同事件编号对应了不同内容。');
        }
        await this.database.events.add({
          eventId: event.eventId,
          experienceId: event.experienceId,
          versionId: event.versionId,
          occurredAt: event.occurredAt,
          event,
        });
      },
    );
  }

  async listEvents(experienceId: string, versionId: string): Promise<CuriosityEventV1[]> {
    const rows = await this.database.events
      .where('[experienceId+versionId]')
      .equals([experienceId, versionId])
      .sortBy('occurredAt');
    return rows.map((row) => row.event);
  }

  async saveGuidanceState(
    experienceId: string,
    versionId: string,
    state: GuidanceState,
  ): Promise<void> {
    const experience = await this.database.experiences.get(experienceId);
    if (experience?.activeVersionId !== versionId) {
      throw new CuriosityRepositoryError('VERSION_NOT_ACTIVE', '引导状态只能写入当前活动版本。');
    }
    await this.database.guidanceStates.put({ experienceId, versionId, ...structuredClone(state) });
  }

  async getGuidanceState(experienceId: string, versionId: string): Promise<GuidanceState | null> {
    const stored = await this.database.guidanceStates.get([experienceId, versionId]);
    if (!stored) return null;
    const { experienceId: _experienceId, versionId: _versionId, ...state } = stored;
    return state;
  }

  async appendVoiceEvent(input: ChildVoiceEventV1): Promise<void> {
    const event = childVoiceEventV1Schema.parse(input);
    const experience = await this.database.experiences.get(event.experienceId);
    if (experience?.activeVersionId !== event.versionId) {
      throw new CuriosityRepositoryError('VERSION_NOT_ACTIVE', '语音事件只能写入当前活动版本。');
    }
    const existing = await this.database.voiceEvents.get(event.eventId);
    if (existing) {
      if (JSON.stringify(existing.event) === JSON.stringify(event)) return;
      throw new CuriosityRepositoryError('EVENT_ID_COLLISION', '相同事件编号对应了不同语音证据。');
    }
    await this.database.voiceEvents.add({
      eventId: event.eventId,
      experienceId: event.experienceId,
      versionId: event.versionId,
      stageId: event.stageId,
      occurredAt: event.occurredAt,
      event,
    });
  }

  async listVoiceEvents(experienceId: string, versionId: string): Promise<ChildVoiceEventV1[]> {
    const rows = await this.database.voiceEvents
      .where('[experienceId+versionId]')
      .equals([experienceId, versionId])
      .sortBy('occurredAt');
    return rows.map((row) => childVoiceEventV1Schema.parse(row.event));
  }

  async getExperience(experienceId: string): Promise<CuriosityExperienceAggregate | null> {
    const experience = await this.database.experiences.get(experienceId);
    if (!experience) return null;
    const versions = await this.database.versions
      .where('experienceId')
      .equals(experienceId)
      .toArray();
    const validatedVersions = versions.map((version) => {
      const spec = curiosityExperienceSpecSchema.parse(version.spec);
      const evidence = parseEvidence(spec, {
        experienceSpec: version.experienceSpec,
        artifacts: version.artifacts,
        agentRuns: version.agentRuns,
      });
      return { ...version, spec, ...evidence };
    });
    const artifactRows = await this.database.artifacts.toArray();
    const agentRunRows = await this.database.agentRuns.toArray();
    artifactRows.forEach((artifact) => curiosityPipelineArtifactSchema.parse(artifact));
    agentRunRows.forEach((run) => curiosityAgentRunSchema.parse(run));
    validatedVersions.sort((left, right) => left.revision - right.revision);
    return { experience, versions: validatedVersions };
  }

  async getActiveExperience(experienceId: string): Promise<ActiveCuriosityExperience | null> {
    const aggregate = await this.getExperience(experienceId);
    if (!aggregate?.experience.activeVersionId) return null;
    const experience = aggregate.experience;
    const version = aggregate.versions.find(
      (candidate) => candidate.id === experience.activeVersionId,
    );
    if (!version) {
      throw new CuriosityRepositoryError('VERSION_NOT_FOUND', '活动版本不存在。');
    }
    return {
      experience,
      version,
      events: await this.listEvents(experienceId, version.id),
    };
  }

  async listExperiences(): Promise<CuriosityExperienceRecord[]> {
    return this.database.experiences.orderBy('updatedAt').reverse().toArray();
  }

  async exportSnapshot(experienceId: string): Promise<CuriosityExperienceSnapshot> {
    const aggregate = await this.getExperience(experienceId);
    if (!aggregate) {
      throw new CuriosityRepositoryError('EXPERIENCE_NOT_FOUND', '体验不存在。');
    }
    const versionIds = new Set(aggregate.versions.map((version) => version.id));
    const eventRows = (await this.database.events.toArray()).filter(
      (row) => row.experienceId === experienceId && versionIds.has(row.versionId),
    );
    const guidanceRows = (await this.database.guidanceStates.toArray()).filter(
      (row) => row.experienceId === experienceId && versionIds.has(row.versionId),
    );
    const voiceRows = (await this.database.voiceEvents.toArray()).filter(
      (row) => row.experienceId === experienceId && versionIds.has(row.versionId),
    );
    return {
      ...aggregate,
      events: eventRows.map((row) => curiosityEventSchema.parse(row.event)),
      guidanceStates: guidanceRows.map(({ versionId, experienceId: _experienceId, ...state }) => ({
        versionId,
        state,
      })),
      voiceEvents: voiceRows.map((row) => childVoiceEventV1Schema.parse(row.event)),
    };
  }

  async importSnapshot(snapshot: CuriosityExperienceSnapshot): Promise<void> {
    snapshot = parseCuriosityExperienceSnapshot(snapshot);
    const experienceId = snapshot.experience.id;
    const versions = snapshot.versions.map((version) => {
      const spec = curiosityExperienceSpecSchema.parse(version.spec);
      if (version.experienceId !== experienceId || spec.experienceId !== experienceId) {
        throw new CuriosityRepositoryError('INVALID_VERSION_EVIDENCE', '快照体验绑定不一致。');
      }
      const evidence = parseEvidence(spec, {
        experienceSpec: version.experienceSpec,
        artifacts: version.artifacts,
        agentRuns: version.agentRuns,
      });
      return { ...version, spec, ...evidence };
    });
    const versionIds = new Set(versions.map((version) => version.id));
    const events = snapshot.events.map((event) => curiosityEventSchema.parse(event));
    const voiceEvents = snapshot.voiceEvents.map((event) => childVoiceEventV1Schema.parse(event));
    if (
      events.some(
        (event) => event.experienceId !== experienceId || !versionIds.has(event.versionId),
      ) ||
      voiceEvents.some(
        (event) => event.experienceId !== experienceId || !versionIds.has(event.versionId),
      )
    ) {
      throw new CuriosityRepositoryError('INVALID_VERSION_EVIDENCE', '快照事件绑定不一致。');
    }
    await this.database.transaction(
      'rw',
      [
        this.database.experiences,
        this.database.versions,
        this.database.events,
        this.database.artifacts,
        this.database.agentRuns,
        this.database.guidanceStates,
        this.database.voiceEvents,
      ],
      async () => {
        await this.database.experiences.put({ ...snapshot.experience });
        await this.database.versions.where('experienceId').equals(experienceId).delete();
        await this.database.events.filter((row) => row.experienceId === experienceId).delete();
        await this.database.guidanceStates
          .filter((row) => row.experienceId === experienceId)
          .delete();
        await this.database.voiceEvents.filter((row) => row.experienceId === experienceId).delete();
        await this.database.versions.bulkPut(versions);
        await this.database.artifacts.bulkPut(versions.flatMap((version) => version.artifacts));
        await this.database.agentRuns.bulkPut(versions.flatMap((version) => version.agentRuns));
        await this.database.events.bulkPut(
          events.map((event) => ({
            eventId: event.eventId,
            experienceId: event.experienceId,
            versionId: event.versionId,
            occurredAt: event.occurredAt,
            event,
          })),
        );
        await this.database.guidanceStates.bulkPut(
          snapshot.guidanceStates.map(({ versionId, state }) => ({
            experienceId,
            versionId,
            ...state,
          })),
        );
        await this.database.voiceEvents.bulkPut(
          voiceEvents.map((event) => ({
            eventId: event.eventId,
            experienceId: event.experienceId,
            versionId: event.versionId,
            stageId: event.stageId,
            occurredAt: event.occurredAt,
            event,
          })),
        );
      },
    );
  }

  async deleteDatabase(): Promise<void> {
    this.database.close();
    await this.database.delete();
  }
}
