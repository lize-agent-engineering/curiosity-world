import { describe, expect, it } from 'vitest';

import {
  runCuriosityAgentPipeline,
  type CuriosityPipelineModels,
  type CuriosityPipelineStageUpdate,
} from '@/lib/curiosity/agent-pipeline';

const createdAt = '2026-08-17T00:00:00.000Z';

const questionOutput = {
  coreQuestion: '水洼里的水为什么慢慢不见了？',
  equivalentQuestions: ['水为什么会慢慢变成水蒸气？'],
  ageBand: '8-10',
  safetyTags: [],
  supportStatus: 'supported',
  knowledgeRoute: 'open',
  knowledgeFamilyCandidates: [],
  clarifications: [],
};

const knowledgeOutput = {
  objectives: ['观察温度和蒸发速度的关系'],
  causalRelations: [
    { cause: '温度升高', relation: '让水分子运动更快', effect: '水更容易变成水蒸气' },
  ],
  claims: [{ id: 'claim_evaporation', statement: '液态水可以从表面变成水蒸气。' }],
  relations: [
    {
      id: 'relation_temperature',
      fromClaimId: 'claim_evaporation',
      relation: 'supports',
      toClaimId: 'claim_evaporation',
    },
  ],
  prerequisites: ['知道液体和气体不同'],
  allowedVocabulary: ['水蒸气', '温度', '蒸发'],
  allowedExplanations: ['水可以从表面慢慢变成看不见的水蒸气。'],
  forbiddenExplanations: ['水凭空消失了'],
  misconceptions: ['只有沸腾时水才会变成水蒸气'],
  uncertainties: ['湿度和空气流动也会影响蒸发速度'],
  timeSensitive: false,
  ageExpressionStrategy: '用晾干的水迹来解释。',
  observationSuggestions: ['比较两滴水在温暖和阴凉处的变化。'],
  packReferences: ['generated:open'],
};

const sceneOutput = {
  scene: {
    type: 'relation',
    title: '水去哪儿了？',
    instructions: ['点一点水滴和温度，再打开它们的关系。'],
    objects: [
      { id: 'temperature', label: '温度' },
      { id: 'water_size', label: '水滴大小' },
    ],
    relations: [
      {
        id: 'temperature_water',
        from: 'temperature',
        to: 'water_size',
        label: '温度越高，蒸发越快',
      },
    ],
  },
  feedback: [
    {
      trigger: 'set-temperature',
      message: '比较两滴水前后的大小。',
      explains: '温度会影响蒸发速度。',
    },
  ],
};

const presentationOutput = {
  narrationLibrary: [
    {
      id: 'narration_start',
      eventType: 'exploration_started',
      action: '*',
      text: '先猜哪滴水会先变小。',
    },
    {
      id: 'narration_temperature',
      eventType: 'control_changed',
      action: 'set-temperature',
      text: '温暖的一边变化得更快。',
    },
    {
      id: 'narration_finish',
      eventType: 'exploration_ended',
      action: '*',
      text: '你用观察找到了水的去向。',
    },
  ],
  discoveryPrompts: [{ id: 'card_puddle', prompt: '阴天的水洼也会变小吗？', skippable: true }],
  limitations: ['这个场景没有模拟湿度和风速。'],
};

const qualityCriteria = [
  'age-fit',
  'knowledge-grounding',
  'misconception-risk',
  'scene-safety',
  'interaction-completeness',
  'narration-coverage',
  'discovery-card-quality',
] as const;

const qualityOutput = (verdict: 'pass' | 'reject') => ({
  checks: qualityCriteria.map((criterion, index) => ({
    criterion,
    status: verdict === 'reject' && index === 3 ? 'reject' : 'pass',
    findings: verdict === 'reject' && index === 3 ? ['场景关系需要重新设计'] : [],
  })),
  verdict,
});

function sequenceModel(outputs: unknown[], calls: Array<{ system?: string; prompt: string }> = []) {
  let index = 0;
  return {
    route: { providerId: 'test', modelId: 'strict-json' },
    async complete(input: { system?: string; prompt: string }) {
      calls.push(input);
      const output = outputs[Math.min(index, outputs.length - 1)];
      index += 1;
      return JSON.stringify(output);
    },
  };
}

