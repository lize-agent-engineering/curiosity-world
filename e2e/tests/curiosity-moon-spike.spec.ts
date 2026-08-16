import { expect, test } from '@playwright/test';

const forbiddenProductTerms = /课程|教师|同学|幻灯片|白板|课堂 TTS|视频导出|PBL/;

test('从问题生成到儿童探索与家长复盘', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.goto('/');
  await expect(page.getByText('把孩子的“为什么”')).toBeVisible();
  await expect(page.getByRole('button', { name: '模型设置' })).toHaveCount(0);
  await page.getByRole('button', { name: '为什么月亮看起来会跟着我们？' }).click();
  await expect(page.getByLabel('孩子正在好奇什么？')).toHaveValue('为什么月亮看起来会跟着我们？');

  await page.getByRole('button', { name: '开始这次探索' }).click();
  await expect(page.getByRole('status')).toBeVisible();
  await expect(page).toHaveURL(/\/experience\/cur_/, { timeout: 60_000 });

  await expect(page.getByRole('heading', { name: '月亮为什么像在跟着我？' })).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByRole('img', { name: '远近物体视角变化实验' })).toBeVisible();
  await expect(page.getByLabel('审核旁白')).toBeVisible();
  await page.getByRole('button', { name: '开始探索' }).click();
  await expect(page.getByText('生成期已审核旁白')).toBeVisible();

  await page.getByRole('button', { name: '家长复盘' }).click();
  await expect(page.getByText('孩子实际做了什么')).toBeVisible();
  await expect(page.getByText('还没有收到互动事件。')).toBeVisible();

  expect(await page.locator('body').innerText()).not.toMatch(forbiddenProductTerms);
});
