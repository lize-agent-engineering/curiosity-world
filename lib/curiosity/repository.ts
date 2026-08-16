import Dexie, { type Table, type Transaction } from 'dexie';
import { z } from 'zod';

import {
  CURIOSITY_EVENT_TYPES_V3,
  curiosityEventV3Schema,
  curiosityExperienceSpecV3Schema,
  migrateLegacyEvent,
  validateCuriosityExperienceSpecV3,
  type CuriosityEventV3,
  type CuriosityExperienceSpecV3,
} from './experience-spec-v3';

export type CuriosityVersionStatus = 'candidate' | 'active' | 'superseded' | 'failed';
export type CuriosityStoredArtifact = Record<string, unknown>;
export type CuriosityStoredAgentRun = Record<string, unknown>;

export interface CuriosityExperienceRecord {
  id: string;
  question: string;
  age: number;
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
  spec: CuriosityExperienceSpecV3;
  artifacts: CuriosityStoredArtifact[];
  agentRuns: CuriosityStoredAgentRun[];
  specHash: string;
  failureCode?: string;
}

export interface CreateCuriosityVersionInput {
  experienceId: string;
  versionId: string;
  revision: number;
  createdAt: string;
  spec: CuriosityExperienceSpecV3;
  artifacts: CuriosityStoredArtifact[];
  agentRuns: CuriosityStoredAgentRun[];
}

interface CuriosityEventRecord {
  eventId: string;
  experienceId: string;
  versionId: string;
  occurredAt: string;
  event: CuriosityEventV3;
  migrationFailure?: string;
}

const voiceEvidenceSchema = z
  .object({
    eventId: z.string().regex(/^evt_[a-zA-Z0-9_-]+$/),
    experienceId: z.string().regex(/^cur_[a-zA-Z0-9_-]+$/),
    versionId: z.string().regex(/^ver_[a-zA-Z0-9_-]+$/),
    stageId: z.string().min(1).max(128),
    status: z.enum(['recording', 'transcribing', 'accepted', 'unclear', 'failed']),
    transcript: z.string().trim().min(1).max(240).optional(),
    confidence: z.number().min(0).max(1).optional(),
    occurredAt: z.iso.datetime(),
  })
  .passthrough()
  .superRefine((event, context) => {
    if (event.status === 'accepted' && !event.transcript) {
      context.addIssue({
        code: 'custom',
        path: ['transcript'],
        message: 'accepted voice evidence requires transcript',
      });
    }
  });

export type CuriosityVoiceEvidence = z.infer<typeof voiceEvidenceSchema>;

interface VoiceEvidenceRecord {
  eventId: string;
  experienceId: string;
  versionId: string;
  stageId: string;
  occurredAt: string;
  event: CuriosityVoiceEvidence;
}

export interface CuriosityExperienceAggregate {
  experience: CuriosityExperienceRecord;
  versions: CuriosityVersionRecord[];
}

export interface CuriosityExperienceSnapshot {
  experience: CuriosityExperienceRecord;
  versions: CuriosityVersionRecord[];
  events: CuriosityEventV3[];
  voiceEvents: CuriosityVoiceEvidence[];
}

const experienceRecordSchema = z.strictObject({
  id: z.string().regex(/^cur_[a-zA-Z0-9_-]+$/),
  question: z.string().trim().min(1).max(240),
  age: z.number().int().min(6).max(10),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  activeVersionId: z
    .string()
    .regex(/^ver_[a-zA-Z0-9_-]+$/)
    .optional(),
});

const storedObjectSchema = z.record(z.string(), z.unknown());
const versionRecordSchema = z.strictObject({
  id: z.string().regex(/^ver_[a-zA-Z0-9_-]+$/),
  experienceId: z.string().regex(/^cur_[a-zA-Z0-9_-]+$/),
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  status: z.enum(['candidate', 'active', 'superseded', 'failed']),
  spec: curiosityExperienceSpecV3Schema,
  artifacts: z.array(storedObjectSchema).max(64),
  agentRuns: z.array(storedObjectSchema).max(64),
  specHash: z.string().regex(/^cw3-[a-f0-9]{8}$/),
  failureCode: z.string().min(1).max(128).optional(),
});

