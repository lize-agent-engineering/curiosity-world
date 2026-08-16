import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  CuriosityAgentPipelineError,
  runCuriosityAgentPipeline,
  type CuriosityPipelineModels,
} from '@/lib/curiosity/agent-pipeline';

const createdAt = '2026-08-15T08:00:00.000Z';

function questionOutput() {
  return {
    coreQuestion: '为什么我们移动时，月亮看起来还在原来的方向？',
    equivalentQuestions: ['月亮为什么像在跟着我？'],
    ageBand: '8-10',
    interestSignals: ['散步'],
    safetyTags: [],
    supportStatus: 'supported',
    knowledgeFamilyCandidates: ['relative-motion'],
    clarifications: [],
  };
}

function knowledgeOutput() {
  return {
    knowledgeFamily: 'relative-motion',
    packId: 'relative-motion.moon-following.v1',
    objectives: ['比较观察者移动时近处与远处物体的视角变化'],
    causalRelations: [
      {
        cause: '观察者移动相同距离',
        relation: '距离越远，观察方向变化越小',
        effect: '月亮看起来几乎停在原来的方向',
      },
    ],
    prerequisites: ['知道远和近'],
    allowedVocabulary: ['远', '近', '观察方向'],
    forbiddenExplanations: ['月亮真的在追着观察者移动'],
    misconceptions: ['视角变化等于物体真实速度'],
    ageExpressionStrategy: '用近处路灯和远处月亮做对比。',
    observationSuggestions: ['走路时比较路灯和月亮在视野里的变化。'],
    packReferences: ['relative-motion.moon-following.v1#core'],
  };
}

function teamOutput() {
  return {
    teamName: '月光观察队',
    rationale: '围绕本题的科学边界和互动任务动态组成探索团队。',
    members: [
      { id: 'member_lead', name: '小满队长', role: 'lead', persona: '温和地串起问题和任务，只给孩子下一步线索。', avatar: '🌙', color: '#4F7DA1', priority: 10, voiceStyle: '温暖清楚，语速舒缓' },
      { id: 'member_science', name: '远近博士', role: 'science', persona: '专门核对远近物体与观察方向，守住科学解释边界。', avatar: '🔭', color: '#927236', priority: 8, voiceStyle: '沉稳准确，句子简短' },
      { id: 'member_interaction', name: '动手阿桥', role: 'interaction', persona: '把抽象规律变成孩子可以移动、比较和验证的动作。', avatar: '🧩', color: '#3F8066', priority: 7, voiceStyle: '活泼鼓励，节奏明快' },
    ],
  };
}

function interactionOutput() {
  return {
    scenario: '夜晚散步时比较路灯、远山和月亮。',
    visualTheme: '安静的蓝色夜空',
    variables: [
      { id: 'observer-position', label: '观察者位置', min: -80, max: 80, initial: 0 },
      { id: 'object-distance', label: '物体距离', min: 20, max: 400, initial: 200 },
    ],
    taskSequence: ['prediction', 'exploration', 'guided-discovery', 'transfer', 'explanation'],
    instructionCopy: [
      { taskId: 'prediction', kind: 'prediction', text: '先猜一猜' },
      { taskId: 'exploration', kind: 'exploration', text: '拖动看看' },
      { taskId: 'guided-discovery', kind: 'guided-discovery', text: '比较远和近' },
      { taskId: 'transfer', kind: 'transfer', text: '换个距离试试' },
      { taskId: 'explanation', kind: 'explanation', text: '选一个说给家长听' },
    ],
    primitives: ['move-observer', 'compare-near-far'],
    feedback: [
      {
        trigger: 'observer-moved',
        message: '近处路灯的方向变化更明显。',
        explains: '距离会影响观察方向的变化大小。',
      },
    ],
    endConditions: ['完成一次远近比较', '选择一个解释'],
  };
}

