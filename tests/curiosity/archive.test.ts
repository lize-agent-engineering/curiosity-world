import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { buildCuriosityArchive } from '@/lib/curiosity/archive';
import { FileCuriosityJobStore, type CuriosityGenerationJob } from '@/lib/curiosity/jobs';
import { recoverInterruptedCuriosityJobs } from '@/lib/curiosity/server-store';
import type { CuriosityEventV1 } from '@/lib/curiosity/contracts';
import type {
  CuriosityExperienceAggregate,
  CuriosityVersionRecord,
} from '@/lib/curiosity/repository';
import {
  createValidCuriosityAgentRun,
  createValidCuriosityExperienceSpecV2,
  createValidCuriositySpec,
} from './fixture';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

function versionRecord(revision: number): CuriosityVersionRecord {
  const spec = createValidCuriositySpec();
  const experienceSpec = createValidCuriosityExperienceSpecV2();
  const agentRun = createValidCuriosityAgentRun();
  spec.versionId = `ver_moon_demo_${revision}`;
  spec.revision = revision;
  experienceSpec.versionId = spec.versionId;
  experienceSpec.revision = revision;
  experienceSpec.artifactId = `art_spec_${revision}`;
  agentRun.candidateVersionId = spec.versionId;
  agentRun.outputArtifactIds = [experienceSpec.artifactId];
  return {
    id: spec.versionId,
    experienceId: spec.experienceId,
    revision,
    createdAt: spec.createdAt,
    status: revision === 2 ? 'active' : 'superseded',
    spec,
    experienceSpec,
    artifacts: [experienceSpec],
    agentRuns: [agentRun],
    specHash: `cw1-${revision}`,
  };
}

function event(
  eventId: string,
  versionId: string,
  type: CuriosityEventV1['type'],
): CuriosityEventV1 {
  return {
    source: 'curiosity-world',
    protocolVersion: '1.0',
    eventId,
    experienceId: 'cur_moon_demo',
    versionId,
    type,
    taskId: type === 'variable_changed' ? 'exploration' : 'completion',
    action: type === 'variable_changed' ? 'observer_moved' : 'finished',
    occurredAt: '2026-08-15T04:00:00.000Z',
    payload: type === 'variable_changed' ? { position: 40 } : {},
  };
}

describe('Curiosity archive projection', () => {
  it('summarizes only selected-version evidence and uses pack-bounded next questions', () => {
    const versions = [versionRecord(1), versionRecord(2)];
    const aggregate: CuriosityExperienceAggregate = {
      experience: {
        id: 'cur_moon_demo',
        question: '为什么月亮看起来会跟着我们？',
        age: 8,
        interests: ['散步'],
        createdAt: '2026-08-15T00:00:00.000Z',
        updatedAt: '2026-08-15T00:00:00.000Z',
        activeVersionId: 'ver_moon_demo_2',
      },
      versions,
    };
    const archive = buildCuriosityArchive(aggregate, 'ver_moon_demo_2', [
      event('evt_ver_1', 'ver_moon_demo_1', 'experience_completed'),
      event('evt_ver_2_move', 'ver_moon_demo_2', 'variable_changed'),
      event('evt_ver_2_done', 'ver_moon_demo_2', 'experience_completed'),
    ]);

    expect(archive.facts.every((fact) => fact.eventIds.length > 0)).toBe(true);
    expect(archive.facts.flatMap((fact) => fact.eventIds)).not.toContain('evt_ver_1');
    expect(archive.nextQuestions).toEqual(['远山为什么移动得慢？', '车窗近景为什么移动得快？']);
    expect(archive.observationSuggestions).toEqual(['散步时比较路灯和月亮。']);
  });
});

describe('durable Curiosity run recovery', () => {
  it('restores artifacts and marks an interrupted server run failed after restart', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'curiosity-runs-'));
    temporaryDirectories.push(directory);
    const experienceSpec = createValidCuriosityExperienceSpecV2();
    const interrupted: CuriosityGenerationJob = {
      id: 'job_interrupted_1',
      status: 'running',
      step: 'interaction_design',
      progress: 45,
      message: '正在生成互动',
      input: { question: '为什么月亮跟着我？', age: 8, interests: [] },
      createdAt: '2026-08-15T04:00:00.000Z',
      updatedAt: '2026-08-15T04:00:00.000Z',
      runId: 'run_interrupted_1',
      completedStages: ['question_modeling', 'knowledge_design'],
      artifacts: [experienceSpec],
      agentRuns: [createValidCuriosityAgentRun()],
      failedRole: 'curiosity.interaction-designer',
    };
    await new FileCuriosityJobStore(directory).create(interrupted);

    const reopened = new FileCuriosityJobStore(directory);
    await recoverInterruptedCuriosityJobs(reopened);

    expect(await reopened.read(interrupted.id)).toMatchObject({
      status: 'failed',
      step: 'failed',
      errorCode: 'SERVER_RESTARTED',
      failedRole: 'curiosity.interaction-designer',
      completedStages: ['question_modeling', 'knowledge_design'],
      artifacts: [{ artifactId: experienceSpec.artifactId }],
    });
  });
});
