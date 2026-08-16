import { describe, expect, it } from 'vitest';

import {
  createCuriosityRevisionCandidateV3,
  type CuriosityRevisionModels,
} from '@/lib/curiosity/revision-pipeline';
import { curiosityExperienceSpecV3Schema } from '@/lib/curiosity/experience-spec-v3';
import { validV3Spec } from './v3-fixture';

const identity = {
  runId: 'run_revision_v3',
  versionId: 'ver_revision_v3',
  createdAt: '2026-08-17T01:00:00.000Z',
  patchArtifactId: 'art_patch_v3',
  qualityArtifactId: 'art_quality_v3',
  plannerAgentRunId: 'agent_run_revision_v3',
  qualityAgentRunId: 'agent_run_revision_quality_v3',
};

const quality = {
  checks: [
    'age-fit',
    'knowledge-grounding',
    'misconception-risk',
    'scene-safety',
    'interaction-completeness',
    'narration-coverage',
    'discovery-card-quality',
  ].map((criterion) => ({ criterion, status: 'pass', findings: [] })),
  verdict: 'pass',
};

function model(outputs: unknown[]) {
  let index = 0;
  return {
    route: { providerId: 'test', modelId: 'strict-json' },
    async complete() {
      return JSON.stringify(outputs[index++] ?? outputs.at(-1));
    },
  };
}

function models(plannerOutput: unknown): CuriosityRevisionModels {
  return {
    planner: model([plannerOutput]),
    quality: model([quality]),
  } as CuriosityRevisionModels;
}

describe('V3 revision pipeline', () => {
  it('applies a white-listed patch to one V3 spec and hashes the candidate', async () => {
    const base = curiosityExperienceSpecV3Schema.parse(validV3Spec);
    const result = await createCuriosityRevisionCandidateV3(
      { baseVersionId: 'ver_moon_demo_1', spec: base, instruction: '把操作提示说得更短' },
      models({
        baseVersionId: 'ver_moon_demo_1',
        operations: [{ op: 'replace_instruction', index: 0, value: '拖动小朋友，比较远近。' }],
      }),
      identity,
    );

    expect(result.spec.scene.instructions).toEqual(['拖动小朋友，比较远近。']);
    expect(result.spec.knowledge).toEqual(base.knowledge);
    expect(result.specHash).toMatch(/^cw3-/);
    expect(result).not.toHaveProperty('runtimeSpec');
    expect(result).not.toHaveProperty('experienceSpec');
  });

  it('rejects operations outside the V3 white list', async () => {
    await expect(
      createCuriosityRevisionCandidateV3(
        {
          baseVersionId: 'ver_moon_demo_1',
          spec: curiosityExperienceSpecV3Schema.parse(validV3Spec),
          instruction: '改掉核心知识',
        },
        models({
          baseVersionId: 'ver_moon_demo_1',
          operations: [{ op: 'replace_knowledge', value: '月亮真的会追人' }],
        }),
        identity,
      ),
    ).rejects.toMatchObject({ code: 'REVISION_PATCH_INVALID' });
  });
});
