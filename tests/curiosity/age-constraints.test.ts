import { describe, expect, it } from 'vitest';

import { isPrimaryInstructionAllowed } from '@/lib/curiosity/age-constraints';

describe('child primary-instruction limits', () => {
  it.each([
    [6, '拖动看看会发生什么', true],
    [6, '这是一条超过十六个汉字的主要任务指令文本', false],
    [9, '移动光源，看看影子会发生什么变化', true],
    [9, '请移动光源并认真观察遮挡物位置改变以后影子长度和方向分别发生了什么变化', false],
  ])('validates the visible instruction for age %i', (age, text, valid) => {
    expect(isPrimaryInstructionAllowed(age, text)).toBe(valid);
  });
});
