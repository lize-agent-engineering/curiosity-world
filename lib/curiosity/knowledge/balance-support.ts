import { createKnowledgePlugin } from './types';

export const balanceSupportPlugin = createKnowledgePlugin({
  family: 'balance-support',
  pack: {
    id: 'balance-support.bridge.v1',
    version: '1.0.0',
    family: 'balance-support',
    questionPatterns: [/(?:桥|积木).*(?:倒|塌|稳|支撑)/i, /怎么搭.*(?:稳|不倒)/i],
    forbiddenPatterns: [/材料(?:断裂|疲劳|屈服)/i, /真实建筑承载/i, /结构工程计算/i],
    migrationQuestions: ['支点移到哪里会更稳？', '底座变宽为什么更稳？'],
  },
  variables: {
    'support-position': { min: -100, max: 100 },
    'center-of-mass': { min: -100, max: 100 },
    'base-width': { min: 10, max: 100 },
    load: { min: 1, max: 100 },
  },
  primitives: ['place-support', 'move-center-of-mass', 'resize-base', 'run-load-test'],
});