function storyOutput() {
  const hints = (subject: string) => [
    { level: 0, text: `先看看${subject}。`, revealsAnswer: false },
    { level: 1, text: `再比较${subject}的变化。`, revealsAnswer: false },
    { level: 2, text: `用刚才看到的${subject}来回答。`, revealsAnswer: false },
  ];
  return {
    stages: [
      {
        id: 'predict',
        kind: 'prediction',
        openingNarration: '先猜一猜会发生什么。',
        prompt: '说出你的猜想。',
        allowedEventTypes: ['prediction_submitted'],
        hints: hints('远处和近处'),
        completionCondition: '提交一次预测',
      },
      {
        id: 'explore',
        kind: 'exploration',
        openingNarration: '现在动手改变实验。',
        prompt: '拖动看看。',
        allowedEventTypes: ['variable_changed'],
        hints: hints('实验变量'),
        completionCondition: '产生一次变量变化',
      },
      {
        id: 'discover',
        kind: 'guided-discovery',
        openingNarration: '比较远近后找出规律。',
        prompt: '距离变化时，看到的移动有什么不同？',
        allowedEventTypes: ['variable_changed'],
        hints: hints('远近规律'),
        completionCondition: '说出一次远近比较结果',
      },
      {
        id: 'transfer',
        kind: 'transfer',
        openingNarration: '换一个情境再试试。',
        prompt: '选择符合刚才现象的一项。',
        allowedEventTypes: ['transfer_attempted'],
        hints: hints('新情境'),
        completionCondition: '完成一次迁移选择',
      },
      {
        id: 'explain',
        kind: 'explanation',
        openingNarration: '把发现说出来。',
        prompt: '为什么会这样？',
        allowedEventTypes: ['explanation_selected'],
        hints: hints('观察现象'),
        completionCondition: '留下一个解释事件',
      },
    ],
  };
}

function qualityOutput(): {
  checks: Array<{ criterion: string; status: string; findings: string[] }>;
  verdict: string;
} {
  const check = (criterion: string) => ({ criterion, status: 'pass', findings: [] });
  return {
    checks: [
      check('age-fit'),
      check('interest-link'),
      check('knowledge-consistency'),
      check('misconception-risk'),
      check('interaction-completeness'),
      check('transfer-validity'),
      check('copy-load'),
    ],
    verdict: 'pass',
  };
}

function model(output: unknown, calls: string[] = []) {
  return {
    route: { providerId: 'test', modelId: 'strict-json' },
    async complete(input: { prompt: string }) {
      calls.push(input.prompt);
      return JSON.stringify(output);
    },
  };
}

function models(overrides: Partial<CuriosityPipelineModels> = {}): CuriosityPipelineModels {
  return {
    'curiosity.question-modeler': model(questionOutput()),
    'curiosity.team-assembler': model(teamOutput()),
    'curiosity.knowledge-designer': model(knowledgeOutput()),
    'curiosity.interaction-designer': model(interactionOutput()),
    'curiosity.story-designer': model(storyOutput()),
    'curiosity.quality-reviewer': model(qualityOutput()),
    ...overrides,
  };
}

const identities = {
  runId: 'run_generation_1',
  experienceId: 'cur_generation_1',
  versionId: 'ver_generation_1',
  createdAt,
  artifactIds: {
    question: 'art_question_1',
    knowledge: 'art_knowledge_1',
    interaction: 'art_interaction_1',
    team: 'art_team_1',
    story: 'art_story_1',
    spec: 'art_spec_1',
    quality: 'art_quality_1',
  },
  agentRunIds: {
    question: 'agent_run_question_1',
    knowledge: 'agent_run_knowledge_1',
    interaction: 'agent_run_interaction_1',
    team: 'agent_run_team_1',
    story: 'agent_run_story_1',
    quality: 'agent_run_quality_1',
  },
};

