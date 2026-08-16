import { describe, expect, it } from 'vitest';

import {
  buildSnapshotFromGenerationJobs,
  MemoryCuriosityExperienceStore,
} from '@/lib/curiosity/experience-store';
import type { CuriosityGenerationJob } from '@/lib/curiosity/jobs';
import { curiosityExperienceSpecV3Schema } from '@/lib/curiosity/experience-spec-v3';
import { validV3Spec } from './v3-fixture';

function completedJob(): CuriosityGenerationJob {
  const spec = curiosityExperienceSpecV3Schema.parse(validV3Spec);
  return {
    id: 'job_public_1',
    storeVersion: 1,
    status: 'candidate_ready',
    step: 'awaiting_runtime_check',
    progress: 95,
    message: '等待浏览器运行检查',
    input: { question: spec.question.original, targetAge: 8 },
    identity: {
      runId: 'run_generation_1',
      experienceId: 'cur_moon_demo',
      versionId: 'ver_moon_demo_1',
      revision: 1,
      createdAt: '2026-08-15T00:00:00.000Z',
      artifactIds: {
        question: 'art_question_1',
        knowledge: 'art_knowledge_1',
        scene: 'art_scene_1',
        presentation: 'art_presentation_1',
        quality: 'art_quality_1',
      },
      agentRunIds: {
        question: 'agent_question_1',
        knowledge: 'agent_knowledge_1',
        scene: 'agent_scene_1',
        presentation: 'agent_presentation_1',
        quality: 'agent_quality_1',
      },
    },
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:01:00.000Z',
    runId: 'run_generation_1',
    completedStages: ['question', 'knowledge', 'scene', 'presentation', 'quality'],
    artifacts: [],
    agentRuns: [],
    result: {
      experienceId: 'cur_moon_demo',
      versionId: 'ver_moon_demo_1',
      revision: 1,
      createdAt: '2026-08-15T00:00:00.000Z',
      spec,
      specHash: 'cw3-12345678',
    },
  };
}

describe('server curiosity experience store', () => {
  it('reconstructs a public active experience from a completed real generation job', () => {
    const snapshot = buildSnapshotFromGenerationJobs('cur_moon_demo', [completedJob()]);
    expect(snapshot).toMatchObject({
      experience: { id: 'cur_moon_demo', activeVersionId: 'ver_moon_demo_1' },
      versions: [{ id: 'ver_moon_demo_1', status: 'active', specHash: 'cw3-12345678' }],
      events: [],
    });
  });

  it('persists an isolated copy of a synchronized browser snapshot', async () => {
    const snapshot = buildSnapshotFromGenerationJobs('cur_moon_demo', [completedJob()]);
    const store = new MemoryCuriosityExperienceStore();
    await store.write(snapshot!);
    snapshot!.experience.question = '被调用方修改';

    await expect(store.read('cur_moon_demo')).resolves.toMatchObject({
      experience: { question: '为什么月亮看起来会跟着我？' },
    });
  });
});
