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

const tasks = [
  {
    id: 'prediction',
    kind: 'prediction',
    prompt: '哪一滴水会先变小？',
    options: [
      { id: 'warm-drop', label: '温暖处的水滴' },
      { id: 'cool-drop', label: '阴凉处的水滴' },
    ],
    expectedOptionId: 'warm-drop',
  },
  {
    id: 'exploration',
    kind: 'exploration',
    prompt: '改变温度，比较水滴。',
    variable: 'temperature',
  },
  {
    id: 'challenge',
    kind: 'challenge',
    prompt: '哪里晾衣服更容易干？',
    options: [
      { id: 'warm-place', label: '温暖通风处' },
      { id: 'closed-box', label: '密闭盒子里' },
    ],
    expectedOptionId: 'warm-place',
  },
  {
    id: 'explanation',
    kind: 'explanation',
    prompt: '水为什么变少了？',
    options: [
      { id: 'became-vapor', label: '一部分水变成水蒸气了' },
      { id: 'vanished', label: '水凭空消失了' },
    ],
    expectedOptionId: 'became-vapor',
  },
] as const;

const sceneOutput = {
  scenario: '比较两滴水在不同温度下的变化。',
  visualTheme: '清晨窗边的两滴水',
  sceneType: 'relation-explorer',
  variables: [
    { id: 'temperature', label: '温度', min: 0, max: 10, initial: 4 },
    { id: 'water-size', label: '水滴大小', min: 0, max: 10, initial: 8 },
  ],
  relations: [
    {
      id: 'temperature-water',
      fromVariableId: 'temperature',
      toVariableId: 'water-size',
      direction: 'inverse',
    },
  ],
  tasks,
  taskSequence: ['prediction', 'exploration', 'transfer', 'explanation'],
  instructionCopy: [
    { taskId: 'prediction', kind: 'prediction', text: '先猜哪滴水变小' },
    { taskId: 'exploration', kind: 'exploration', text: '改变温度看看' },
    { taskId: 'transfer', kind: 'transfer', text: '换到晾衣服想想' },
    { taskId: 'explanation', kind: 'explanation', text: '选出你的解释' },
  ],
  primitives: ['adjust-variable', 'compare-relation'],
  feedback: [
    {
      trigger: 'set-temperature',
      message: '比较两滴水前后的大小。',
      explains: '温度会影响蒸发速度。',
    },
  ],
  endConditions: ['改变一次温度', '比较一次关系', '选择解释'],
};

const presentationOutput = {
  title: '水去哪儿了？',
  hook: '两滴一样大的水，谁会先变小？',
  explorePrompt: '改变温度，比较水滴。',
  challengePrompt: '把发现用到晾衣服上。',
  completion: '你发现了：水会从表面慢慢变成水蒸气。',
  narrationLibrary: [
    {
      id: 'narration_start',
      eventType: 'experiment_started',
      action: '*',
      text: '先猜哪滴水会先变小。',
    },
    {
      id: 'narration_temperature',
      eventType: 'variable_changed',
      action: 'set-temperature',
      text: '温暖的一边变化得更快。',
    },
    {
      id: 'narration_finish',
      eventType: 'experience_completed',
      action: '*',
      text: '你用观察找到了水的去向。',
    },
  ],
  immediateFeedback: [
    {
      id: 'feedback_temperature',
      eventType: 'variable_changed',
      outcome: 'observe',
      text: '记住前后两次的不同。',
    },
  ],
  discoveryPrompts: [{ id: 'card_puddle', prompt: '阴天的水洼也会变小吗？', skippable: true }],
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
    expect(result.artifacts).toHaveLength(6);
    expect(result.runtimeSpec.knowledge.family).toBe('open');
    expect(result.spec.sceneType).toBe('relation-explorer');
    expect(result.compiled.specHash).toMatch(/^cw1-/);
    expect(qualityCalls[0]?.prompt).toContain('claim_evaporation');
    expect(qualityCalls[0]?.prompt).toContain('relation-explorer');
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
