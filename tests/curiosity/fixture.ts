import {
  CURIOSITY_EVENT_TYPES_V2,
  type CuriosityAgentRun,
  type CuriosityExperienceSpecV2,
} from '@/lib/curiosity/agent-contracts';
import { CURIOUSITY_EVENT_TYPES, type CuriosityExperienceSpecV1 } from '@/lib/curiosity/contracts';

export function createValidCuriositySpec(): CuriosityExperienceSpecV1 {
  return {
    schemaVersion: '1.0',
    experienceId: 'cur_moon_demo',
    versionId: 'ver_moon_demo_1',
    revision: 1,
    createdAt: '2026-08-15T00:00:00.000Z',
    profile: { age: 8, interests: ['散步'] },
    question: {
      original: '为什么月亮看起来会跟着我们？',
      coreQuestion: '为什么移动时月亮的位置看起来几乎不变？',
    },
    knowledge: {
      family: 'relative-motion',
      packId: 'relative-motion.moon-following.v1',
    },
    presentation: {
      title: '月亮真的在跟着我吗？',
      hook: '先猜猜：路灯、远山和月亮，谁在视野里移动得最明显？',
      explorePrompt: '拖动小朋友，观察三种物体在视野中的变化。',
      challengePrompt: '把物体放得更远，它在视野中的变化会怎样？',
      completion: '你发现了：距离越远，观察方向的变化通常越小。',
    },
    simulation: {
      preset: 'moon-parallax-v1',
      observerTravel: 80,
      nearObjectDistance: 20,
      farObjectDistance: 400,
    },
    tasks: [
      {
        id: 'prediction',
        kind: 'prediction',
        prompt: '你觉得谁移动得最明显？',
        options: [
          { id: 'near-lamp', label: '近处路灯' },
          { id: 'far-mountain', label: '远处山峰' },
          { id: 'moon', label: '月亮' },
        ],
        expectedOptionId: 'near-lamp',
      },
      {
        id: 'exploration',
        kind: 'exploration',
        prompt: '移动观察者并比较视角变化。',
        variable: 'observer-position',
      },
      {
        id: 'challenge',
        kind: 'challenge',
        prompt: '哪个距离会让物体看起来移动得更少？',
        options: [
          { id: 'nearer', label: '更近' },
          { id: 'farther', label: '更远' },
        ],
        expectedOptionId: 'farther',
      },
      {
        id: 'explanation',
        kind: 'explanation',
        prompt: '选择最合理的解释。',
        options: [
          { id: 'small-angle-change', label: '月亮很远，观察方向变化很小' },
          { id: 'moon-follows', label: '月亮真的在追着我们移动' },
        ],
        expectedOptionId: 'small-angle-change',
      },
    ],
    eventRequirements: [...CURIOUSITY_EVENT_TYPES],
  };
}

export function createValidCuriosityExperienceSpecV2(): CuriosityExperienceSpecV2 {
  return {
    artifactId: 'art_spec_1',
    runId: 'run_generation_1',
    agentRole: 'curiosity.interaction-designer',
    schemaVersion: '2.0',
    createdAt: '2026-08-15T00:00:00.000Z',
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
    eventRequirements: [...CURIOSITY_EVENT_TYPES_V2],
  };
}

export function createValidCuriosityAgentRun(): CuriosityAgentRun {
  return {
    agentRunId: 'agent_run_interaction_1',
    runId: 'run_generation_1',
    experienceId: 'cur_moon_demo',
    candidateVersionId: 'ver_moon_demo_1',
    agentRole: 'curiosity.interaction-designer',
    route: { providerId: 'test', modelId: 'strict-json' },
    startedAt: '2026-08-15T00:00:00.000Z',
    endedAt: '2026-08-15T00:00:01.000Z',
    status: 'succeeded',
    inputArtifactIds: ['art_question_1', 'art_knowledge_1'],
    outputArtifactIds: ['art_spec_1'],
  };
}