const snapshotSchema = z.strictObject({
  experience: experienceRecordSchema,
  versions: z.array(versionRecordSchema).min(1).max(48),
  events: z.array(curiosityEventV3Schema).max(2_000),
  voiceEvents: z.array(voiceEvidenceSchema).max(500),
});

export function parseCuriosityExperienceSnapshot(input: unknown): CuriosityExperienceSnapshot {
  return snapshotSchema.parse(input) as CuriosityExperienceSnapshot;
}

export interface ActiveCuriosityExperience {
  experience: CuriosityExperienceRecord;
  version: CuriosityVersionRecord;
  events: CuriosityEventV3[];
}

export interface CuriosityRepository {
  createExperienceWithCandidate(input: CreateCuriosityVersionInput): Promise<void>;
  addCandidateVersion(input: CreateCuriosityVersionInput): Promise<void>;
  activateVersion(experienceId: string, versionId: string): Promise<void>;
  markVersionFailed(experienceId: string, versionId: string, failureCode: string): Promise<void>;
  appendEvent(event: CuriosityEventV3): Promise<void>;
  listEvents(experienceId: string, versionId: string): Promise<CuriosityEventV3[]>;
  appendVoiceEvent(event: CuriosityVoiceEvidence): Promise<void>;
  listVoiceEvents(experienceId: string, versionId: string): Promise<CuriosityVoiceEvidence[]>;
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

type UnknownRecord = Record<string, unknown>;

function requiredRecord(input: unknown, code: string): UnknownRecord {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(code);
  return input as UnknownRecord;
}

function requiredString(input: unknown, code: string): string {
  if (typeof input !== 'string' || input.length === 0) throw new Error(code);
  return input;
}

function legacyKnowledge(family: string) {
  const byFamily = {
    'relative-motion': {
      claim: '观察者移动时，近处物体的观察方向通常比远处物体变化得更明显。',
      misconception: '月亮在主动追着观察者移动。',
      limitation: '场景只比较观察方向，不表示远处物体真的跟着人移动。',
    },
    'balance-support': {
      claim: '支撑位置和重物位置共同影响物体能否保持平衡。',
      misconception: '支点放在哪里都一样稳定。',
      limitation: '场景只呈现简化平衡关系，不用于真实建筑计算。',
    },
    'light-path': {
      claim: '光源、遮挡物和屏幕的位置共同影响影子的大小和位置。',
      misconception: '影子的变化与光源位置无关。',
      limitation: '场景忽略复杂反射，只呈现直线传播和遮挡。',
    },
  } as const;
  const selected = byFamily[family as keyof typeof byFamily];
  if (!selected) throw new Error(`LEGACY_KNOWLEDGE_FAMILY_UNSUPPORTED: ${family}`);
  return selected;
}

function numericVariable(experienceSpec: UnknownRecord, id: string): number {
  const variables = experienceSpec.variables;
  if (!Array.isArray(variables)) throw new Error('LEGACY_VARIABLES_MISSING');
  const variable = variables.find(
    (candidate) => requiredRecord(candidate, 'LEGACY_VARIABLE_INVALID').id === id,
  );
  const value = requiredRecord(variable, `LEGACY_VARIABLE_MISSING: ${id}`).initial;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`LEGACY_VARIABLE_INVALID: ${id}`);
  }
  return value;
}

function requiredNumber(input: unknown, code: string): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) throw new Error(code);
  return input;
}

