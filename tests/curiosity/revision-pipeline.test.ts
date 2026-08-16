import { describe, expect, it } from 'vitest';

import {
  createCuriosityRevisionCandidateV2,
  type CuriosityRevisionModels,
} from '@/lib/curiosity/revision-pipeline';
import type { CuriosityExperienceSpecV2 } from '@/lib/curiosity/agent-contracts';
import { createValidCuriositySpec } from './fixture';

const createdAt = '2026-08-15T09:00:00.000Z';

function baseExperienceSpec(): CuriosityExperienceSpecV2 {
  return {
    artifactId: 'art_spec_1',
    runId: 'run_generation_1',
    agentRole: 'curiosity.interaction-designer',
    schemaVersion: '2.0',
    createdAt,
    upstreamArtifactIds: ['art_question_1', 'art_knowledge_1', 'art_interaction_1'],
    knowledgePackVersion: '1.0.0',
    experienceId: 'cur_moon_demo',
    versionId: 'ver_moon_demo_1',
    revision: 1,
    profile: { age: 8, interests: ['散步'] },
    sourceArtifactIds: {
      questionModel: 'art_question_1',
      knowledgeDesign: 'art_knowledge_1',
      interactionDesign: 'art_interaction_1',
    },
    knowledge: {
      family: 'relative-motion',
      packId: 'relative-motion.moon-following.v1',
      packVersion: '1.0.0',
    },
    title: '月亮为什么像在跟着我？',
    visualTheme: '安静的蓝色夜空',
    observationSuggestions: ['散步时比较路灯和月亮。'],
    instructions: [
      { taskId: 'prediction', kind: 'prediction', text: '先猜一猜' },
      { taskId: 'exploration', kind: 'exploration', text: '拖动看看' },
      { taskId: 'guided-discovery', kind: 'guided-discovery', text: '比较远和近' },
      { taskId: 'transfer', kind: 'transfer', text: '换个距离试试' },
      { taskId: 'explanation', kind: 'explanation', text: '选一个说给家长听' },
    ],
    variables: [
      { id: 'observer-position', min: -80, max: 80, initial: 0 },
      { id: 'object-distance', min: 20, max: 400, initial: 200 },
    ],
    primitives: ['move-observer', 'compare-near-far'],
    eventRequirements: [
      'experience_started',
      'prediction_submitted',
      'variable_changed',
      'feedback_shown',
      'transfer_attempted',
      'explanation_selected',
      'experience_completed',
    ],
  };
}

function qualityOutput(status: 'pass' | 'reject' = 'pass') {
  const criteria = [
    'age-fit',
    'knowledge-grounding',
    'misconception-risk',
    'scene-safety',
    'interaction-completeness',
    'narration-coverage',
    'discovery-card-quality',
  ];
  return {
    checks: criteria.map((criterion, index) => ({
      criterion,
      status: index === 0 ? status : 'pass',
      findings: index === 0 && status === 'reject' ? ['年龄表达不通过'] : [],
    })),
    verdict: status,
  };
}

function models(
  impact: unknown,
  patch: unknown,
  quality: unknown = qualityOutput(),
): CuriosityRevisionModels {
  const responses = [impact, patch];
  return {
    planner: {
      route: { providerId: 'test', modelId: 'revision-planner' },
      complete: async () => JSON.stringify(responses.shift()),
    },
    quality: {
      route: { providerId: 'test', modelId: 'quality-reviewer' },
      complete: async () => JSON.stringify(quality),
    },
  };
}

const identity = {
  runId: 'run_revision_1',
  versionId: 'ver_moon_demo_2',
  createdAt: '2026-08-15T09:05:00.000Z',
  impactArtifactId: 'art_impact_1',
  patchArtifactId: 'art_patch_1',
  specArtifactId: 'art_spec_2',
  qualityArtifactId: 'art_quality_revision_1',
  plannerAgentRunId: 'agent_run_revision_1',
  qualityAgentRunId: 'agent_run_revision_quality_1',
};

function validImpact() {
  return {
    baseVersionId: 'ver_moon_demo_1',
    summary: '降低年龄并缩短探索指令。',
    changedFields: ['profile.age', 'presentation.instructions'],
    preservedFields: ['knowledge.packId', 'knowledge.packVersion'],
    knowledgeFamily: 'relative-motion',
  };
}

