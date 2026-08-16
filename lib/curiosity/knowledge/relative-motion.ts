import { createKnowledgePlugin } from './types';

export const relativeMotionPlugin = createKnowledgePlugin({
  family: 'relative-motion',
  pack: {
    id: 'relative-motion.moon-following.v1',
    version: '1.0.0',
    family: 'relative-motion',
    questionPatterns: [
      /月亮.*(?:跟|追|随|一起|不变)/i,
      /(?:跟|追|随).*月亮/i,
      /车窗.*(?:树|景).*(?:快|退|移动)/i,
      /远山.*(?:不动|没动|慢|跟|随)/i,
      /moon.*(?:follow|following|track|move with|stay still)/i,
    ],
    forbiddenPatterns: [
      /(?<!不是)(?<!并非)(?<!区分“)(?<!区分")(?<!不等于“)(?<!不等于")月亮真的(?:在)?(?:跟|追)(?!.{0,20}(?:误解|错误|错觉|不真实|不正确))/i,
      /近处物体真实速度更快/i,
    ],
    migrationQuestions: ['远山为什么移动得慢？', '车窗近景为什么移动得快？'],
  },
  variables: {
    'observer-position': { min: -100, max: 100 },
    'object-distance': { min: 10, max: 600 },
  },
  primitives: ['move-observer', 'compare-near-far'],
});