function models(overrides: Partial<CuriosityPipelineModels> = {}): CuriosityPipelineModels {
  return {
    'curiosity.question-modeler': sequenceModel([questionOutput]),
    'curiosity.knowledge-designer': sequenceModel([knowledgeOutput]),
    'curiosity.interaction-designer': sequenceModel([sceneOutput]),
    'curiosity.presentation-designer': sequenceModel([presentationOutput]),
    'curiosity.quality-reviewer': sequenceModel([qualityOutput('pass')]),
    ...overrides,
  } as CuriosityPipelineModels;
}

const identities = {
  runId: 'run_free_pipeline',
  experienceId: 'cur_free_pipeline',
  versionId: 'ver_free_pipeline',
  createdAt,
  artifactIds: {
    question: 'art_question_free',
    knowledge: 'art_knowledge_free',
    scene: 'art_scene_free',
    presentation: 'art_presentation_free',
    spec: 'art_spec_free',
    quality: 'art_quality_free',
  },
  agentRunIds: {
    question: 'agent_run_question_free',
    knowledge: 'agent_run_knowledge_free',
    scene: 'agent_run_scene_free',
    presentation: 'agent_run_presentation_free',
    quality: 'agent_run_quality_free',
  },
};

describe('first-release five-stage pipeline', () => {
  it('builds an open candidate through question, knowledge, scene, presentation and quality', async () => {
    const updates: CuriosityPipelineStageUpdate[] = [];
    const qualityCalls: Array<{ system?: string; prompt: string }> = [];
    const result = await runCuriosityAgentPipeline(
      { question: '水洼里的水为什么慢慢不见了？', targetAge: 8 },
      models({
        'curiosity.quality-reviewer': sequenceModel([qualityOutput('pass')], qualityCalls),
      }),
      identities,
      (update) => {
        updates.push(update);
      },
    );

    expect(updates.map(({ stage, artifactId }) => [stage, artifactId])).toEqual([
      ['question', 'art_question_free'],
      ['knowledge', 'art_knowledge_free'],
      ['scene', 'art_scene_free'],
      ['presentation', 'art_presentation_free'],
      ['quality', 'art_quality_free'],
    ]);
    expect(result.artifacts).toHaveLength(5);
    expect(result.spec.route).toEqual({ kind: 'open' });
    expect(result.spec.scene.type).toBe('relation');
    expect(result.spec.eventRequirements).toEqual([
      'exploration_started',
      'object_inspected',
      'object_moved',
      'control_changed',
      'relationship_revealed',
      'response_recorded',
      'feedback_presented',
      'discovery_prompt_opened',
      'reflection_recorded',
      'exploration_ended',
    ]);
    expect(result.specHash).toMatch(/^cw3-/);
    expect(result).not.toHaveProperty('runtimeSpec');
    expect(result).not.toHaveProperty('compiled');
    expect(qualityCalls[0]?.prompt).toContain('claim_evaporation');
    expect(qualityCalls[0]?.prompt).toContain('"type":"relation"');
    expect(qualityCalls[0]?.prompt).toContain('温暖的一边变化得更快');
    expect(qualityCalls[0]?.prompt).toContain('阴天的水洼也会变小吗');
  });

  it('tells every generation model that code and expressions are forbidden', async () => {
    const calls: Array<{ system?: string; prompt: string }> = [];
    const capture = (output: unknown) => sequenceModel([output], calls);
    await runCuriosityAgentPipeline(
      { question: '水洼里的水为什么慢慢不见了？', targetAge: 8 },
      models({
        'curiosity.question-modeler': capture(questionOutput),
        'curiosity.knowledge-designer': capture(knowledgeOutput),
        'curiosity.interaction-designer': capture(sceneOutput),
        'curiosity.presentation-designer': capture(presentationOutput),
        'curiosity.quality-reviewer': capture(qualityOutput('pass')),
      }),
      identities,
    );

    expect(calls).toHaveLength(5);
    expect(
      calls.every(({ system }) => system?.includes('不得输出 HTML、CSS、JavaScript、函数或表达式')),
    ).toBe(true);
  });

  it('reruns the complete scene, presentation and quality sequence at most once after rejection', async () => {
    const sceneCalls: Array<{ prompt: string }> = [];
    const presentationCalls: Array<{ prompt: string }> = [];
    const qualityCalls: Array<{ prompt: string }> = [];
    const result = await runCuriosityAgentPipeline(
      { question: '水洼里的水为什么慢慢不见了？', targetAge: 8 },
      models({
        'curiosity.interaction-designer': sequenceModel([sceneOutput, sceneOutput], sceneCalls),
        'curiosity.presentation-designer': sequenceModel(
          [presentationOutput, presentationOutput],
          presentationCalls,
        ),
        'curiosity.quality-reviewer': sequenceModel(
          [qualityOutput('reject'), qualityOutput('pass')],
          qualityCalls,
        ),
      }),
      identities,
    );

    expect(sceneCalls).toHaveLength(2);
    expect(presentationCalls).toHaveLength(2);
    expect(qualityCalls).toHaveLength(2);
    expect(sceneCalls[1]?.prompt).toContain('场景关系需要重新设计');
    expect(result.qualityRetryCount).toBe(1);
  });

  it('resumes from the last complete stage without invoking completed models again', async () => {
    let checkpoint: CuriosityPipelineStageUpdate | undefined;
    await expect(
      runCuriosityAgentPipeline(
        { question: '水洼里的水为什么慢慢不见了？', targetAge: 8 },
        models(),
        identities,
        (update) => {
          checkpoint = update;
          if (update.stage === 'presentation') throw new Error('SIMULATED_WORKER_EXIT');
        },
      ),
    ).rejects.toThrow(/SIMULATED_WORKER_EXIT/);

    expect(checkpoint?.stage).toBe('presentation');
    const completedModel = {
      route: { providerId: 'test', modelId: 'must-not-run' },
      complete: () => Promise.reject(new Error('COMPLETED_STAGE_RERAN')),
    };
    const qualityCalls: Array<{ prompt: string }> = [];
    const resumed = await runCuriosityAgentPipeline(
      { question: '水洼里的水为什么慢慢不见了？', targetAge: 8 },
      models({
        'curiosity.question-modeler': completedModel,
        'curiosity.knowledge-designer': completedModel,
        'curiosity.interaction-designer': completedModel,
        'curiosity.presentation-designer': completedModel,
        'curiosity.quality-reviewer': sequenceModel([qualityOutput('pass')], qualityCalls),
      }),
      identities,
      undefined,
      { artifacts: checkpoint!.artifacts, agentRuns: checkpoint!.agentRuns },
    );

    expect(qualityCalls).toHaveLength(1);
    expect(resumed.artifacts).toHaveLength(5);
    expect(resumed.specHash).toMatch(/^cw3-/);
  });

  it('fast-fails after the second quality rejection', async () => {
    const sceneCalls: Array<{ prompt: string }> = [];
    const qualityCalls: Array<{ prompt: string }> = [];
    const operation = runCuriosityAgentPipeline(
      { question: '水洼里的水为什么慢慢不见了？', targetAge: 8 },
      models({
        'curiosity.interaction-designer': sequenceModel([sceneOutput, sceneOutput], sceneCalls),
        'curiosity.presentation-designer': sequenceModel([presentationOutput, presentationOutput]),
        'curiosity.quality-reviewer': sequenceModel(
          [qualityOutput('reject'), qualityOutput('reject')],
          qualityCalls,
        ),
      }),
      identities,
    );

    await expect(operation).rejects.toMatchObject({
      failureCode: 'QUALITY_REJECTED',
      failedRole: 'curiosity.quality-reviewer',
    });
    expect(sceneCalls).toHaveLength(2);
    expect(qualityCalls).toHaveLength(2);
  });
});
