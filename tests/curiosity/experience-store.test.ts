import { describe, expect, it } from 'vitest';

import {
  buildSnapshotFromGenerationJobs,
  MemoryCuriosityExperienceStore,
} from '@/lib/curiosity/experience-store';
import type { CuriosityGenerationJob } from '@/lib/curiosity/jobs';
import {
  createValidCuriosityAgentRun,
  createValidCuriosityExperienceSpecV2,
  createValidCuriositySpec,
} from './fixture';

function completedJob(): CuriosityGenerationJob {
  const spec = createValidCuriositySpec();
  const experienceSpec = createValidCuriosityExperienceSpecV2();
  return {
    id: 'job_public_1',
    status: 'candidate_ready',
    step: 'awaiting_runtime_check',
    progress: 95,
    message: '等待浏览器运行检查',
    input: { question: spec.question.original, age: 8, interests: ['散步'] },
    createdAt: spec.createdAt,
    updatedAt: '2026-08-15T00:01:00.000Z',
    runId: 'run_generation_1',
    completedStages: [
      'question_modeling',
      'knowledge_design',
      'interaction_design',
      'team_assembly',
      'story_design',
      'deterministic_compile',
      'quality_review',
    ],
    artifacts: [experienceSpec],
    agentRuns: [createValidCuriosityAgentRun()],
    result: { spec, experienceSpec, specHash: 'cw1-public' },
  };
}

describe('server curiosity experience store', () => {
  it('reconstructs a public active experience from a completed real generation job', () => {
    const snapshot = buildSnapshotFromGenerationJobs('cur_moon_demo', [completedJob()]);
    expect(snapshot).toMatchObject({
      experience: { id: 'cur_moon_demo', activeVersionId: 'ver_moon_demo_1' },
      versions: [{ id: 'ver_moon_demo_1', status: 'active', specHash: 'cw1-public' }],
      events: [],
    });
  });

  it('persists an isolated copy of a synchronized browser snapshot', async () => {
    const snapshot = buildSnapshotFromGenerationJobs('cur_moon_demo', [completedJob()]);
    const store = new MemoryCuriosityExperienceStore();
    await store.write(snapshot!);
    snapshot!.experience.question = '被调用方修改';

    await expect(store.read('cur_moon_demo')).resolves.toMatchObject({
      experience: { question: '为什么月亮看起来会跟着我们？' },
    });
  });
});