function migrateLegacyVersion(row: UnknownRecord): CuriosityVersionRecord {
  const legacySpec = requiredRecord(row.spec, 'LEGACY_SPEC_MISSING');
  const experienceSpec = requiredRecord(row.experienceSpec, 'LEGACY_EXPERIENCE_SPEC_MISSING');
  const question = requiredRecord(legacySpec.question, 'LEGACY_QUESTION_MISSING');
  const profile = requiredRecord(legacySpec.profile, 'LEGACY_PROFILE_MISSING');
  const knowledge = requiredRecord(legacySpec.knowledge, 'LEGACY_KNOWLEDGE_MISSING');
  const presentation = requiredRecord(legacySpec.presentation, 'LEGACY_PRESENTATION_MISSING');
  const simulation = requiredRecord(legacySpec.simulation, 'LEGACY_SIMULATION_MISSING');
  const family = requiredString(knowledge.family, 'LEGACY_FAMILY_MISSING');
  const known = legacyKnowledge(family);
  const targetAge = profile.age;
  if (typeof targetAge !== 'number') throw new Error('LEGACY_AGE_MISSING');
  const instructionRows = experienceSpec.instructions;
  if (!Array.isArray(instructionRows) || instructionRows.length === 0) {
    throw new Error('LEGACY_INSTRUCTIONS_MISSING');
  }
  const instructions = instructionRows.map((entry) =>
    requiredString(
      requiredRecord(entry, 'LEGACY_INSTRUCTION_INVALID').text,
      'LEGACY_INSTRUCTION_TEXT_MISSING',
    ),
  );
  const common = {
    title: requiredString(experienceSpec.title ?? presentation.title, 'LEGACY_TITLE_MISSING'),
    instructions,
  };
  const scene =
    family === 'relative-motion'
      ? {
          type: 'relative-motion' as const,
          ...common,
          observerTravel: requiredNumber(
            simulation.observerTravel,
            'LEGACY_OBSERVER_TRAVEL_MISSING',
          ),
          nearObjectDistance: requiredNumber(
            simulation.nearObjectDistance,
            'LEGACY_NEAR_DISTANCE_MISSING',
          ),
          farObjectDistance: requiredNumber(
            simulation.farObjectDistance,
            'LEGACY_FAR_DISTANCE_MISSING',
          ),
        }
      : family === 'balance-support'
        ? {
            type: 'balance-support' as const,
            ...common,
            supportPosition: numericVariable(experienceSpec, 'support-position'),
            loadPosition: numericVariable(experienceSpec, 'load-position'),
          }
        : {
            type: 'light-path' as const,
            ...common,
            lightPosition: numericVariable(experienceSpec, 'light-position'),
            occluderPosition: numericVariable(experienceSpec, 'occluder-position'),
          };
  const packId = requiredString(knowledge.packId, 'LEGACY_PACK_ID_MISSING');
  const suggestionRows = experienceSpec.observationSuggestions;
  if (!Array.isArray(suggestionRows) || suggestionRows.length === 0) {
    throw new Error('LEGACY_OBSERVATION_SUGGESTIONS_MISSING');
  }
  const spec: CuriosityExperienceSpecV3 = {
    question: {
      original: requiredString(question.original, 'LEGACY_QUESTION_ORIGINAL_MISSING'),
      core: requiredString(question.coreQuestion, 'LEGACY_QUESTION_CORE_MISSING'),
    },
    targetAge,
    route: {
      kind: 'curated',
      family: family as 'relative-motion' | 'balance-support' | 'light-path',
    },
    knowledge: {
      source: 'curated',
      packId,
      claims: [known.claim],
      relations: [],
      misconceptions: [known.misconception],
      uncertainties: [],
      observationSuggestions: suggestionRows.map((entry) =>
        requiredString(entry, 'LEGACY_SUGGESTION_INVALID'),
      ),
      timeSensitive: false,
    },
    scene,
    narrationLibrary: [
      {
        id: 'narration_legacy_start',
        eventType: 'exploration_started',
        action: '*',
        text: requiredString(presentation.hook, 'LEGACY_HOOK_MISSING'),
      },
      {
        id: 'narration_legacy_end',
        eventType: 'exploration_ended',
        action: '*',
        text: requiredString(presentation.completion, 'LEGACY_COMPLETION_MISSING'),
      },
    ],
    discoveryPrompts: [],
    limitations: [known.limitation],
    eventRequirements: [...CURIOSITY_EVENT_TYPES_V3],
  };
  const validated = validateCuriosityExperienceSpecV3(spec);
  return versionRecord(
    {
      experienceId: requiredString(row.experienceId, 'LEGACY_EXPERIENCE_ID_MISSING'),
      versionId: requiredString(row.id, 'LEGACY_VERSION_ID_MISSING'),
      revision: Number(row.revision),
      createdAt: requiredString(row.createdAt, 'LEGACY_CREATED_AT_MISSING'),
      spec: validated.spec,
      artifacts: Array.isArray(row.artifacts) ? (row.artifacts as CuriosityStoredArtifact[]) : [],
      agentRuns: Array.isArray(row.agentRuns) ? (row.agentRuns as CuriosityStoredAgentRun[]) : [],
    },
    String(row.status) as CuriosityVersionStatus,
    row.failureCode ? String(row.failureCode) : undefined,
  );
}

