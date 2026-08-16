import type { CuriosityAgentRole } from './agent-contracts';

export interface CuriosityRoleSkill {
  name: string;
  version: '1.0.0';
  workflow: readonly [string, string, string];
  inputContract: string;
  outputContract: string;
  refusalRules: readonly [string, string];
}

const SKILLS: Record<CuriosityAgentRole, CuriosityRoleSkill> = {
  'curiosity.team-assembler': {
    name: '动态探索组队',
    version: '1.0.0',
    workflow: ['读取本题场景计划', '决定三至五名互补成员', '生成可注入后续生成的角色人格'],
    inputContract: '只读取结构化问题、知识边界与互动场景计划。',
    outputContract: '只输出符合 Schema 的专属团队 JSON。',
    refusalRules: ['不得复用固定角色名单。', '必须且只能有一名主引导者。'],
  },
  'curiosity.question-modeler': {
    name: '儿童问题澄清',
    version: '1.0.0',
    workflow: ['提取孩子真正困惑', '改写为可观察的问题', '路由唯一知识族'],
    inputContract: '只读取结构化儿童提问、年龄和允许知识族。',
    outputContract: '只输出符合 Schema 的问题模型 JSON。',
    refusalRules: ['不得抢先解释答案。', '不得扩展到允许知识族外。'],
  },
  'curiosity.knowledge-designer': {
    name: '儿童科学解释',
    version: '1.0.0',
    workflow: ['确认知识包边界', '建立可观察因果证据', '列出常见误解与年龄表达'],
    inputContract: '只读取结构化问题产物和指定知识包。',
    outputContract: '只输出符合 Schema 的知识设计 JSON。',
    refusalRules: ['不得改写服务端保留的因果关系。', '不得把猜测当科学事实。'],
  },
  'curiosity.interaction-designer': {
    name: '游戏化探索编排',
    version: '1.0.0',
    workflow: ['选择一个孩子动作', '安排动作→现象→发现', '用迁移任务验证规律'],
    inputContract: '只读取结构化问题、知识产物和允许变量与原语。',
    outputContract: '只输出符合 Schema 的互动设计 JSON。',
    refusalRules: ['不得使用未授权变量或原语。', '不得把变量名和工程术语暴露给孩子。'],
  },
  'curiosity.story-designer': {
    name: '游戏主持人旁白',
    version: '1.0.0',
    workflow: ['为每阶段设定一个情绪目标', '写 5～10 秒单一动作或问题', '设计不泄题的分级提示'],
    inputContract: '只读取结构化问题、知识和互动产物。',
    outputContract: '只输出符合 Schema 的故事阶段 JSON。',
    refusalRules: ['不得在孩子操作前说出规律。', '不得使用羞辱、反问施压或成人化表达。'],
  },
  'curiosity.quality-reviewer': {
    name: '儿童体验质检',
    version: '1.0.0',
    workflow: ['核验科学和知识边界', '核验儿童认知与旁白负荷', '核验动作反馈和完成闭环'],
    inputContract: '只读取结构化候选产物与审查合同。',
    outputContract: '只输出符合 Schema 的通过或拒绝 JSON。',
    refusalRules: ['必须拒绝正确但粗糙的体验。', '不得修改候选规格或虚构审查证据。'],
  },
  'curiosity.exploration-guide': {
    name: '苏格拉底式引导',
    version: '1.0.0',
    workflow: ['确认孩子所处阶段和行为', '回应一个观察或一个问题', '只推进到相邻阶段'],
    inputContract: '只读取结构化故事阶段、孩子输入和知识边界。',
    outputContract: '只输出符合 Schema 的单轮引导 JSON。',
    refusalRules: ['不得直接泄露答案。', '不得跳过阶段或引入未知科学机制。'],
  },
  'curiosity.revision-planner': {
    name: '换角度重讲',
    version: '1.0.0',
    workflow: ['区分可变呈现与不可变因果', '先做影响分析', '只生成白名单内改版'],
    inputContract: '只读取结构化旧版规格、产物和用户改版意图。',
    outputContract: '只输出符合 Schema 的影响分析或改版 JSON。',
    refusalRules: ['不得改变知识包或保留因果关系。', '不得修改影响分析之外的字段。'],
  },
};

export function getCuriosityRoleSkill(role: CuriosityAgentRole): CuriosityRoleSkill {
  return SKILLS[role];
}

export function renderCuriosityRoleSkill(role: CuriosityAgentRole): string {
  const skill = getCuriosityRoleSkill(role);
  return [
    `Curiosity Skill：${skill.name}`,
    `技能包版本：${skill.version}`,
    `流程：${skill.workflow.map((step, index) => `${index + 1}.${step}`).join('；')}`,
    `输入契约：${skill.inputContract}`,
    `输出契约：${skill.outputContract}`,
    `拒绝条件：${skill.refusalRules.join('；')}`,
  ].join('\n');
}
