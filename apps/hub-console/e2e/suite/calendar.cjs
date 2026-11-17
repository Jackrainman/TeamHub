const assert = require('node:assert/strict');
const { startV1Server, withBrowser, login, assertNoOverflow } = require('./lib/v1.cjs');

(async () => {
  const hub = await startV1Server({ tasks: true });
  try {
    await withBrowser(async page => {
      await login(page, hub);
      await page.getByRole('button', { name: '日历', exact: true }).click();
      await page.locator('.calendar-month-view').waitFor();
      const across = page.locator('.calendar-project-bar[data-task-id]').filter({ hasText: 'E2E跨周任务' });
      assert.equal(await across.count(), 2);
      const firstRadius = await across.first().evaluate(element => getComputedStyle(element).borderRadius);
      const lastRadius = await across.last().evaluate(element => getComputedStyle(element).borderRadius);
      assert.notEqual(firstRadius, lastRadius);
      assert.equal(await page.locator('.calendar-month-unstarted').getByRole('button', { name: 'E2E未安排任务' }).count(), 1);
      await page.getByRole('button', { name: '个人', exact: true }).click();
      assert.equal(await page.getByText('E2E他人任务', { exact: true }).count(), 0);
      await page.getByRole('button', { name: '全队', exact: true }).click();
      await page.getByText('E2E他人任务', { exact: true }).waitFor();
      await page.getByRole('button', { name: '本组', exact: true }).click();
      await page.getByText('E2E他人任务', { exact: true }).waitFor();
      await page.getByRole('button', { name: '新建任务', exact: true }).click();
      await page.getByLabel('任务标题', { exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await assertNoOverflow(page);
    });
    console.log('PASS calendar: cross-week, inclusive end, undated, scopes, create entry, 1000px');
  } finally { await hub.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