function versionRecord(
  input: CreateCuriosityVersionInput,
  status: CuriosityVersionStatus = 'candidate',
  failureCode?: string,
): CuriosityVersionRecord {
  const { spec, specHash } = validateCuriosityExperienceSpecV3(input.spec);
  const row = {
    id: input.versionId,
    experienceId: input.experienceId,
    revision: input.revision,
    createdAt: input.createdAt,
    status,
    spec,
    artifacts: structuredClone(input.artifacts),
    agentRuns: structuredClone(input.agentRuns),
    specHash,
    ...(failureCode ? { failureCode } : {}),
  };
  return versionRecordSchema.parse(row) as CuriosityVersionRecord;
}

async function migrateDatabaseV4(transaction: Transaction): Promise<void> {
  const experiences = transaction.table('experiences');
  const versions = transaction.table('versions');
  const events = transaction.table('events');
  const allExperiences = (await experiences.toArray()) as UnknownRecord[];
  for (const row of allExperiences) {
    if ('interests' in row) delete row.interests;
    await experiences.put(row);
  }
  const failedVersionIds = new Set<string>();
  const versionRows = (await versions.toArray()) as UnknownRecord[];
  for (const row of versionRows) {
    try {
      const current = versionRecordSchema.safeParse(row);
      await versions.put(current.success ? current.data : migrateLegacyVersion(row));
    } catch (error) {
      const id = requiredString(row.id, 'LEGACY_VERSION_ID_MISSING');
      failedVersionIds.add(id);
      await versions.put({
        ...row,
        status: 'failed',
        failureCode: 'SCHEMA_MIGRATION_FAILED',
        migrationFailure: error instanceof Error ? error.message : 'SCHEMA_MIGRATION_FAILED',
      });
    }
  }
  const eventRows = (await events.toArray()) as UnknownRecord[];
  const seen = new Map<string, string>();
  for (const row of eventRows) {
    const eventId = requiredString(row.eventId, 'EVENT_ID_COLLISION');
    const embedded = requiredRecord(row.event, 'LEGACY_EVENT_MISSING');
    if (embedded.eventId !== eventId) {
      throw new CuriosityRepositoryError('EVENT_ID_COLLISION', '事件行与事件内容的编号不一致。');
    }
    const signature = JSON.stringify(embedded);
    const previous = seen.get(eventId);
    if (previous && previous !== signature) {
      throw new CuriosityRepositoryError(
        'EVENT_ID_COLLISION',
        '迁移中发现相同事件编号对应不同内容。',
      );
    }
    seen.set(eventId, signature);
    if (embedded.protocolVersion === '3.0') {
      await events.put({ ...row, event: curiosityEventV3Schema.parse(embedded) });
      continue;
    }
    try {
      const version = embedded.protocolVersion === '2.0' ? 'v2' : 'v1';
      const migrated = migrateLegacyEvent(version, embedded as never);
      await events.put({
        eventId: migrated.eventId,
        experienceId: migrated.experienceId,
        versionId: migrated.versionId,
        occurredAt: migrated.occurredAt,
        event: migrated,
      });
    } catch (error) {
      const versionId = String(row.versionId);
      failedVersionIds.add(versionId);
      const versionRow = (await versions.get(versionId)) as UnknownRecord | undefined;
      if (versionRow) {
        await versions.put({
          ...versionRow,
          status: 'failed',
          failureCode: 'SCHEMA_MIGRATION_FAILED',
          migrationFailure: error instanceof Error ? error.message : 'SCHEMA_MIGRATION_FAILED',
        });
      }
      await events.put({ ...row, migrationFailure: 'SCHEMA_MIGRATION_FAILED' });
    }
  }
  for (const experience of allExperiences) {
    if (failedVersionIds.has(String(experience.activeVersionId))) {
      delete experience.activeVersionId;
      await experiences.put(experience);
    }
  }
}

