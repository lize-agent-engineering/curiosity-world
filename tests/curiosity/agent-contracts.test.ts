import { describe, expect, it } from 'vitest';

import {
  CURIOSITY_AGENT_ROLES,
  childVoiceEventV1Schema,
  curiosityAgentRunSchema,
  curiosityExperienceSpecV2Schema,
  curiosityPatchV2Schema,
  guidanceTurnRequestV1Schema,
  guidanceTurnResponseV1Schema,
  interactionDesignArtifactV1Schema,
  knowledgeDesignArtifactV1Schema,
  qualityReviewArtifactV1Schema,
  questionModelArtifactV1Schema,
  revisionImpactArtifactV1Schema,
  storyDesignArtifactV1Schema,
} from '@/lib/curiosity/agent-contracts';

const createdAt = '2026-08-15T03:00:00.000Z';

function questionArtifact() {
  return {
    artifactId: 'art_question_1',
    runId: 'run_generation_1',
    agentRole: 'curiosity.question-modeler' as const,
    schemaVersion: '1.0' as const,
    createdAt,
    upstreamArtifactIds: [],
    knowledgePackVersion: 'unselected',
    coreQuestion: '月亮为什么像在跟着我？',
    equivalentQuestions: ['为什么月亮看起来会跟着我？'],
    ageBand: '8-10' as const,
    interestSignals: ['散步'],
    safetyTags: [],
    supportStatus: 'supported' as const,
    knowledgeFamilyCandidates: ['relative-motion' as const],
    clarifications: [],
  };
}

