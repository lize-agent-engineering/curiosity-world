import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { curiosityPresentationArtifactSchema } from '@/lib/curiosity/agent-pipeline';
import { buildCuriosityArchive } from '@/lib/curiosity/archive';
import type { CuriosityEventV3 } from '@/lib/curiosity/experience-spec-v3';
import { validateCuriosityExperienceSpecV3 } from '@/lib/curiosity/experience-spec-v3';
import { FileCuriosityJobStore, type CuriosityGenerationJob } from '@/lib/curiosity/jobs';
import type {
  CuriosityExperienceAggregate,
  CuriosityVersionRecord,
} from '@/lib/curiosity/repository';
import { recoverInterruptedCuriosityJobs } from '@/lib/curiosity/server-store';
import { validV3Spec } from './v3-fixture';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

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

describe('durable Curiosity run recovery', () => {
  it('restores V3 artifacts and marks an interrupted server run failed after restart', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'curiosity-runs-'));
    temporaryDirectories.push(directory);
    const presentation = curiosityPresentationArtifactSchema.parse({
      artifactId: 'art_presentation_1',
      runId: 'run_interrupted_1',
      agentRole: 'curiosity.presentation-designer',
      schemaVersion: '3.0',
      createdAt: '2026-08-15T04:00:00.000Z',
      upstreamArtifactIds: ['art_question_1', 'art_knowledge_1', 'art_scene_1'],
      knowledgePackVersion: 'relative-motion.moon-following.v1',
      sourceArtifactIds: {
        questionModel: 'art_question_1',
        knowledgeDesign: 'art_knowledge_1',
        sceneDesign: 'art_scene_1',
      },
      narrationLibrary: [
        {
          id: 'narration_start',
          eventType: 'exploration_started',
          action: '*',
          text: '开始观察。',
        },
        { id: 'narration_end', eventType: 'exploration_ended', action: '*', text: '探索结束。' },
      ],
      discoveryPrompts: [],
      limitations: ['只比较观察方向。'],
    });
    const interrupted: CuriosityGenerationJob = {
      id: 'job_interrupted_1',
      status: 'running',
      step: 'scene',
      progress: 45,
      message: '正在生成互动',
      input: { question: '为什么月亮跟着我？', targetAge: 8 },
      createdAt: '2026-08-15T04:00:00.000Z',
      updatedAt: '2026-08-15T04:00:00.000Z',
      runId: 'run_interrupted_1',
      completedStages: ['question', 'knowledge'],
      artifacts: [presentation],
      agentRuns: [],
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
      completedStages: ['question', 'knowledge'],
      artifacts: [{ artifactId: presentation.artifactId, schemaVersion: '3.0' }],
    });
  });
});
