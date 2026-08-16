import { knowledgeRegistry } from './knowledge/registry';
import { CuriosityKnowledgePluginError } from './knowledge/types';

export const MOON_KNOWLEDGE_PACK = {
  id: 'relative-motion.moon-following.v1',
  family: 'relative-motion',
  coreExplanation:
    '观察者移动时，近处物体的观察方向变化更明显；月亮非常遥远，观察方向变化很小，所以看起来像在跟随。',
  allowedVocabulary: {
    '6-7': ['远', '近', '方向', '看起来'],
    '8-10': ['相对位置', '观察方向', '视角变化', '距离'],
  },
  forbiddenExplanations: [
    /月亮真的(?:在)?(?:跟|追)/i,
    /月亮绕着(?:你|我们)/i,
    /moon (?:is )?actually (?:following|chasing)/i,
    /near objects move faster through space/i,
  ],
  misconceptions: [
    '月亮在追着观察者移动',
    '近处物体本身一定比远处物体运动得快',
    '视角变化等于物体真实速度',
  ],
  supportedChallenges: ['compare-distance', 'tabletop-parallax'],
} as const;

export type CuriosityDomainErrorCode =
  | 'AGE_OUT_OF_RANGE'
  | 'UNSAFE_CONTENT'
  | 'NEEDS_CLARIFICATION'
  | 'KNOWLEDGE_VIOLATION';

export class CuriosityDomainError extends Error {
  constructor(
    readonly code: CuriosityDomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CuriosityDomainError';
  }
}

const UNSAFE_PATTERNS = [
  /炸弹|爆炸物|伤害别人|自杀|毒药|色情|性行为/i,
  /bomb|explosive|hurt (?:someone|people)|suicide|poison|sexual/i,
];

export function classifyCuriosityRequest(input: {
  question: string;
  targetAge?: number;
  age?: number;
}) {
  const age = input.targetAge ?? input.age;
  if (!Number.isInteger(age) || age! < 6 || age! > 10) {
    throw new CuriosityDomainError('AGE_OUT_OF_RANGE', '当前体验仅支持 6–10 岁儿童。');
  }

  const question = input.question.trim();
  if (UNSAFE_PATTERNS.some((pattern) => pattern.test(question))) {
    throw new CuriosityDomainError('UNSAFE_CONTENT', '该问题不在当前安全内容边界内。');
  }

  const identifiableSubject = question
    .replace(/为什么|怎么|如何|会|这样|这个|那个|回事|呢|啊|呀/gi, '')
    .replace(/[\s，。！？、,.!?]/g, '');
  if (identifiableSubject.length < 2) {
    throw new CuriosityDomainError(
      'NEEDS_CLARIFICATION',
      '还需要一个更具体的对象或现象，例如“毛毛虫为什么会变成蝴蝶？”。',
    );
  }

  try {
    return knowledgeRegistry.classify({ question, age: age! });
  } catch (error) {
    if (error instanceof CuriosityKnowledgePluginError) {
      throw new CuriosityDomainError(error.code, error.message);
    }
    throw error;
  }
}
