const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startV1Server, withBrowser, login, assertNoOverflow } = require('./lib/v1.cjs');

const outputDir = path.resolve(__dirname, '../../../../tmp/tasks/reimburse-ux-pass');
const invoice = '<?xml version="1.0"?><Invoice><EIid>32345678901234567890</EIid><IssueTime>2026-11-20</IssueTime><SellerName>合成测试商店</SellerName><TotalTax-includedAmount>18.60</TotalTax-includedAmount><Item><ItemName>合成测试物料</ItemName><Quantity>1</Quantity><Amount>18.60</Amount></Item></Invoice>';

function importFile(id, status) {
  return {
    id: `reif-${id}`, originalName: `${id}.xml`, displayName: `${id}.xml`, ext: '.xml', sizeBytes: 128,
    sha256: `synthetic-${id}`, role: 'invoice', status, amountFen: null, confidence: null,
    parsed: null, candidates: { seller: [], purchaserName: [], invoiceNo: [], invoiceDate: [], amounts: [] },
    error: status === 'unreadable' ? 'xml: parse failed' : null, removedAt: status === 'removed' ? '2026-11-20T00:00:00.000Z' : null,
  };
}

function importJob(id, status, queuePosition, files) {
  return {
    id: `reimp-${id}`, memberId: 'member-v1-4', status, queuePosition,
    createdAt: '2026-11-20T00:00:00.000Z', updatedAt: '2026-11-20T00:00:00.000Z',
    files, pairs: [], confirmedEntryIds: [], history: [], error: null,
  };
}

async function openReimburse(page) {
  await page.getByRole('button', { name: '报销', exact: true }).click();
  await page.locator('.reimb-page').waitFor();
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const hub = await startV1Server();
  const screenshots = [];
  try {
    const created = await hub.api('admin', 'POST', '/api/reimburse/entries', {
      kind: 'expense', expenseType: 'purchase', summary: '合成报销条目', recognitionSource: 'manual',
      invoiceDate: '2026-11-20', totalAmountFen: 1860, items: [],
      materials: { invoice: false, paymentShot: false, inspection: false },
    });
    assert.equal(created.statusCode, 201, created.body);

    await withBrowser(async page => {
      await login(page, hub, 'admin');
      await openReimburse(page);
      const row = page.locator('.reimb-table tbody tr').filter({ hasText: '合成报销条目' });
      await row.getByRole('button', { name: '查看 / 编辑', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '查看 / 编辑', exact: true });
      await dialog.waitFor();
      assert.ok((await dialog.getAttribute('class')).includes('drawer--center'));
      assert.ok((await dialog.getAttribute('class')).includes('drawer--lg'));
      assert.equal(await page.locator('.reimb-evidence__toggle').getAttribute('aria-expanded'), 'true');
      assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
      await page.locator('.reimb-evidence__kind').first().getByRole('button', { name: '上传原件', exact: true }).click();
      await page.locator('.reimb-evidence input[type="file"]').setInputFiles({ name: 'synthetic-invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('synthetic evidence only') });
      await page.getByText('synthetic-invoice.pdf', { exact: true }).waitFor();
      const evidenceItem = page.locator('.reimb-evidence__list li').filter({ hasText: 'synthetic-invoice.pdf' });
      await evidenceItem.locator('.reimb-evidence__kind-badge').getByText('发票原件', { exact: true }).waitFor();
      assert.match(await evidenceItem.getByRole('link', { name: '下载', exact: true }).getAttribute('href'), /\/evidence\/.*\/download$/);

      for (const width of [1440, 1000]) {
        await page.setViewportSize({ width, height: 1000 });
        await assertNoOverflow(page);
        const box = await dialog.boundingBox();
        assert.ok(box.width <= 1000 && box.width <= width, JSON.stringify(box));
        const screenshot = path.join(outputDir, `entry-detail-${width}.png`);
        await page.screenshot({ path: screenshot, fullPage: true });
        screenshots.push(screenshot);
      }
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');

      const exportMenu = page.locator('.reimb-more');
      assert.equal((await exportMenu.locator('summary').innerText()).trim(), '导出');
      await exportMenu.locator('summary').click();
      assert.deepEqual(await exportMenu.locator('.reimb-more__menu button').allInnerTexts(), ['仅导出 XLSX', '导出 XLSX + 原件']);
      assert.equal(await exportMenu.getByText('更多', { exact: true }).count(), 0);
      await exportMenu.locator('summary').click();

      const jobs = [
        importJob('parsing', 'parsing', null, [importFile('parsed', 'parsed'), importFile('failed', 'unreadable'), importFile('waiting', 'uploading'), importFile('removed', 'removed')]),
        importJob('queued', 'queued', 2, [importFile('queued-file', 'pending')]),
      ];
      await page.route('**/api/reimburse/imports', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jobs }) }));
      await page.reload();
      await openReimburse(page);
      const parsingCard = page.locator('.reimb-import-job[data-job-status="parsing"]');
      await parsingCard.locator('small').filter({ hasText: '解析中 · 已解析 2/3（失败 1）' }).waitFor();
      const parsingShot = path.join(outputDir, 'import-parsing.png');
      await parsingCard.screenshot({ path: parsingShot });
      screenshots.push(parsingShot);
      const queuedCard = page.locator('.reimb-import-job[data-job-status="queued"]');
      await queuedCard.locator('small').filter({ hasText: '排队中 · 第 2 位' }).waitFor();
      assert.equal(await queuedCard.getByRole('button', { name: '重新解析', exact: true }).count(), 0);
      assert.equal(await queuedCard.getByRole('button', { name: '删除作业', exact: false }).count(), 0);
      const queuedShot = path.join(outputDir, 'import-queued.png');
      await queuedCard.screenshot({ path: queuedShot });
      screenshots.push(queuedShot);
      await assertNoOverflow(page);

      await page.unroute('**/api/reimburse/imports');
      await page.reload();
      await openReimburse(page);
      await page.getByRole('button', { name: '批量导入', exact: true }).click();
      await page.getByRole('dialog', { name: '批量导入', exact: true }).locator('input[type="file"]').setInputFiles({ name: 'purge-invoice.xml', mimeType: 'application/xml', buffer: Buffer.from(invoice) });
      const readyCard = page.locator('.reimb-import-job[data-job-status="ready"]');
      await readyCard.waitFor();
      await page.keyboard.press('Escape');
      await page.getByRole('dialog', { name: '批量导入', exact: true }).waitFor({ state: 'detached' });
      const listed = await hub.api('admin', 'GET', '/api/reimburse/imports');
      const jobId = listed.json().jobs[0].id;
      page.once('dialog', async confirmation => {
        assert.match(confirmation.message(), /所有原件文件会一起删除/);
        assert.match(confirmation.message(), /无法恢复/);
        await confirmation.accept();
      });
      await readyCard.getByRole('button', { name: '删除作业', exact: false }).click();
      await readyCard.waitFor({ state: 'detached' });
      const purged = await hub.api('admin', 'GET', `/api/reimburse/imports/${jobId}`);
      assert.equal(purged.statusCode, 404);
    });
    console.log(`PASS reimburse-ux-pass: centered evidence, export labels, progress, queue, purge; ${screenshots.length} screenshots`);
    for (const screenshot of screenshots) console.log(`SCREENSHOT ${screenshot}`);
  } finally { await hub.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
