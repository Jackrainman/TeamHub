const assert = require('node:assert/strict');
const { startV1Server, withBrowser, login } = require('./lib/v1.cjs');

async function createEntry(hub, username, summary) {
  const response = await hub.api(username, 'POST', '/api/reimburse/entries', {
    kind: 'expense', expenseType: 'taxi', summary, recognitionSource: 'manual',
    totalAmountFen: 1000, items: [], materials: { invoice: false, paymentShot: false, inspection: false },
  });
  assert.equal(response.statusCode, 201, response.body);
}

(async () => {
  const hub = await startV1Server();
  try {
    await createEntry(hub, 'admin', '财务本人的条目');
    await createEntry(hub, 'owner', '其他成员的条目');
    await withBrowser(async page => {
      await login(page, hub, 'admin');
      await page.getByRole('button', { name: '报销', exact: true }).click();
      await page.locator('.reimb-table tbody tr').first().waitFor();
      await page.waitForFunction(() => document.querySelectorAll('.reimb-table tbody tr').length === 1);
      await page.getByText('财务本人的条目', { exact: true }).waitFor();
      assert.equal(await page.getByText('其他成员的条目', { exact: true }).count(), 0);

      const allResponse = page.waitForResponse(response => response.url().includes('/api/reimburse/entries?scope=all') && response.ok());
      await page.getByRole('button', { name: '财务工作台', exact: true }).click();
      await allResponse;
      await page.waitForFunction(() => document.querySelectorAll('.reimb-table tbody tr').length === 2);
      await page.getByText('其他成员的条目', { exact: true }).waitFor();

      const mineResponse = page.waitForResponse(response => response.url().includes('/api/reimburse/entries?scope=mine') && response.ok());
      await page.getByRole('button', { name: '本人', exact: true }).click();
      await mineResponse;
      await page.waitForFunction(() => document.querySelectorAll('.reimb-table tbody tr').length === 1);
      assert.equal(await page.getByText('其他成员的条目', { exact: true }).count(), 0);
    });
    console.log('PASS reimburse-scope: finance mine/all views refetch with correct server-side row counts');
  } finally { await hub.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
