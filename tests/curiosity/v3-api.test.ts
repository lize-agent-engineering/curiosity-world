import { describe, expect, it } from 'vitest';

import {
  createCuriosityRegenerationPostHandler,
  createCuriosityRevisionPostHandler,
} from '@/lib/curiosity/api-handlers';
import { curiosityExperienceSpecV3Schema } from '@/lib/curiosity/experience-spec-v3';
import { MemoryCuriosityJobStore } from '@/lib/curiosity/jobs';
import { validV3Spec } from './v3-fixture';

const snapshot = {
  experience: {
    id: 'cur_moon_demo',
    question: validV3Spec.question.original,
    age: 8,
    createdAt: '2026-08-15T04:00:00.000Z',
    updatedAt: '2026-08-15T04:00:00.000Z',
    activeVersionId: 'ver_moon_demo_1',
  },
  versions: [
    {
      id: 'ver_moon_demo_1',
      experienceId: 'cur_moon_demo',
      revision: 1,
      createdAt: '2026-08-15T04:00:00.000Z',
      status: 'active' as const,
      spec: curiosityExperienceSpecV3Schema.parse(validV3Spec),
      artifacts: [],
      agentRuns: [],
      specHash: 'cw3-12345678',
    },
  ],
  events: [],
  voiceEvents: [],
};

function request(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('V3 revision API', () => {
  it('accepts only baseVersionId and instruction, then loads the base spec server-side', async () => {
    let received: unknown;
    const handler = createCuriosityRevisionPostHandler({
      loadExperience: async () => snapshot,
      createCandidate: async (input) => {
        received = input;
        return { spec: input.spec, specHash: 'cw3-12345678', artifacts: [], agentRuns: [] };
      },
    });
    const response = await handler(
      request('/api/curiosity/experiences/cur_moon_demo/revisions', {
        baseVersionId: 'ver_moon_demo_1',
        instruction: '提示短一点',
      }) as never,
      { params: Promise.resolve({ experienceId: 'cur_moon_demo' }) },
    );

    expect(response.status).toBe(200);
    expect(received).toMatchObject({
      baseVersionId: 'ver_moon_demo_1',
      spec: validV3Spec,
      instruction: '提示短一点',
    });
  });

  it('rejects client-submitted base specs and artifacts', async () => {
    const handler = createCuriosityRevisionPostHandler({
      loadExperience: async () => snapshot,
      createCandidate: async () => {
        throw new Error('must not run');
      },
    });
    const response = await handler(
      request('/api/curiosity/experiences/cur_moon_demo/revisions', {
        baseVersionId: 'ver_moon_demo_1',
        instruction: '提示短一点',
        baseSpec: validV3Spec,
      }) as never,
      { params: Promise.resolve({ experienceId: 'cur_moon_demo' }) },
    );
    expect(response.status).toBe(400);
  });
});

describe('V3 regeneration API', () => {
  it('loads the base version and queues a full regeneration through its dedicated endpoint', async () => {
    const store = new MemoryCuriosityJobStore();
    const handler = createCuriosityRegenerationPostHandler({
      store,
      loadExperience: async () => snapshot,
      identityFactory: () => ({
        jobId: 'job_regeneration_v3',
        runId: 'run_regeneration_v3',
        experienceId: 'cur_moon_demo',
        versionId: 'ver_moon_demo_2',
        revision: 2,
        createdAt: '2026-08-17T02:00:00.000Z',
        artifactIds: {
          question: 'art_question_regen',
          knowledge: 'art_knowledge_regen',
          scene: 'art_scene_regen',
          presentation: 'art_presentation_regen',
          quality: 'art_quality_regen',
        },
        agentRunIds: {
          question: 'agent_question_regen',
          knowledge: 'agent_knowledge_regen',
          scene: 'agent_scene_regen',
          presentation: 'agent_presentation_regen',
          quality: 'agent_quality_regen',
        },
      }),
    });
    const response = await handler(
      request('/api/curiosity/experiences/cur_moon_demo/regenerations', {
        baseVersionId: 'ver_moon_demo_1',
        targetAge: 9,
        directive: '换一种方式呈现',
      }) as never,
      { params: Promise.resolve({ experienceId: 'cur_moon_demo' }) },
    );
    expect(response.status).toBe(202);
    expect((await store.read('job_regeneration_v3'))?.status).toBe('queued');
    await expect(store.read('job_regeneration_v3')).resolves.toMatchObject({
      input: {
        question: validV3Spec.question.original,
        targetAge: 9,
        experienceId: 'cur_moon_demo',
        revision: 2,
        perspectiveDirective: '换一种方式呈现',
        preservedKnowledge: validV3Spec.knowledge,
      },
    });
  });
});