describe('Curiosity five-ability generation pipeline', () => {
  it('constrains question modeling to the deterministic family and child age band', async () => {
    let questionSchema: z.ZodType | undefined;
    await runCuriosityAgentPipeline(
      { question: '为什么月亮看起来会跟着我们？', age: 8, interests: [] },
      models({
        'curiosity.question-modeler': {
          ...model(questionOutput()),
          async complete(input: { schema?: z.ZodType }) {
            questionSchema = input.schema;
            return JSON.stringify(questionOutput());
          },
        },
      }),
      identities,
    );

    expect(questionSchema).toBeDefined();
    expect(
      questionSchema?.safeParse({
        ...questionOutput(),
        knowledgeFamilyCandidates: ['relative-motion', 'light-path'],
      }).success,
    ).toBe(false);
    expect(questionSchema?.safeParse({ ...questionOutput(), ageBand: '6-7' }).success).toBe(false);
    expect(
      questionSchema?.safeParse({ ...questionOutput(), supportStatus: 'unsupported' }).success,
    ).toBe(false);
  });

  it('passes an alternate perspective to every creative agent and preserves its revision', async () => {
    const calls: string[] = [];
    const result = await runCuriosityAgentPipeline(
      {
        question: '为什么月亮看起来会跟着我们？',
        age: 8,
        interests: ['散步'],
        perspectiveDirective: '换一种更生活化、与上一版明显不同的角度解释',
      },
      models({
        'curiosity.question-modeler': model(questionOutput(), calls),
        'curiosity.knowledge-designer': model(knowledgeOutput(), calls),
        'curiosity.interaction-designer': model(interactionOutput(), calls),
        'curiosity.story-designer': model(storyOutput(), calls),
      }),
      { ...identities, revision: 2 },
    );

    expect(result.runtimeSpec.revision).toBe(2);
    expect(result.spec.revision).toBe(2);
    expect(calls).toHaveLength(4);
    expect(calls.every((prompt) => prompt.includes('更生活化'))).toBe(true);
  });

  it('removes the causal model from regeneration authority and injects the preserved relation', async () => {
    const { causalRelations: _generatedRelations, ...regenerationKnowledge } = knowledgeOutput();
    const preservedCausalRelations = [
      {
        cause: '观察者移动相同距离',
        relation: '距离越远，观察方向变化越小',
        effect: '月亮看起来几乎停在原来的方向',
      },
    ];
    const result = await runCuriosityAgentPipeline(
      {
        question: '为什么月亮看起来会跟着我们？',
        age: 8,
        interests: ['散步'],
        perspectiveDirective: '换一种生活角度解释',
        preservedCausalRelations,
      },
      models({
        'curiosity.knowledge-designer': model(regenerationKnowledge),
      }),
      { ...identities, revision: 2 },
    );

    const knowledge = result.artifacts.find(
      (artifact) => artifact.agentRole === 'curiosity.knowledge-designer',
    );
    expect(knowledge).toMatchObject({ causalRelations: preservedCausalRelations });
  });

  it('rejects interaction variables outside the selected knowledge plugin bounds', async () => {
    await expect(
      runCuriosityAgentPipeline(
        { question: '为什么月亮看起来会跟着我们？', age: 8, interests: ['散步'] },
        models({
          'curiosity.interaction-designer': model({
            ...interactionOutput(),
            variables: [
              { id: 'observer-position', label: '行走距离', min: -10, max: 10, initial: 0 },
              { id: 'object-distance', label: '参照物远近', min: 1, max: 3, initial: 2 },
            ],
          }),
        }),
        identities,
      ),
    ).rejects.toMatchObject({
      failureCode: 'INTERACTION_DESIGN_INVALID',
      failedRole: 'curiosity.interaction-designer',
    });
  });

  it('retries one invalid interaction design before activating a candidate', async () => {
    let attempts = 0;
    const result = await runCuriosityAgentPipeline(
      { question: '为什么月亮看起来会跟着我们？', age: 8, interests: ['散步'] },
      models({
        'curiosity.interaction-designer': {
          route: { providerId: 'test', modelId: 'strict-json' },
          async complete() {
            attempts += 1;
            return JSON.stringify(
              attempts === 1
                ? {
                    ...interactionOutput(),
                    variables: [
                      { id: 'observer-position', label: '行走距离', min: -10, max: 10, initial: 0 },
                      { id: 'object-distance', label: '参照物远近', min: 1, max: 3, initial: 2 },
                    ],
                  }
                : interactionOutput(),
            );
          },
        },
      }),
      identities,
    );

    expect(attempts).toBe(2);
    expect(
      result.agentRuns.find((run) => run.agentRole === 'curiosity.interaction-designer'),
    ).toMatchObject({
      status: 'succeeded',
    });
  });

  it('rejects adult idioms and belittling language from child narration', async () => {
    const unsafeStory = storyOutput();
    unsafeStory.stages[0]!.openingNarration = '月亮好像在溜须拍马地跟着你，这么简单你肯定懂吧？';

    await expect(
      runCuriosityAgentPipeline(
        { question: '为什么月亮看起来会跟着我们？', age: 8, interests: ['散步'] },
        models({ 'curiosity.story-designer': model(unsafeStory) }),
        identities,
      ),
    ).rejects.toMatchObject({
      failureCode: 'STORY_DESIGN_INVALID',
      failedRole: 'curiosity.story-designer',
    });
  });

  it('rejects spoken narration that overloads an eight-year-old listening turn', async () => {
    const overloadedStory = storyOutput();
    overloadedStory.stages[0]!.openingNarration =
      '夜晚散步时请你先看看近处的路灯再看看远处的月亮然后向前走一段路仔细比较它们在眼前移动的快慢最后告诉我你发现了什么规律';

    await expect(
      runCuriosityAgentPipeline(
        { question: '为什么月亮看起来会跟着我们？', age: 8, interests: ['散步'] },
        models({ 'curiosity.story-designer': model(overloadedStory) }),
        identities,
      ),
    ).rejects.toMatchObject({
      failureCode: 'STORY_DESIGN_INVALID',
      failedRole: 'curiosity.story-designer',
    });
  });

  it('records the real start and end time for each agent call', async () => {
    const result = await runCuriosityAgentPipeline(
      { question: '为什么月亮看起来会跟着我们？', age: 8, interests: ['散步'] },
      models({
        'curiosity.question-modeler': {
          route: { providerId: 'test', modelId: 'timed-json' },
          async complete() {
            await new Promise((resolve) => setTimeout(resolve, 5));
            return JSON.stringify(questionOutput());
          },
        },
      }),
      identities,
    );

    const run = result.agentRuns.find(
      (candidate) => candidate.agentRole === 'curiosity.question-modeler',
    );
    if (!run || run.status !== 'succeeded') throw new Error('question model run did not succeed');
    expect(new Date(run.endedAt).getTime()).toBeGreaterThan(new Date(run.startedAt).getTime());
  });

  it('gives the model an explicit strict output schema', async () => {
    const systemPrompts: string[] = [];

    await runCuriosityAgentPipeline(
      { question: '为什么月亮看起来会跟着我们？', age: 8, interests: ['散步'] },
      models({
        'curiosity.question-modeler': {
          route: { providerId: 'test', modelId: 'strict-json' },
          async complete(input: { system?: string }) {
            systemPrompts.push(input.system ?? '');
            return JSON.stringify(questionOutput());
          },
        },
      }),
      identities,
    );

    expect(systemPrompts[0]).toContain('JSON Schema');
    expect(systemPrompts[0]).toContain('"coreQuestion"');
    expect(systemPrompts[0]).toContain('"required"');
    expect(systemPrompts[0]).toContain('"additionalProperties":false');
  });

  it('gives every creative role a versioned professional handbook', async () => {
    const systems = new Map<string, string>();
    const capture = (role: string, output: unknown) => ({
      route: { providerId: 'test', modelId: 'strict-json' },
      async complete(input: { system?: string }) {
        systems.set(role, input.system ?? '');
        return JSON.stringify(output);
      },
    });

    await runCuriosityAgentPipeline(
      { question: '为什么月亮看起来会跟着我们？', age: 8, interests: ['散步'] },
      models({
        'curiosity.question-modeler': capture('question', questionOutput()),
        'curiosity.knowledge-designer': capture('knowledge', knowledgeOutput()),
        'curiosity.interaction-designer': capture('interaction', interactionOutput()),
        'curiosity.story-designer': capture('story', storyOutput()),
        'curiosity.quality-reviewer': capture('quality', qualityOutput()),
      }),
      identities,
    );

    expect([...systems.values()].every((system) => system.includes('技能包版本：1.0.0'))).toBe(
      true,
    );
    expect(systems.get('question')).toContain('儿童问题澄清');
    expect(systems.get('knowledge')).toContain('常见误解');
    expect(systems.get('interaction')).toContain('动作→现象→发现');
    expect(systems.get('story')).toContain('5～10 秒');
    expect(systems.get('quality')).toContain('正确但粗糙');
    expect([...systems.values()].every((system) => system.includes('拒绝条件'))).toBe(true);
  });

  it.each([
    {
      question: '桥为什么不会倒？',
      family: 'balance-support',
      packId: 'balance-support.bridge.v1',
      variables: [
        { id: 'support-position', label: '支点位置', min: -100, max: 100, initial: 0 },
        { id: 'base-width', label: '底座宽度', min: 10, max: 100, initial: 50 },
      ],
      primitives: ['place-support', 'resize-base'],
    },
    {
      question: '影子为什么会变长？',
      family: 'light-path',
      packId: 'light-path.shadow-length.v1',
      variables: [
        { id: 'light-position', label: '光源位置', min: -100, max: 100, initial: 0 },
        { id: 'incidence-angle', label: '光线角度', min: 0, max: 90, initial: 45 },
      ],
      primitives: ['move-light-source', 'change-incidence-angle'],
    },
  ] as const)(
    'builds a runnable candidate for the $family family',
    async ({ question, family, packId, variables, primitives }) => {
      const familyQuestion = {
        ...questionOutput(),
        coreQuestion: question,
        equivalentQuestions: [question],
        knowledgeFamilyCandidates: [family],
      };
      const familyKnowledge = {
        ...knowledgeOutput(),
        knowledgeFamily: family,
        packId,
        packReferences: [`${packId}#core`],
        forbiddenExplanations: ['不要越过知识边界'],
      };
      const familyInteraction = {
        ...interactionOutput(),
        variables: variables.map((variable) => ({ ...variable })),
        primitives: [...primitives],
      };
      const result = await runCuriosityAgentPipeline(
        { question, age: 8, interests: ['动手实验'] },
        models({
          'curiosity.question-modeler': model(familyQuestion),
          'curiosity.knowledge-designer': model(familyKnowledge),
          'curiosity.interaction-designer': model(familyInteraction),
        }),
        identities,
      );

      expect(result.runtimeSpec.knowledge).toEqual({ family, packId });
      expect(result.compiled.html).toContain(`data-knowledge-family=\"${family}\"`);
    },
  );

  it('passes only validated artifacts between roles and records every completed role', async () => {
    const knowledgeCalls: string[] = [];
    const interactionCalls: string[] = [];
    const teamCalls: string[] = [];
    const storyCalls: string[] = [];
    const qualityCalls: string[] = [];
    const stages: string[] = [];
    const result = await runCuriosityAgentPipeline(
      { question: '为什么月亮看起来会跟着我们？', age: 8, interests: ['散步'] },
      models({
        'curiosity.knowledge-designer': model(knowledgeOutput(), knowledgeCalls),
        'curiosity.interaction-designer': model(interactionOutput(), interactionCalls),
        'curiosity.team-assembler': model(teamOutput(), teamCalls),
        'curiosity.story-designer': model(storyOutput(), storyCalls),
        'curiosity.quality-reviewer': model(qualityOutput(), qualityCalls),
      }),
      identities,
      ({ stage }) => {
        stages.push(stage);
      },
    );

    expect(result.artifacts.map((artifact) => artifact.artifactId)).toEqual([
      'art_question_1',
      'art_knowledge_1',
      'art_interaction_1',
      'art_team_1',
      'art_story_1',
      'art_spec_1',
      'art_quality_1',
    ]);
    expect(result.agentRuns.map((run) => run.agentRunId)).toEqual([
      'agent_run_question_1',
      'agent_run_knowledge_1',
      'agent_run_interaction_1',
      'agent_run_team_1',
      'agent_run_story_1',
      'agent_run_quality_1',
    ]);
    expect(result.agentRuns.every((run) => run.status === 'succeeded')).toBe(true);
    expect(result.spec.schemaVersion).toBe('2.0');
    expect(result.runtimeSpec.schemaVersion).toBe('1.0');
    expect(result.runtimeSpec.presentation.completion).toBe(
      '你发现了：观察者移动相同距离时，月亮看起来几乎停在原来的方向。',
    );
    expect(result.compiled.html).toContain('data-curiosity-runtime');
    expect(knowledgeCalls[0]).toContain('art_question_1');
    expect(knowledgeCalls[0]).toContain('"requiredPackId":"relative-motion.moon-following.v1"');
    expect(knowledgeCalls[0]).toContain('"packIdPolicy":"copy-required-pack-id-exactly"');
    expect(interactionCalls[0]).toContain('art_knowledge_1');
    expect(interactionCalls[0]).toContain('"observer-position"');
    expect(interactionCalls[0]).toContain('"object-distance"');
    expect(interactionCalls[0]).toContain('"primaryInstructionLimit":28');
    expect(interactionCalls[0]).toContain(
      '"instructionCopyRule":"instructionCopy 中每条 text 去掉标点和空格后不得超过 28 个汉字；必须逐条自行计数并缩短"',
    );
    expect(interactionCalls[0]).toContain(
      '"transferRule":"only-use-declared-variables-and-primitives"',
    );
    expect(interactionCalls[0]).toContain(
      '"requiredTaskKinds":["prediction","exploration","transfer","explanation"]',
    );
    expect(teamCalls[0]).toContain('夜晚散步时比较路灯、远山和月亮');
    expect(teamCalls[0]).toContain('"memberCount":"3-5"');
    expect(storyCalls[0]).toContain('art_interaction_1');
    expect(storyCalls[0]).toContain('月光观察队');
    expect(storyCalls[0]).toContain('远近博士');
    expect(qualityCalls[0]).toContain('"checksLength":7');
    expect(qualityCalls[0]).toContain('"exactlyOnePerCriterion":true');
    expect(qualityCalls[0]).toContain('"languagePolicy":"simplified-chinese-is-required"');
    expect(qualityCalls[0]).toContain(
      '"instructionNarrationPolicy":"short-screen-instructions-and-related-spoken-narration-are-intentionally-distinct"',
    );
    expect(qualityCalls[0]).toContain(
      '"reviewScope":"reject-only-explicit-criterion-violations-supported-by-the-supplied-artifacts"',
    );
    expect(qualityCalls[0]).toContain(
      '"misconception-risk":"only-reject-when-copy-affirms-a-forbidden-explanation;do-not-require-an-extra-safety-or-fact-confirmation-stage"',
    );
    expect(stages).toEqual([
      'question_modeling',
      'knowledge_design',
      'interaction_design',
      'team_assembly',
      'story_design',
      'deterministic_compile',
      'quality_review',
    ]);
  });

  it('stops with STORY_DESIGN_INVALID before compiling an invalid story', async () => {
    const result = runCuriosityAgentPipeline(
      { question: '为什么月亮看起来会跟着我们？', age: 8, interests: [] },
      models({ 'curiosity.story-designer': model({ stages: [] }) }),
      identities,
    );

    await expect(result).rejects.toMatchObject({
      failureCode: 'STORY_DESIGN_INVALID',
      failedRole: 'curiosity.story-designer',
    });
    await expect(result).rejects.toThrow('stages:too_small');
  });

  it('rejects a story that omits an interaction task stage', async () => {
    const incompleteStory = storyOutput();
    incompleteStory.stages = incompleteStory.stages.filter(
      (stage) => stage.kind !== 'guided-discovery',
    );

    await expect(
      runCuriosityAgentPipeline(
        { question: '为什么月亮看起来会跟着我们？', age: 8, interests: [] },
        models({ 'curiosity.story-designer': model(incompleteStory) }),
        identities,
      ),
    ).rejects.toMatchObject({
      failureCode: 'STORY_DESIGN_INVALID',
      failedRole: 'curiosity.story-designer',
    });
  });

  it('stops at an invalid role and never invokes a downstream model', async () => {
    let interactionCalls = 0;
    const invalidModels = models({
      'curiosity.knowledge-designer': model({ arbitraryMechanism: 'teleportation' }),
      'curiosity.interaction-designer': {
        ...model(interactionOutput()),
        async complete() {
          interactionCalls += 1;
          return JSON.stringify(interactionOutput());
        },
      },
    });

    await expect(
      runCuriosityAgentPipeline(
        { question: '为什么月亮看起来会跟着我们？', age: 8, interests: [] },
        invalidModels,
        identities,
      ),
    ).rejects.toMatchObject({
      failureCode: 'KNOWLEDGE_DESIGN_INVALID',
      failedRole: 'curiosity.knowledge-designer',
    });
    expect(interactionCalls).toBe(0);
  });

  it('rejects age-inappropriate primary copy at the interaction boundary', async () => {
    const invalid = interactionOutput();
    invalid.instructionCopy[0]!.text =
      '这是一段明显超过八到十岁儿童主要指令长度限制而且不应该进入确定性编译器的文字';

    await expect(
      runCuriosityAgentPipeline(
        { question: '为什么月亮看起来会跟着我们？', age: 8, interests: [] },
        models({ 'curiosity.interaction-designer': model(invalid) }),
        identities,
      ),
    ).rejects.toMatchObject({
      failureCode: 'INTERACTION_DESIGN_INVALID',
      failedRole: 'curiosity.interaction-designer',
    });
  });

  it('rejects a knowledge relation that cannot fit the child completion copy', async () => {
    const invalid = knowledgeOutput();
    invalid.causalRelations[0] = {
      ...invalid.causalRelations[0]!,
      cause: '观察者移动相同距离'.repeat(12),
      effect: '月亮看起来几乎停在原来的方向'.repeat(12),
    };

    await expect(
      runCuriosityAgentPipeline(
        { question: '为什么月亮看起来会跟着我们？', age: 8, interests: [] },
        models({ 'curiosity.knowledge-designer': model(invalid) }),
        identities,
      ),
    ).rejects.toMatchObject({
      failureCode: 'KNOWLEDGE_DESIGN_INVALID',
      failedRole: 'curiosity.knowledge-designer',
    });
  });

  it('rejects interaction output that omits a deterministic runtime task', async () => {
    const invalid = interactionOutput();
    invalid.taskSequence = ['prediction', 'exploration', 'guided-discovery', 'explanation'];
    invalid.instructionCopy = invalid.instructionCopy.filter((item) => item.kind !== 'transfer');

    await expect(
      runCuriosityAgentPipeline(
        { question: '为什么月亮看起来会跟着我们？', age: 8, interests: [] },
        models({ 'curiosity.interaction-designer': model(invalid) }),
        identities,
      ),
    ).rejects.toMatchObject({
      failureCode: 'INTERACTION_DESIGN_INVALID',
      failedRole: 'curiosity.interaction-designer',
    });
  });

  it('rejects a question age band that does not match the child age', async () => {
    await expect(
      runCuriosityAgentPipeline(
        { question: '为什么月亮看起来会跟着我们？', age: 6, interests: [] },
        models(),
        identities,
      ),
    ).rejects.toMatchObject({
      failureCode: 'QUESTION_MODEL_INVALID',
      failedRole: 'curiosity.question-modeler',
    });
  });

  it('limits six-year-old experiences to four primary tasks', async () => {
    await expect(
      runCuriosityAgentPipeline(
        { question: '为什么月亮看起来会跟着我们？', age: 6, interests: [] },
        models({
          'curiosity.question-modeler': model({ ...questionOutput(), ageBand: '6-7' }),
        }),
        identities,
      ),
    ).rejects.toMatchObject({
      failureCode: 'INTERACTION_DESIGN_INVALID',
      failedRole: 'curiosity.interaction-designer',
    });
  });

  it('reports nested structured-output issue paths without model content', async () => {
    const nestedCause = z
      .strictObject({ verdict: z.literal('pass') })
      .safeParse({ verdict: 'maybe' });
    if (nestedCause.success) throw new Error('Expected invalid fixture');
    const outer = new Error('provider output rejected', { cause: nestedCause.error });

    await expect(
      runCuriosityAgentPipeline(
        { question: '为什么月亮看起来会跟着我们？', age: 8, interests: [] },
        models({
          'curiosity.question-modeler': {
            ...model(questionOutput()),
            async complete() {
              throw outer;
            },
          },
        }),
        identities,
      ),
    ).rejects.toThrow('Error>verdict:invalid_value');
  });

  it('rejects a quality review instead of publishing the compiled candidate', async () => {
    const rejected = qualityOutput();
    rejected.checks[0] = {
      criterion: 'age-fit',
      status: 'reject',
      findings: ['主要指令超过年龄限制'],
    };
    rejected.verdict = 'reject';

    const candidate = runCuriosityAgentPipeline(
      { question: '为什么月亮看起来会跟着我们？', age: 8, interests: [] },
      models({ 'curiosity.quality-reviewer': model(rejected) }),
      identities,
    );
    await expect(candidate).rejects.toBeInstanceOf(CuriosityAgentPipelineError);
    await expect(candidate).rejects.toMatchObject({
      failureCode: 'QUALITY_REJECTED',
      failedRole: 'curiosity.quality-reviewer',
    });
    await expect(candidate).rejects.toThrow('age-fit:主要指令超过年龄限制');
  });

  it('retries an ungrounded copy-load rejection before publishing a valid candidate', async () => {
    let attempts = 0;
    const prompts: string[] = [];
    const result = await runCuriosityAgentPipeline(
      { question: '为什么月亮看起来会跟着我们？', age: 8, interests: [] },
      models({
        'curiosity.quality-reviewer': {
          route: { providerId: 'test', modelId: 'strict-json' },
          async complete({ prompt }: { prompt: string }) {
            attempts += 1;
            prompts.push(prompt);
            const output = qualityOutput();
            if (attempts === 1) {
              output.checks[6] = {
                criterion: 'copy-load',
                status: 'reject',
                findings: ['主要指令超过字数限制'],
              };
              output.verdict = 'reject';
            }
            return JSON.stringify(output);
          },
        },
      }),
      identities,
    );

    expect(attempts).toBe(2);
    expect(prompts[1]).toContain(
      'copy-load rejection conflicts with deterministic instruction-length validation',
    );
    expect(result.artifacts.at(-1)).toMatchObject({
      agentRole: 'curiosity.quality-reviewer',
      verdict: 'pass',
    });
  });

  it('canonicalizes duplicate quality criteria before publishing the artifact', async () => {
    const duplicated = qualityOutput();
    duplicated.checks.push({
      criterion: 'age-fit',
      status: 'pass',
      findings: ['重复检查'],
    });

    const result = await runCuriosityAgentPipeline(
      { question: '为什么月亮看起来会跟着我们？', age: 8, interests: [] },
      models({ 'curiosity.quality-reviewer': model(duplicated) }),
      identities,
    );
    const quality = result.artifacts.find(
      (artifact) => artifact.agentRole === 'curiosity.quality-reviewer',
    );
    expect(quality?.checks).toHaveLength(7);
    expect(quality?.checks.filter((check) => check.criterion === 'age-fit')).toHaveLength(1);
  });
});