class CuriosityDatabase extends Dexie {
  experiences!: Table<CuriosityExperienceRecord, string>;
  versions!: Table<CuriosityVersionRecord, string>;
  events!: Table<CuriosityEventRecord, string>;
  agentRuns!: Table<CuriosityStoredAgentRun, string>;
  artifacts!: Table<CuriosityStoredArtifact, string>;
  guidanceStates!: Table<UnknownRecord, [string, string]>;
  voiceEvents!: Table<VoiceEvidenceRecord, string>;

  constructor(options: {
    name: string;
    indexedDB?: IDBFactory;
    IDBKeyRange?: typeof globalThis.IDBKeyRange;
  }) {
    super(options.name, {
      ...(options.indexedDB ? { indexedDB: options.indexedDB } : {}),
      ...(options.IDBKeyRange ? { IDBKeyRange: options.IDBKeyRange } : {}),
    });
    const base = {
      experiences: '&id, updatedAt',
      versions: '&id, experienceId, [experienceId+revision], status',
      events: '&eventId, [experienceId+versionId], occurredAt',
    };
    this.version(1).stores(base);
    this.version(2).stores({
      ...base,
      agentRuns: '&agentRunId, runId, experienceId, candidateVersionId, status',
      artifacts: '&artifactId, runId, agentRole, schemaVersion',
    });
    this.version(3).stores({
      ...base,
      agentRuns: '&agentRunId, runId, experienceId, candidateVersionId, status',
      artifacts: '&artifactId, runId, agentRole, schemaVersion',
      guidanceStates: '&[experienceId+versionId]',
      voiceEvents: '&eventId, [experienceId+versionId], stageId, occurredAt',
    });
    this.version(4)
      .stores({
        ...base,
        agentRuns: '&agentRunId, runId, experienceId, candidateVersionId, status',
        artifacts: '&artifactId, runId, agentRole, schemaVersion',
        guidanceStates: '&[experienceId+versionId]',
        voiceEvents: '&eventId, [experienceId+versionId], stageId, occurredAt',
      })
      .upgrade(migrateDatabaseV4);
  }
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

