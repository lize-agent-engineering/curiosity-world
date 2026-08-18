import { expect, test } from '@playwright/test';

/**
 * The whole studio loop against the canned test models: describe an app, watch
 * it generate, modify it, then move between versions. No network, no real model.
 */
test('从一句话生成应用，再对话式修改并切换版本', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('说出你想要的应用');

  await page
    .getByRole('button', { name: /番茄钟/ })
    .first()
    .click();
  await expect(page.getByLabel('描述你想要的应用')).toHaveValue(/番茄钟/);
  await page.getByRole('button', { name: /开始生成/ }).click();

  await expect(page).toHaveURL(/\/studio\/prj_/, { timeout: 30_000 });
  await expect(page.getByRole('button', { name: /在预览里打开这一版/ })).toBeVisible({
    timeout: 60_000,
  });

  // The generated app is previewed inside a sandbox that never gets same-origin.
  const frame = page.locator('iframe[title="应用预览"]');
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
  await expect(frame.contentFrame().getByRole('heading', { level: 1 })).toBeVisible();

  // The multi-agent intermediate products are visible, not just used.
  await expect(page.getByRole('button', { name: /planner 的中间产物/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /审查结论/ })).toBeVisible();

  await page.getByLabel('继续修改这个应用').fill('加一个今日完成计数，刷新不丢');
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.getByRole('button', { name: '修改方式：定点修改' })).toBeVisible({
    timeout: 60_000,
  });

  const versions = page.getByLabel('选择版本');
  await expect(versions.locator('option')).toHaveCount(2);
  await expect(versions).toHaveValue(/ver_/);

  // Switching to the first version offers a rollback and moves the preview back.
  const firstVersion = await versions.locator('option').last().getAttribute('value');
  await versions.selectOption(firstVersion!);
  await expect(page.getByRole('button', { name: /回到这一版/ })).toBeVisible();
  await expect(frame.contentFrame().locator('#patched')).toHaveCount(0);

  await page.getByRole('button', { name: /回到这一版/ }).click();
  await expect(page.getByRole('button', { name: /回到这一版/ })).toHaveCount(0);
  await expect(page.getByText('2 个版本')).toBeVisible();
});