function knowledgeArtifact() {
  return {
    artifactId: 'art_knowledge_1',
    runId: 'run_generation_1',
    agentRole: 'curiosity.knowledge-designer' as const,
    schemaVersion: '1.0' as const,
    createdAt,
    upstreamArtifactIds: ['art_question_1'],
    knowledgePackVersion: '1.0.0',
    knowledgeFamily: 'relative-motion' as const,
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

function interactionArtifact() {
  return {
    artifactId: 'art_interaction_1',
    runId: 'run_generation_1',
    agentRole: 'curiosity.interaction-designer' as const,
    schemaVersion: '1.0' as const,
    createdAt,
    upstreamArtifactIds: ['art_question_1', 'art_knowledge_1'],
    knowledgePackVersion: '1.0.0',
    scenario: '夜晚散步时比较路灯、远山和月亮。',
    visualTheme: '安静的蓝色夜空',
    variables: [
      { id: 'observer-position', label: '观察者位置', min: -80, max: 80, initial: 0 },
      { id: 'object-distance', label: '物体距离', min: 20, max: 400, initial: 200 },
    ],
    taskSequence: ['prediction', 'exploration', 'guided-discovery', 'transfer', 'explanation'],
    instructionCopy: [
      { taskId: 'prediction', kind: 'prediction' as const, text: '先猜一猜' },
      { taskId: 'exploration', kind: 'exploration' as const, text: '拖动看看' },
      { taskId: 'guided-discovery', kind: 'guided-discovery' as const, text: '比较远和近' },
      { taskId: 'transfer', kind: 'transfer' as const, text: '换个距离试试' },
      { taskId: 'explanation', kind: 'explanation' as const, text: '选一个说给家长听' },
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

function qualityArtifact() {
  const check = (criterion: string) => ({ criterion, status: 'pass' as const, findings: [] });
  return {
    artifactId: 'art_quality_1',
    runId: 'run_generation_1',
    agentRole: 'curiosity.quality-reviewer' as const,
    schemaVersion: '1.0' as const,
    createdAt,
    upstreamArtifactIds: ['art_question_1', 'art_knowledge_1', 'art_interaction_1', 'art_spec_1'],
    knowledgePackVersion: '1.0.0',
    checks: [
      check('age-fit'),
      check('interest-link'),
      check('knowledge-consistency'),
      check('misconception-risk'),
      check('interaction-completeness'),
      check('transfer-validity'),
      check('copy-load'),
    ],
    verdict: 'pass' as const,
  };
}

describe('Curiosity agent handoff contracts', () => {
  it('accepts a bounded story with unique ordered stages and rejects story-agent overreach', () => {
    const story = {
      artifactId: 'art_story_1',
      runId: 'run_generation_1',
      agentRole: 'curiosity.story-designer' as const,
      schemaVersion: '1.0' as const,
      createdAt,
      upstreamArtifactIds: ['art_question_1', 'art_knowledge_1', 'art_interaction_1'],
      knowledgePackVersion: '1.0.0',
      sourceArtifactIds: {
        questionModel: 'art_question_1',
        knowledgeDesign: 'art_knowledge_1',
        interactionDesign: 'art_interaction_1',
      },
      stages: [
        {
          id: 'predict',
          kind: 'prediction' as const,
          openingNarration: '先猜一猜，路灯和月亮谁变化得更快？',
          prompt: '说出你的猜想。',
          allowedEventTypes: ['prediction_submitted' as const],
          hints: [
            { level: 0 as const, text: '看看谁离我们更近。', revealsAnswer: false as const },
            { level: 1 as const, text: '比较路灯和月亮。', revealsAnswer: false as const },
            { level: 2 as const, text: '先选一个，再去验证。', revealsAnswer: false as const },
          ],
          completionCondition: '提交一次预测',
        },
        {
          id: 'explore',
          kind: 'exploration' as const,
          openingNarration: '移动小朋友，观察三个物体。',
          prompt: '拖动看看。',
          allowedEventTypes: ['variable_changed' as const],
          hints: [
            { level: 0 as const, text: '找到下面的滑杆。', revealsAnswer: false as const },
            { level: 1 as const, text: '把滑杆向右移动。', revealsAnswer: false as const },
            {
              level: 2 as const,
              text: '比较路灯和月亮的位置变化。',
              revealsAnswer: false as const,
            },
          ],
          completionCondition: '移动观察者并产生变量事件',
        },
        {
          id: 'transfer',
          kind: 'transfer' as const,
          openingNarration: '换成坐车看远山，再试一次。',
          prompt: '哪一个看起来移动得慢？',
          allowedEventTypes: ['transfer_attempted' as const],
          hints: [
            { level: 0 as const, text: '想想远处的物体。', revealsAnswer: false as const },
            { level: 1 as const, text: '比较车窗和远山。', revealsAnswer: false as const },
            { level: 2 as const, text: '选择后用刚才的现象验证。', revealsAnswer: false as const },
          ],
          completionCondition: '完成一次迁移选择',
        },
        {
          id: 'explain',
          kind: 'explanation' as const,
          openingNarration: '把你的发现说给家长听。',
          prompt: '为什么月亮看起来跟着我们？',
          allowedEventTypes: ['explanation_selected' as const],
          hints: [
            { level: 0 as const, text: '从远和近开始说。', revealsAnswer: false as const },
            { level: 1 as const, text: '说说观察方向的变化。', revealsAnswer: false as const },
            {
              level: 2 as const,
              text: '用刚才看到的现象组织一句话。',
              revealsAnswer: false as const,
            },
          ],
          completionCondition: '留下一个解释事件',
        },
      ],
    };

    expect(storyDesignArtifactV1Schema.parse(story)).toEqual(story);
    expect(CURIOSITY_AGENT_ROLES).toContain('curiosity.story-designer');
    expect(CURIOSITY_AGENT_ROLES).toContain('curiosity.exploration-guide');
    expect(() =>
      storyDesignArtifactV1Schema.parse({ ...story, generatedCode: 'alert(1)' }),
    ).toThrow();
    expect(() =>
      storyDesignArtifactV1Schema.parse({
        ...story,
        stages: [story.stages[0], { ...story.stages[1], id: 'predict' }, ...story.stages.slice(2)],
      }),
    ).toThrow(/unique/i);
    expect(() =>
      storyDesignArtifactV1Schema.parse({
        ...story,
        upstreamArtifactIds: ['art_question_1', 'art_interaction_1'],
      }),
    ).toThrow(/knowledge/i);
    expect(() =>
      storyDesignArtifactV1Schema.parse({
        ...story,
        stages: [
          {
            ...story.stages[0],
            hints: [{ level: 0, text: '答案就是路灯。', revealsAnswer: true }],
          },
          ...story.stages.slice(1),
        ],
      }),
    ).toThrow();
  });

  it('binds guidance turns and voice evidence without accepting raw audio', () => {
    const request = {
      schemaVersion: '1.0' as const,
      experienceId: 'cur_moon_demo',
      versionId: 'ver_moon_demo_1',
      storyArtifactId: 'art_story_1',
      stageId: 'predict',
      recentEventIds: ['evt_voice_1'],
      childInput: { kind: 'voice' as const, transcript: '我猜路灯变化更快' },
    };
    const response = {
      schemaVersion: '1.0' as const,
      experienceId: 'cur_moon_demo',
      versionId: 'ver_moon_demo_1',
      storyArtifactId: 'art_story_1',
      stageId: 'predict',
      triggeredByEventIds: ['evt_voice_1'],
      narration: '记住这个猜想，我们去移动看看。',
      feedbackKind: 'observation' as const,
      hintLevel: 0 as const,
      advanceTo: 'explore',
    };
    const voiceEvent = {
      schemaVersion: '1.0' as const,
      eventId: 'evt_voice_1',
      experienceId: 'cur_moon_demo',
      versionId: 'ver_moon_demo_1',
      stageId: 'predict',
      status: 'accepted' as const,
      transcript: '我猜路灯变化更快',
      confidence: 0.91,
      occurredAt: createdAt,
    };

    expect(guidanceTurnRequestV1Schema.parse(request)).toEqual(request);
    expect(guidanceTurnResponseV1Schema.parse(response)).toEqual(response);
    expect(childVoiceEventV1Schema.parse(voiceEvent)).toEqual(voiceEvent);
    expect(() => childVoiceEventV1Schema.parse({ ...voiceEvent, audioBase64: 'AAAA' })).toThrow();
    expect(() =>
      guidanceTurnResponseV1Schema.parse({ ...response, experienceId: 'exp_wrong' }),
    ).toThrow();
  });

  it('accepts a managed ASR transcript when the provider omits confidence', () => {
    const event = {
      schemaVersion: '1.0' as const,
      eventId: 'evt_voice_managed_1',
      experienceId: 'cur_moon_demo',
      versionId: 'ver_moon_demo_1',
      stageId: 'predict',
      status: 'accepted' as const,
      transcript: '我觉得路灯变化更快',
      occurredAt: createdAt,
    };

    expect(childVoiceEventV1Schema.parse(event)).toEqual(event);
  });

  it('accepts a traceable question-model artifact and rejects interaction fields', () => {
    const artifact = questionArtifact();

    expect(questionModelArtifactV1Schema.parse(artifact)).toEqual(artifact);
    expect(() => questionModelArtifactV1Schema.parse({ ...artifact, tasks: [] })).toThrow();
  });

  it('keeps knowledge and interaction responsibilities isolated', () => {
    const knowledge = knowledgeArtifact();
    const interaction = interactionArtifact();

    expect(knowledgeDesignArtifactV1Schema.parse(knowledge)).toEqual(knowledge);
    expect(interactionDesignArtifactV1Schema.parse(interaction)).toEqual(interaction);
    expect(() =>
      knowledgeDesignArtifactV1Schema.parse({ ...knowledge, primitives: interaction.primitives }),
    ).toThrow();
    expect(() =>
      interactionDesignArtifactV1Schema.parse({
        ...interaction,
        forbiddenExplanations: knowledge.forbiddenExplanations,
      }),
    ).toThrow();
  });

  it('requires quality review evidence without allowing specification mutation', () => {
    const review = qualityArtifact();

    expect(qualityReviewArtifactV1Schema.parse(review)).toEqual(review);
    expect(() => qualityReviewArtifactV1Schema.parse({ ...review, patchedSpec: {} })).toThrow();
  });

  it('accepts an impact analysis and only allow-listed V2 patch operations', () => {
    const impact = {
      artifactId: 'art_impact_1',
      runId: 'run_revision_1',
      agentRole: 'curiosity.revision-planner' as const,
      schemaVersion: '1.0' as const,
      createdAt,
      upstreamArtifactIds: ['art_spec_1'],
      knowledgePackVersion: '1.0.0',
      baseVersionId: 'ver_moon_1',
      summary: '降低年龄并缩短主要指令。',
      changedFields: ['profile.age', 'presentation.instructions'],
      preservedFields: ['knowledge.packId', 'knowledge.packVersion'],
      knowledgeFamily: 'relative-motion' as const,
    };
    const patch = {
      artifactId: 'art_patch_1',
      runId: 'run_revision_1',
      agentRole: 'curiosity.revision-planner' as const,
      schemaVersion: '2.0' as const,
      createdAt,
      upstreamArtifactIds: ['art_impact_1'],
      knowledgePackVersion: '1.0.0',
      baseVersionId: 'ver_moon_1',
      impactArtifactId: 'art_impact_1',
      operations: [
        { op: 'set_age' as const, age: 6 },
        {
          op: 'replace_instruction' as const,
          taskId: 'exploration',
          value: '拖动看看',
        },
      ],
    };

    expect(revisionImpactArtifactV1Schema.parse(impact)).toEqual(impact);
    expect(curiosityPatchV2Schema.parse(patch)).toEqual(patch);
    expect(() =>
      curiosityPatchV2Schema.parse({
        ...patch,
        operations: [{ op: 'replace', path: '/html', value: '<script />' }],
      }),
    ).toThrow();
  });

  it('accepts a V2 specification only when artifact references and events are explicit', () => {
    const spec = {
      artifactId: 'art_spec_1',
      runId: 'run_generation_1',
      agentRole: 'curiosity.interaction-designer' as const,
      schemaVersion: '2.0' as const,
      createdAt,
      upstreamArtifactIds: ['art_question_1', 'art_knowledge_1', 'art_interaction_1'],
      knowledgePackVersion: '1.0.0',
      experienceId: 'cur_moon_1',
      versionId: 'ver_moon_1',
      revision: 1,
      profile: { age: 8, interests: ['散步'] },
      sourceArtifactIds: {
        questionModel: 'art_question_1',
        knowledgeDesign: 'art_knowledge_1',
        interactionDesign: 'art_interaction_1',
      },
      knowledge: {
        family: 'relative-motion' as const,
        packId: 'relative-motion.moon-following.v1',
        packVersion: '1.0.0',
      },
      title: '月亮为什么像在跟着我？',
      visualTheme: '安静的蓝色夜空',
      observationSuggestions: ['散步时比较路灯和月亮。'],
      instructions: [
        { taskId: 'prediction', kind: 'prediction' as const, text: '先猜一猜' },
        { taskId: 'exploration', kind: 'exploration' as const, text: '拖动看看' },
        { taskId: 'transfer', kind: 'transfer' as const, text: '换个距离试试' },
        { taskId: 'explanation', kind: 'explanation' as const, text: '选一个说给家长听' },
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

    expect(curiosityExperienceSpecV2Schema.parse(spec)).toEqual(spec);
    expect(() =>
      curiosityExperienceSpecV2Schema.parse({ ...spec, sourceArtifactIds: {} }),
    ).toThrow();
  });

  it('records routing, timing, status, failure code and artifact ids without hidden reasoning', () => {
    const succeeded = {
      agentRunId: 'agent_run_question_1',
      runId: 'run_generation_1',
      experienceId: 'cur_moon_1',
      candidateVersionId: 'ver_moon_1',
      agentRole: 'curiosity.question-modeler' as const,
      route: {
        providerId: 'openai',
        modelId: 'gpt-test',
        thinking: { effort: 'medium' as const },
      },
      startedAt: createdAt,
      endedAt: '2026-08-15T03:00:02.000Z',
      status: 'succeeded' as const,
      inputArtifactIds: [],
      outputArtifactIds: ['art_question_1'],
    };

    expect(curiosityAgentRunSchema.parse(succeeded)).toEqual(succeeded);
    expect(() =>
      curiosityAgentRunSchema.parse({ ...succeeded, chainOfThought: 'hidden' }),
    ).toThrow();
    expect(() =>
      curiosityAgentRunSchema.parse({
        ...succeeded,
        status: 'failed',
        outputArtifactIds: [],
      }),
    ).toThrow();
  });
});
