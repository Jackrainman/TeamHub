const assert = require('node:assert/strict');
const { startV1Server, withBrowser, login, assertNoOverflow } = require('./lib/v1.cjs');

(async () => {
  const hub = await startV1Server({ tasks: true });
  try {
    await withBrowser(async page => {
      await login(page, hub, 'admin');
      for (const name of ['任务', '日历', '报销', '设置']) {
        await page.getByRole('button', { name, exact: true }).click();
        await assertNoOverflow(page);
      }
      assert.equal(await page.locator('.console-nav .nav-item').count(), 4);
      await page.getByLabel(/新组名/).fill('算法');
      await page.getByRole('button', { name: '新建组', exact: true }).click();
      await page.getByText('算法', { exact: true }).waitFor();
      const ownerRow = page.locator('.adapter-row').filter({ hasText: 'owner' });
      const ownerSelect = ownerRow.getByRole('combobox');
      const roleSaved = page.waitForResponse(response => response.url().includes('/role') && response.status() === 200);
      const membersRefreshed = page.waitForResponse(response => response.request().method() === 'GET'
        && new URL(response.url()).pathname === '/api/members' && response.status() === 200);
      await ownerSelect.selectOption('groupAdmin');
      const roleResponse = await roleSaved;
      assert.equal((await roleResponse.json()).member.role, 'groupAdmin');
      await page.waitForFunction(() => {
        const row = [...document.querySelectorAll('.adapter-row')]
          .find(item => item.querySelector('strong')?.textContent === 'owner');
        const select = row?.querySelector('select');
        return select?.value === 'groupAdmin' && !select.disabled;
      });
      await membersRefreshed;
      assert.equal(await ownerSelect.inputValue(), 'groupAdmin');
      const roster = await page.request.get(`${hub.baseUrl}/api/export/roster`);
      const tasks = await page.request.get(`${hub.baseUrl}/api/export/tasks`);
      assert.equal(roster.status(), 200);
      assert.equal(tasks.status(), 200);
      assert.match(await roster.text(), /owner/);
      assert.match(await tasks.text(), /E2E交付任务/);
    });
    console.log('PASS settings-rail: four pages, groups, roles, exports, 1000px');
  } finally { await hub.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
