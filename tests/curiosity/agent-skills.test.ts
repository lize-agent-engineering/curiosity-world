import { describe, expect, it } from 'vitest';

import { getCuriosityRoleSkill } from '@/lib/curiosity/agent-skills';

describe('Curiosity role skills', () => {
  it.each([
    ['curiosity.question-modeler', '儿童问题澄清'],
    ['curiosity.knowledge-designer', '儿童科学解释'],
    ['curiosity.interaction-designer', '游戏化探索编排'],
    ['curiosity.story-designer', '游戏主持人旁白'],
    ['curiosity.quality-reviewer', '儿童体验质检'],
    ['curiosity.exploration-guide', '苏格拉底式引导'],
    ['curiosity.revision-planner', '换角度重讲'],
  ] as const)('%s has a deployable skill with workflow and refusal rules', (role, name) => {
    const skill = getCuriosityRoleSkill(role);

    expect(skill.name).toBe(name);
    expect(skill.version).toBe('1.0.0');
    expect(skill.workflow).toHaveLength(3);
    expect(skill.inputContract).toContain('结构化');
    expect(skill.outputContract).toContain('Schema');
    expect(skill.refusalRules.length).toBeGreaterThan(1);
  });
});
