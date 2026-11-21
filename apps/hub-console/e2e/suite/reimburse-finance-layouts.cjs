const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startV1Server, withBrowser, login, assertNoOverflow } = require('./lib/v1.cjs');

const outputDir = path.resolve(__dirname, '../../../../tmp/tasks/reimburse-finance-layouts');
const storageKey = 'teamhub.reimburse.financeLayout';
const layoutNames = { a: '待办优先', b: '批次工作台', c: '表格优先' };

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

async function action(hub, username, entry, name, extra = {}) {
  const response = await hub.api(username, 'POST', `/api/reimburse/entries/${entry.id}/workflow/${name}`, {
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

async function openReimburse(page) {
  await page.getByRole('button', { name: '报销', exact: true }).click();
  await page.locator('.reimb-page').waitFor();
}

async function chooseLayout(page, layout) {
  await page.getByRole('group', { name: '财务排版', exact: true }).getByRole('button', { name: layoutNames[layout], exact: true }).click();
  await assertLayout(page, layout);
}

async function assertLayout(page, layout) {
  await page.locator(`[data-finance-layout="${layout}"]`).waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-finance-layout]:visible').count(), 1);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const hub = await startV1Server();
  const screenshots = [];
  try {
    await seed(hub);
    await withBrowser(async page => {
      let entriesRequests = 0;
      page.on('request', request => {
        const url = new URL(request.url());
        if (url.pathname === '/api/reimburse/entries') entriesRequests += 1;
      });
      await login(page, hub, 'admin');
      await openReimburse(page);

      // Noise regressions: zero counts, one list title, and no finance-only summaries in Mine.
      assert.equal(await page.locator('.reimb-import-jobs__counts strong').count(), 0);
      assert.equal(await page.getByText('没有待处理', { exact: true }).count(), 1);
      assert.equal(await page.getByText('我的报销条目', { exact: true }).count(), 1);
      assert.equal(await page.locator('[aria-label="结构汇总"]').count(), 0);
      assert.equal(await page.locator('.finance-preview').count(), 0);

      await page.getByRole('button', { name: '财务工作台', exact: true }).click();
      await assertLayout(page, 'b');
      await page.getByText('视图：', { exact: true }).waitFor();
      const collapsedImports = page.locator('details.reimb-import-jobs--finance');
      await collapsedImports.waitFor();
      assert.equal(await collapsedImports.evaluate(element => element.open), false);
      assert.match(await collapsedImports.locator('summary').innerText(), /没有待处理作业/);

      // A persists across a full reload.
      await chooseLayout(page, 'a');
      assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), 'a');
      await page.reload();
      await openReimburse(page);
      await page.getByRole('button', { name: '财务工作台', exact: true }).click();
      await assertLayout(page, 'a');
      assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), 'a');

      // C persists across Mine -> Finance, and its filters survive layout switches.
      await chooseLayout(page, 'c');
      await page.getByRole('button', { name: '本人', exact: true }).click();
      await page.locator('.reimb-table tbody tr').first().waitFor();
      await page.getByRole('button', { name: '财务工作台', exact: true }).click();
      await assertLayout(page, 'c');
      assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), 'c');
      await page.getByLabel('搜索全队报销', { exact: true }).fill('高铁');
      assert.equal(await page.locator('[data-finance-layout="c"] .finance-focus-table tbody tr').count(), 1);
      await chooseLayout(page, 'a');
      await chooseLayout(page, 'c');
      assert.equal(await page.getByLabel('搜索全队报销', { exact: true }).inputValue(), '高铁');
      assert.equal(await page.locator('[data-finance-layout="c"] .finance-focus-table tbody tr').count(), 1);
      await page.getByLabel('搜索全队报销', { exact: true }).fill('');

      // Layout switches are presentation-only: no additional entries request in any mode.
      entriesRequests = 0;
      for (const layout of ['a', 'b', 'c']) {
        await chooseLayout(page, layout);
        assert.equal(entriesRequests, 0, `layout ${layout} refetched entries`);
      }

      for (const layout of ['a', 'b', 'c']) {
        await chooseLayout(page, layout);
        for (const width of [1440, 1000]) {
          await page.setViewportSize({ width, height: 900 });
          await assertLayout(page, layout);
          if (layout === 'a') {
            assert.equal(await page.locator('[data-finance-layout="a"] .finance-metric').count(), 4);
            assert.equal(await page.locator('[data-finance-layout="a"] .finance-collapsible').first().evaluate(element => element.open), false);
          }
          if (layout === 'b') {
            await page.locator('[data-finance-layout="b"] .finance-batch-nav__item').filter({ hasText: '11 月机器人采购' }).click();
            await page.locator('[data-finance-layout="b"]').getByRole('heading', { name: '11 月机器人采购', exact: true }).waitFor();
          }
          if (layout === 'c') {
            await page.getByRole('button', { name: '高级筛选', exact: true }).click();
            await page.getByRole('dialog', { name: '高级筛选', exact: true }).waitFor();
            await page.getByRole('button', { name: '查看结果', exact: true }).click();
            await page.locator('aside.drawer[aria-label="高级筛选"]').waitFor({ state: 'detached' });
          }
          await assertNoOverflow(page);
          assert.equal(entriesRequests, 0, `layout ${layout} at ${width}px refetched entries`);
          const screenshot = path.join(outputDir, `finance-${layout}-${width}.png`);
          await page.screenshot({ path: screenshot, fullPage: true });
          screenshots.push(screenshot);
        }
      }
    });
    console.log(`PASS reimburse-finance-layouts: ${screenshots.length} screenshots; persistence, filter retention, zero refetch, four noise assertions and overflow checks`);
    for (const screenshot of screenshots) console.log(`SCREENSHOT ${screenshot}`);
  } finally { await hub.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
