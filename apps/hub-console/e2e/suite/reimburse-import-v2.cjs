const assert = require('node:assert/strict');
const { startV1Server, withBrowser, login, assertNoOverflow } = require('./lib/v1.cjs');

const invoice = '<?xml version="1.0"?><Invoice><EIid>22345678901234567890</EIid><IssueTime>2026-11-20</IssueTime><SellerName>E2E导入商店</SellerName><TotalTax-includedAmount>36.80</TotalTax-includedAmount><Item><ItemName>测试采购</ItemName><Quantity>1</Quantity><Amount>36.80</Amount></Item></Invoice>';
const payment = '支付成功\n交易金额：￥36.80\n交易单号：E2E-IMPORT-V2';

(async () => {
  const hub = await startV1Server();
  try {
    await withBrowser(async page => {
      await login(page, hub, 'admin');
      await page.getByRole('button', { name: '报销', exact: true }).click();
      await page.locator('.reimb-page').waitFor();
      for (const label of ['状态', '流程', '类型']) await assert.equal(await page.getByLabel(label, { exact: true }).count(), 1);
      await page.getByRole('button', { name: '导入票据', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '导入票据', exact: true });
      await dialog.locator('input[type="file"]').setInputFiles([
        { name: 'invoice.xml', mimeType: 'application/xml', buffer: Buffer.from(invoice) },
        { name: 'payment.xml', mimeType: 'application/xml', buffer: Buffer.from(payment) },
      ]);
      await page.locator('.reimb-import-job[data-job-status="ready"]').waitFor();
      await page.keyboard.press('Escape');
      await page.reload();
      await page.getByRole('button', { name: '报销', exact: true }).click();
      await page.locator('.reimb-import-job[data-job-status="ready"]').waitFor();
      await page.getByRole('button', { name: '核对并建单', exact: true }).click();
      await page.getByRole('button', { name: '确认并建单', exact: true }).click();
      await page.locator('.reimb-import-job[data-job-status="closed"]').waitFor();
      await page.locator('.reimb-table tbody tr').filter({ hasText: 'E2E导入商店' }).waitFor();
      await page.locator('.reimb-import-job__files summary').click();
      await page.getByText('20261120-E2E导入商店-36.80.xml', { exact: true }).waitFor();
      await assertNoOverflow(page);
    });
    console.log('PASS reimburse-import-v2: upload, server parse, persistent review, confirm, renamed evidence');
  } finally { await hub.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