  async createExperienceWithCandidate(input: CreateCuriosityVersionInput): Promise<void> {
    const version = versionRecord(input);
    const experience: CuriosityExperienceRecord = {
      id: input.experienceId,
      question: version.spec.question.original,
      age: version.spec.targetAge,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    await this.database.transaction(
      'rw',
      this.database.experiences,
      this.database.versions,
      this.database.artifacts,
      this.database.agentRuns,
      async () => {
        await this.database.experiences.add(experience);
        await this.database.versions.add(version);
        if (version.artifacts.length > 0) await this.database.artifacts.bulkPut(version.artifacts);
        if (version.agentRuns.length > 0) await this.database.agentRuns.bulkPut(version.agentRuns);
      },
    );
  }

  async addCandidateVersion(input: CreateCuriosityVersionInput): Promise<void> {
    const version = versionRecord(input);
    await this.database.transaction(
      'rw',
      this.database.experiences,
      this.database.versions,
      this.database.artifacts,
      this.database.agentRuns,
      async () => {
        const experience = await this.database.experiences.get(input.experienceId);
        if (!experience) throw new CuriosityRepositoryError('EXPERIENCE_NOT_FOUND', '体验不存在。');
        await this.database.versions.add(version);
        if (version.artifacts.length > 0) await this.database.artifacts.bulkPut(version.artifacts);
        if (version.agentRuns.length > 0) await this.database.agentRuns.bulkPut(version.agentRuns);
        await this.database.experiences.update(input.experienceId, { updatedAt: input.createdAt });
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
        if (!experience) throw new CuriosityRepositoryError('EXPERIENCE_NOT_FOUND', '体验不存在。');
        const version = await this.database.versions.get(versionId);
        if (!version || version.experienceId !== experienceId) {
          throw new CuriosityRepositoryError('VERSION_NOT_FOUND', '候选版本不存在。');
        }
        if (version.status === 'active' && experience.activeVersionId === versionId) return;
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
          age: version.spec.targetAge,
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
        if (!experience) throw new CuriosityRepositoryError('EXPERIENCE_NOT_FOUND', '体验不存在。');
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

  async appendEvent(input: CuriosityEventV3): Promise<void> {
    const event = curiosityEventV3Schema.parse(input);
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

  async listEvents(experienceId: string, versionId: string): Promise<CuriosityEventV3[]> {
    const rows = await this.database.events
      .where('[experienceId+versionId]')
      .equals([experienceId, versionId])
      .sortBy('occurredAt');
    return rows
      .filter((row) => !row.migrationFailure)
      .map((row) => curiosityEventV3Schema.parse(row.event));
  }

  async appendVoiceEvent(input: CuriosityVoiceEvidence): Promise<void> {
    const event = voiceEvidenceSchema.parse(input) as CuriosityVoiceEvidence;
    await this.database.transaction(
      'rw',
      this.database.experiences,
      this.database.voiceEvents,
      async () => {
        const experience = await this.database.experiences.get(event.experienceId);
        if (experience?.activeVersionId !== event.versionId) {
          throw new CuriosityRepositoryError(
            'VERSION_NOT_ACTIVE',
            '语音证据只能写入当前活动版本。',
          );
        }
        const existing = await this.database.voiceEvents.get(event.eventId);
        if (existing) {
          if (JSON.stringify(existing.event) === JSON.stringify(event)) return;
          throw new CuriosityRepositoryError(
            'EVENT_ID_COLLISION',
            '相同事件编号对应了不同语音证据。',
          );
        }
        await this.database.voiceEvents.add({
          eventId: event.eventId,
          experienceId: event.experienceId,
          versionId: event.versionId,
          stageId: event.stageId,
          occurredAt: event.occurredAt,
          event,
        });
      },
    );
  }

  async listVoiceEvents(
    experienceId: string,
    versionId: string,
  ): Promise<CuriosityVoiceEvidence[]> {
    const rows = await this.database.voiceEvents
      .where('[experienceId+versionId]')
      .equals([experienceId, versionId])
      .sortBy('occurredAt');
    return rows.map((row) => voiceEvidenceSchema.parse(row.event) as CuriosityVoiceEvidence);
  }

  async getExperience(experienceId: string): Promise<CuriosityExperienceAggregate | null> {
    const experience = await this.database.experiences.get(experienceId);
    if (!experience) return null;
    const rows = await this.database.versions.where('experienceId').equals(experienceId).toArray();
    const versions = rows
      .map((row) => versionRecordSchema.safeParse(row))
      .filter((result) => result.success)
      .map((result) => result.data as CuriosityVersionRecord)
      .sort((left, right) => left.revision - right.revision);
    return { experience: experienceRecordSchema.parse(experience), versions };
  }

  async getActiveExperience(experienceId: string): Promise<ActiveCuriosityExperience | null> {
    const aggregate = await this.getExperience(experienceId);
    if (!aggregate?.experience.activeVersionId) return null;
    const version = aggregate.versions.find(
      (candidate) => candidate.id === aggregate.experience.activeVersionId,
    );
    if (!version) throw new CuriosityRepositoryError('VERSION_NOT_FOUND', '活动版本不存在。');
    return {
      experience: aggregate.experience,
      version,
      events: await this.listEvents(experienceId, version.id),
    };
  }

  async listExperiences(): Promise<CuriosityExperienceRecord[]> {
    const rows = await this.database.experiences.orderBy('updatedAt').reverse().toArray();
    return rows.map((row) => experienceRecordSchema.parse(row));
  }

  async exportSnapshot(experienceId: string): Promise<CuriosityExperienceSnapshot> {
    const aggregate = await this.getExperience(experienceId);
    if (!aggregate) throw new CuriosityRepositoryError('EXPERIENCE_NOT_FOUND', '体验不存在。');
    const versionIds = new Set(aggregate.versions.map((version) => version.id));
    const eventRows = (await this.database.events.toArray()).filter(
      (row) =>
        row.experienceId === experienceId && versionIds.has(row.versionId) && !row.migrationFailure,
    );
    const voiceRows = (await this.database.voiceEvents.toArray()).filter(
      (row) => row.experienceId === experienceId && versionIds.has(row.versionId),
    );
    return parseCuriosityExperienceSnapshot({
      ...aggregate,
      events: eventRows.map((row) => curiosityEventV3Schema.parse(row.event)),
      voiceEvents: voiceRows.map((row) => voiceEvidenceSchema.parse(row.event)),
    });
  }

  async importSnapshot(input: CuriosityExperienceSnapshot): Promise<void> {
    const snapshot = parseCuriosityExperienceSnapshot(input);
    const experienceId = snapshot.experience.id;
    const versionIds = new Set(snapshot.versions.map((version) => version.id));
    if (
      snapshot.versions.some((version) => version.experienceId !== experienceId) ||
      snapshot.events.some(
        (event) => event.experienceId !== experienceId || !versionIds.has(event.versionId),
      ) ||
      snapshot.voiceEvents.some(
        (event) => event.experienceId !== experienceId || !versionIds.has(event.versionId),
      )
    ) {
      throw new CuriosityRepositoryError('INVALID_VERSION_EVIDENCE', '快照体验绑定不一致。');
    }
    await this.database.transaction(
      'rw',
      [
        this.database.experiences,
        this.database.versions,
        this.database.events,
        this.database.artifacts,
        this.database.agentRuns,
        this.database.voiceEvents,
      ],
      async () => {
        for (const event of snapshot.events) {
          const existing = await this.database.events.get(event.eventId);
          if (existing && JSON.stringify(existing.event) !== JSON.stringify(event)) {
            throw new CuriosityRepositoryError('EVENT_ID_COLLISION', '导入快照存在事件编号碰撞。');
          }
        }
        await this.database.experiences.put(snapshot.experience);
        await this.database.versions.where('experienceId').equals(experienceId).delete();
        await this.database.events.filter((row) => row.experienceId === experienceId).delete();
        await this.database.voiceEvents.filter((row) => row.experienceId === experienceId).delete();
        await this.database.versions.bulkPut(snapshot.versions);
        const artifacts = snapshot.versions.flatMap((version) => version.artifacts);
        const agentRuns = snapshot.versions.flatMap((version) => version.agentRuns);
        if (artifacts.length > 0) await this.database.artifacts.bulkPut(artifacts);
        if (agentRuns.length > 0) await this.database.agentRuns.bulkPut(agentRuns);
        await this.database.events.bulkPut(
          snapshot.events.map((event) => ({
            eventId: event.eventId,
            experienceId: event.experienceId,
            versionId: event.versionId,
            occurredAt: event.occurredAt,
            event,
          })),
        );
        await this.database.voiceEvents.bulkPut(
          snapshot.voiceEvents.map((event) => ({
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
