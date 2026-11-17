const assert = require('node:assert/strict');
const { startV1Server, withBrowser, login, assertNoOverflow } = require('./lib/v1.cjs');

(async () => {
  const hub = await startV1Server({ tasks: true });
  try {
    await withBrowser(async page => {
      await login(page, hub);
      await page.getByRole('button', { name: '新建任务', exact: true }).click();
      await page.getByLabel('任务标题', { exact: true }).fill('E2E页面新建');
      await page.getByLabel('要完成什么', { exact: true }).fill('新建入口保持可用');
      await page.locator('.reviewer-group summary').click();
      await page.locator('.reviewer-options label').filter({ hasText: 'reviewer' }).locator('input').check();
      await page.getByRole('button', { name: '提交', exact: true }).click();
      await page.locator('.week-form').waitFor({ state: 'detached' });
      await page.getByRole('button', { name: 'E2E页面新建', exact: true }).waitFor();

      await page.getByRole('combobox', { name: '状态', exact: true }).selectOption('all');
      await page.getByRole('button', { name: 'E2E交付任务', exact: true }).click();
      const detail = page.locator('.task-detail');
      await detail.getByRole('button', { name: '标记完成', exact: true }).click();
      await detail.getByRole('button', { name: '自己验收', exact: true }).click();
      await page.getByLabel('完成内容', { exact: true }).fill('完成页面任务流程');
      await page.getByLabel('交付物', { exact: true }).fill('代码与记录');
      await page.getByLabel('文件位置（一行一个）', { exact: true }).fill('src/task.ts\ntest/task.test.ts');
      await page.getByRole('button', { name: '提交验收', exact: true }).click();
      await page.getByText('完成页面任务流程', { exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await page.reload();
      await page.getByRole('combobox', { name: '状态', exact: true }).selectOption('accepted');
      await page.getByRole('button', { name: 'E2E交付任务', exact: true }).click();
      await page.getByText('src/task.ts', { exact: true }).waitFor();
      await page.keyboard.press('Escape');

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.locator('#console-rail-toggle').click();
      await page.locator('#console-right-rail').waitFor();
      await page.locator('#console-right-rail').getByText('E2E页面新建', { exact: true }).waitFor();
      await page.setViewportSize({ width: 1000, height: 900 });
      await assertNoOverflow(page);
    });
    console.log('PASS task-lifecycle: create, complete, delivery, self-accept, reload, persistent rail');
  } finally { await hub.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