describe('Curiosity controlled revision pipeline', () => {
  it('gives every revision phase its strict provider output schema', async () => {
    const suppliedSchemas: unknown[] = [];
    const systemPrompts: string[] = [];
    const userPrompts: string[] = [];
    const revisionModels = models(
      validImpact(),
      {
        operations: [
          { op: 'set_age', age: 10 },
          { op: 'replace_instruction', taskId: 'exploration', value: '拖动看看' },
        ],
      },
      qualityOutput(),
    );
    const plannerComplete = revisionModels.planner.complete;
    revisionModels.planner.complete = async (input) => {
      suppliedSchemas.push(input.schema);
      systemPrompts.push(input.system ?? '');
      userPrompts.push(input.prompt);
      return plannerComplete(input);
    };
    const qualityComplete = revisionModels.quality.complete;
    revisionModels.quality.complete = async (input) => {
      suppliedSchemas.push(input.schema);
      systemPrompts.push(input.system ?? '');
      userPrompts.push(input.prompt);
      return qualityComplete(input);
    };

    await createCuriosityRevisionCandidateV2(
      {
        experienceSpec: baseExperienceSpec(),
        runtimeSpec: createValidCuriositySpec(),
        sourceArtifacts: [],
        instruction: '改成适合 6 岁',
      },
      revisionModels,
      identity,
    );

    expect(suppliedSchemas).toHaveLength(3);
    expect(suppliedSchemas.every(Boolean)).toBe(true);
    const patchSchema = suppliedSchemas[1] as {
      safeParse(value: unknown): { success: boolean };
    };
    expect(
      patchSchema.safeParse({
        operations: [{ op: 'replace_observation_suggestion', index: 0, value: '桌上比较远近。' }],
      }).success,
    ).toBe(false);
    expect(
      patchSchema.safeParse({
        operations: [{ op: 'replace_instruction', taskId: 'exploration', value: '拖动看看' }],
      }).success,
    ).toBe(true);
    expect(
      patchSchema.safeParse({
        operations: [{ op: 'replace_observation_suggestion', index: 4, value: '越过现有建议。' }],
      }).success,
    ).toBe(false);
    expect(
      patchSchema.safeParse({
        operations: [{ op: 'replace_visual_theme', value: '不在影响分析里的主题修改' }],
      }).success,
    ).toBe(false);
    expect(systemPrompts.every((prompt) => prompt.includes('"additionalProperties":false'))).toBe(
      true,
    );
    expect(userPrompts[1]).toContain('"coverEveryChangedField":true');
    expect(userPrompts[1]).toContain('"replace_instruction":"presentation.instructions"');
    expect(systemPrompts[2]).toContain('"maxItems":2');
    expect(systemPrompts[0]).toContain('换角度重讲');
    expect(systemPrompts[1]).toContain('换角度重讲');
    expect(systemPrompts[2]).toContain('儿童体验质检');
    expect(userPrompts[2]).toContain('"exactlyOnePerCriterion":true');
    expect(userPrompts[2]).toContain('"maxFindingsPerCriterion":2');
    expect(userPrompts[2]).toContain('"candidateSpec"');
    expect(userPrompts[2]).not.toContain('"sourceArtifacts"');
  });

  it('requires patch operations to cover every field declared by impact analysis', async () => {
    await expect(
      createCuriosityRevisionCandidateV2(
        {
          experienceSpec: baseExperienceSpec(),
          runtimeSpec: createValidCuriositySpec(),
          sourceArtifacts: [],
          instruction: '减少文字，并加入桌上远近实验',
        },
        models(
          {
            ...validImpact(),
            changedFields: ['presentation.instructions', 'observationSuggestions'],
          },
          {
            operations: [{ op: 'replace_instruction', taskId: 'exploration', value: '拖动看看' }],
          },
        ),
        identity,
      ),
    ).rejects.toMatchObject({ code: 'REVISION_SCOPE_VIOLATION' });
  });

  it('maps provider failures to the active revision phase', async () => {
    const revisionModels = models(validImpact(), { operations: [{ op: 'set_age', age: 6 }] });
    revisionModels.planner.complete = async () => {
      throw new Error('provider object generation failed');
    };

    await expect(
      createCuriosityRevisionCandidateV2(
        {
          experienceSpec: baseExperienceSpec(),
          runtimeSpec: createValidCuriositySpec(),
          sourceArtifacts: [],
          instruction: '改成适合 6 岁',
        },
        revisionModels,
        identity,
      ),
    ).rejects.toMatchObject({ code: 'REVISION_IMPACT_INVALID' });
  });

  it('rejects a cross-age-band patch that would require story regeneration', async () => {
    await expect(
      createCuriosityRevisionCandidateV2(
        {
          experienceSpec: baseExperienceSpec(),
          runtimeSpec: createValidCuriositySpec(),
          sourceArtifacts: [],
          instruction: '改成适合 6 岁',
        },
        models(validImpact(), { operations: [{ op: 'set_age', age: 6 }] }),
        identity,
      ),
    ).rejects.toMatchObject({ code: 'REVISION_SCOPE_VIOLATION' });
  });

  it('creates impact analysis before applying an allow-listed immutable patch', async () => {
    const baseSpec = baseExperienceSpec();
    const runtimeSpec = createValidCuriositySpec();
    const result = await createCuriosityRevisionCandidateV2(
      {
        experienceSpec: baseSpec,
        runtimeSpec,
        sourceArtifacts: [],
        instruction: '改成适合 6 岁，探索指令再短一点',
      },
      models(validImpact(), {
        operations: [
          { op: 'set_age', age: 10 },
          { op: 'replace_instruction', taskId: 'exploration', value: '拖动看看' },
        ],
      }),
      identity,
    );

    expect(result.impact.changedFields).toEqual(['profile.age', 'presentation.instructions']);
    expect(result.impact.preservedFields).toContain('knowledge.packId');
    expect(result.spec.profile.age).toBe(10);
    expect(result.runtimeSpec.profile.age).toBe(10);
    expect(result.spec.versionId).toBe('ver_moon_demo_2');
    expect(result.compiled.html).toContain('data-curiosity-runtime');
    expect(baseSpec.versionId).toBe('ver_moon_demo_1');
    expect(runtimeSpec.profile.age).toBe(8);
  });

  it('reports the deterministic reason a revision candidate is invalid', async () => {
    await expect(
      createCuriosityRevisionCandidateV2(
        {
          experienceSpec: baseExperienceSpec(),
          runtimeSpec: createValidCuriositySpec(),
          sourceArtifacts: [],
          instruction: '替换成过长指令',
        },
        models(
          { ...validImpact(), changedFields: ['variables'] },
          {
            operations: [
              {
                op: 'set_variable',
                variableId: 'object-distance',
                value: 20,
              },
            ],
          },
        ),
        identity,
      ),
    ).rejects.toThrow('simulation.farObjectDistance:too_small');
  });

  it('rejects cross-family impact before requesting a patch', async () => {
    let calls = 0;
    const revisionModels = models(
      {
        ...validImpact(),
        changedFields: ['knowledge.packId'],
        preservedFields: ['knowledge.packVersion'],
        knowledgeFamily: 'light-path',
      },
      { operations: [{ op: 'set_age', age: 6 }] },
    );
    const complete = revisionModels.planner.complete;
    revisionModels.planner.complete = async (input) => {
      calls += 1;
      return complete(input);
    };

    await expect(
      createCuriosityRevisionCandidateV2(
        {
          experienceSpec: baseExperienceSpec(),
          runtimeSpec: createValidCuriositySpec(),
          sourceArtifacts: [],
          instruction: '换成光学机制',
        },
        revisionModels,
        identity,
      ),
    ).rejects.toMatchObject({ code: 'REVISION_SCOPE_VIOLATION' });
    expect(calls).toBe(1);
  });

  it('rejects executable patch content and keeps the base unchanged', async () => {
    const base = baseExperienceSpec();
    await expect(
      createCuriosityRevisionCandidateV2(
        {
          experienceSpec: base,
          runtimeSpec: createValidCuriositySpec(),
          sourceArtifacts: [],
          instruction: '替换 HTML',
        },
        models(validImpact(), {
          operations: [{ op: 'replace', path: '/html', value: '<script />' }],
        }),
        identity,
      ),
    ).rejects.toMatchObject({ code: 'REVISION_PATCH_INVALID' });
    expect(base.versionId).toBe('ver_moon_demo_1');
  });

  it('rejects a candidate that fails quality review', async () => {
    const revision = createCuriosityRevisionCandidateV2(
      {
        experienceSpec: baseExperienceSpec(),
        runtimeSpec: createValidCuriositySpec(),
        sourceArtifacts: [],
        instruction: '改成适合 6 岁',
      },
      models(
        validImpact(),
        {
          operations: [
            { op: 'set_age', age: 10 },
            { op: 'replace_instruction', taskId: 'exploration', value: '拖动看看' },
          ],
        },
        qualityOutput('reject'),
      ),
      identity,
    );
    await expect(revision).rejects.toMatchObject({ code: 'QUALITY_REJECTED' });
    await expect(revision).rejects.toThrow('age-fit:年龄表达不通过');
  });

  it('canonicalizes duplicate revision quality criteria', async () => {
    const duplicated = qualityOutput();
    duplicated.checks.push({
      criterion: 'age-fit',
      status: 'pass',
      findings: ['重复检查'],
    });
    const result = await createCuriosityRevisionCandidateV2(
      {
        experienceSpec: baseExperienceSpec(),
        runtimeSpec: createValidCuriositySpec(),
        sourceArtifacts: [],
        instruction: '改成适合 10 岁并减少文字',
      },
      models(
        validImpact(),
        {
          operations: [
            { op: 'set_age', age: 10 },
            { op: 'replace_instruction', taskId: 'exploration', value: '拖动看看' },
          ],
        },
        duplicated,
      ),
      identity,
    );
    expect(result.quality.checks).toHaveLength(7);
    expect(result.quality.checks.filter((check) => check.criterion === 'age-fit')).toHaveLength(1);
  });
});
