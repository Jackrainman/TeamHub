const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startV1Server, withBrowser, login, assertNoOverflow } = require('./lib/v1.cjs');

const outputDir = path.resolve(__dirname, '../../../../tmp/tasks/finance-layouts');

async function createEntry(hub, username, summary, amountFen, batchId) {
  const created = await hub.api(username, 'POST', '/api/reimburse/entries', {
    kind: 'expense', expenseType: 'purchase', summary, recognitionSource: 'manual',
    invoiceDate: '2026-11-17', totalAmountFen: amountFen, items: [],
    materials: { invoice: true, paymentShot: true, inspection: false },
  });
  assert.equal(created.statusCode, 201, created.body);
  let entry = created.json().entry;
  if (batchId) {
    const assigned = await hub.api('admin', 'PATCH', `/api/reimburse/entries/${entry.id}`, { batchId, expectedRevision: entry.revision });
    assert.equal(assigned.statusCode, 200, assigned.body);
    entry = assigned.json().entry;
  }
  return entry;
}

async function action(hub, username, entry, action, extra = {}) {
  const response = await hub.api(username, 'POST', `/api/reimburse/entries/${entry.id}/workflow/${action}`, {
    expectedRevision: entry.revision, ...extra,
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().entry;
}

async function seed(hub) {
  const batches = [];
  for (const name of ['11 月机器人采购', '12 月差旅交付']) {
    const response = await hub.api('admin', 'POST', '/api/reimburse/batches', { name });
    assert.equal(response.statusCode, 201, response.body);
    batches.push(response.json().batch);
  }

  let submitted = await createEntry(hub, 'owner', '视觉相机支架采购', 32800, batches[0].id);
  submitted = await action(hub, 'owner', submitted, 'submit');

  let reviewing = await createEntry(hub, 'owner', '调试场地往返打车', 4600, batches[0].id);
  reviewing = await action(hub, 'owner', reviewing, 'submit');
  reviewing = await action(hub, 'admin', reviewing, 'accept');

  let pending = await createEntry(hub, 'owner', '参赛高铁票', 53600, batches[0].id);
  pending = await action(hub, 'owner', pending, 'submit');
  pending = await action(hub, 'admin', pending, 'accept');
  pending = await action(hub, 'admin', pending, 'approve', { reason: '材料已核对', approvedAmountFen: 53600 });

  let completed = await createEntry(hub, 'reviewer', '队服与资料打印', 2800, batches[1].id);
  completed = await action(hub, 'reviewer', completed, 'submit');
  completed = await action(hub, 'admin', completed, 'accept');
  completed = await action(hub, 'admin', completed, 'approve', { reason: '材料已核对', approvedAmountFen: 2800 });
  const payout = await hub.api('admin', 'POST', '/api/reimburse/payouts', {
    entries: [{ id: completed.id, expectedRevision: completed.revision }], amountFen: 2800,
    paidAt: '2026-11-20T04:00:00.000Z', method: 'bank', transactionRef: 'DEMO-PAYOUT-001',
  });
  assert.equal(payout.statusCode, 201, payout.body);

  let returned = await createEntry(hub, 'owner', '紧固件补充采购', 12900, null);
  returned = await action(hub, 'owner', returned, 'submit');
  returned = await action(hub, 'admin', returned, 'accept');
  await action(hub, 'admin', returned, 'return', { reason: '请补充付款截图' });
  await createEntry(hub, 'admin', '财务本人的车票', 18800, null);
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const hub = await startV1Server();
  const screenshots = [];
  try {
    await seed(hub);
    await withBrowser(async page => {
      await login(page, hub, 'admin');
      for (const layout of ['a', 'b', 'c']) {
        for (const width of [1440, 1000]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`${hub.baseUrl}?financeLayout=${layout}`);
          await page.getByRole('button', { name: '报销', exact: true }).click();
          await page.getByRole('button', { name: '财务工作台', exact: true }).click();
          const preview = page.locator(`[data-finance-layout="${layout}"]`);
          await preview.waitFor();
          if (layout === 'a') {
            assert.equal(await page.locator('.finance-metric').count(), 4);
            assert.equal(await page.locator('.finance-collapsible').first().evaluate(element => element.open), false);
          }
          if (layout === 'b') {
            await page.locator('.finance-batch-nav__item').filter({ hasText: '11 月机器人采购' }).click();
            await page.getByRole('heading', { name: '11 月机器人采购', exact: true }).waitFor();
          }
          if (layout === 'c') {
            await page.getByRole('button', { name: '高级筛选', exact: true }).click();
            await page.getByRole('dialog', { name: '高级筛选', exact: true }).waitFor();
            await page.getByRole('button', { name: '查看结果', exact: true }).click();
            await page.locator('aside.drawer[aria-label="高级筛选"]').waitFor({ state: 'detached' });
            await page.getByLabel('搜索全队报销', { exact: true }).fill('高铁');
            assert.equal(await page.locator('.finance-focus-table tbody tr').count(), 1);
            await page.getByLabel('搜索全队报销', { exact: true }).fill('');
          }
          await assertNoOverflow(page);
          const screenshot = path.join(outputDir, `finance-${layout}-${width}.png`);
          await page.screenshot({ path: screenshot, fullPage: true });
          screenshots.push(screenshot);
        }
      }
    });
    console.log(`PASS reimburse-finance-layouts: ${screenshots.length} full-page screenshots, real workflow data, interactions and overflow checks`);
    for (const screenshot of screenshots) console.log(`SCREENSHOT ${screenshot}`);
  } finally { await hub.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
