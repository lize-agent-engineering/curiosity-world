import { promises as fs } from 'fs';
import path from 'path';

import type { CuriosityGenerationJob } from './jobs';
import {
  parseCuriosityExperienceSnapshot,
  type CuriosityExperienceSnapshot,
  type CuriosityVersionRecord,
} from './repository';

export interface CuriosityExperienceStore {
  read(experienceId: string): Promise<CuriosityExperienceSnapshot | null>;
  write(snapshot: CuriosityExperienceSnapshot): Promise<void>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function assertExperienceId(experienceId: string): void {
  if (!/^cur_[a-zA-Z0-9_-]+$/.test(experienceId)) throw new Error('Invalid experience id');
}

export class MemoryCuriosityExperienceStore implements CuriosityExperienceStore {
  private readonly snapshots = new Map<string, CuriosityExperienceSnapshot>();

  async read(experienceId: string): Promise<CuriosityExperienceSnapshot | null> {
    const snapshot = this.snapshots.get(experienceId);
    return snapshot ? clone(snapshot) : null;
  }

  async write(input: CuriosityExperienceSnapshot): Promise<void> {
    const snapshot = parseCuriosityExperienceSnapshot(input);
    this.snapshots.set(snapshot.experience.id, clone(snapshot));
  }
}

export class FileCuriosityExperienceStore implements CuriosityExperienceStore {
  constructor(
    private readonly directory = path.join(process.cwd(), 'data', 'curiosity-experiences'),
  ) {}

  private file(experienceId: string): string {
    assertExperienceId(experienceId);
    return path.join(this.directory, `${experienceId}.json`);
  }

  async read(experienceId: string): Promise<CuriosityExperienceSnapshot | null> {
    try {
      return parseCuriosityExperienceSnapshot(
        JSON.parse(await fs.readFile(this.file(experienceId), 'utf8')),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async write(input: CuriosityExperienceSnapshot): Promise<void> {
    const snapshot = parseCuriosityExperienceSnapshot(input);
    const file = this.file(snapshot.experience.id);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(snapshot, null, 2), 'utf8');
    await fs.rename(temporary, file);
  }
}

export function buildSnapshotFromGenerationJobs(
  experienceId: string,
  jobs: CuriosityGenerationJob[],
): CuriosityExperienceSnapshot | null {
  const matching = jobs
    .filter(
      (job) => job.status === 'candidate_ready' && job.result?.spec.experienceId === experienceId,
    )
    .sort((left, right) => left.result!.spec.revision - right.result!.spec.revision);
  const latest = matching.at(-1);
  if (!latest?.result) return null;
  const latestVersionId = latest.result.spec.versionId;
  const versions: CuriosityVersionRecord[] = matching.map((job) => ({
    id: job.result!.spec.versionId,
    experienceId,
    revision: job.result!.spec.revision,
    createdAt: job.result!.spec.createdAt,
    status: job.result!.spec.versionId === latestVersionId ? 'active' : 'superseded',
    spec: job.result!.spec,
    experienceSpec: job.result!.experienceSpec,
    artifacts: job.artifacts,
    agentRuns: job.agentRuns,
    specHash: job.result!.specHash,
  }));
  return parseCuriosityExperienceSnapshot({
    experience: {
      id: experienceId,
      question: latest.result.spec.question.original,
      age: latest.result.spec.profile.age,
      createdAt: matching[0]!.result!.spec.createdAt,
      updatedAt: latest.updatedAt,
      activeVersionId: latestVersionId,
    },
    versions,
    events: [],
    guidanceStates: [],
    voiceEvents: [],
  });
}
