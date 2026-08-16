import { createKnowledgePlugin } from './types';

export const lightPathPlugin = createKnowledgePlugin({
  family: 'light-path',
  pack: {
    id: 'light-path.shadow-length.v1',
    version: '1.0.0',
    family: 'light-path',
    questionPatterns: [/(?:影子|阴影).*(?:长|短|大|小|变化)/i, /手电筒.*影子/i],
    forbiddenPatterns: [/折射率/i, /衍射|干涉|量子/i, /任意曲面光学/i],
    migrationQuestions: ['光源变低时影子为什么变长？', '遮挡物靠近光源会怎样？'],
  },
  variables: {
    'light-position': { min: -100, max: 100 },
    'occluder-position': { min: -100, max: 100 },
    'incidence-angle': { min: 0, max: 90 },
  },
  primitives: ['move-light-source', 'move-occluder', 'change-incidence-angle', 'trace-light-path'],
});
