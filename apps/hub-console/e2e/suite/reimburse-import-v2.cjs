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
      await page.getByRole('button', { name: '报销设置', exact: true }).waitFor();
      await page.getByText('默认抬头：哈尔滨工业大学', { exact: true }).waitFor();
      assert.equal(await page.locator('.reimb-page__actions .btn--primary').count(), 1);
      assert.equal(await page.locator('.reimb-filters__actions > button:visible').count(), 0);
      assert.equal(await page.locator('.reimb-filters__actions > details > summary:visible').count(), 1);
      assert.equal(await page.locator('.console-topbar-title').innerText(), '');
      await page.getByRole('button', { name: '报销设置', exact: true }).click();
      await page.getByLabel('期望购买方名称', { exact: true }).fill('E2E 默认抬头');
      await page.getByLabel('期望统一社会信用代码', { exact: true }).fill('E2E-TAX-001');
      await page.getByRole('dialog', { name: '报销设置', exact: true }).getByRole('button', { name: '保存', exact: true }).click();
      await page.getByText('默认抬头：E2E 默认抬头', { exact: true }).waitFor();
      const profileResponse = await hub.api('admin', 'GET', '/api/reimburse/profile');
      assert.equal(profileResponse.statusCode, 200, profileResponse.body);
      assert.deepEqual(profileResponse.json().profile, { expectedPurchaserName: 'E2E 默认抬头', expectedPurchaserTaxNo: 'E2E-TAX-001' });
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '新建一笔', exact: true }).click();
      assert.equal(await page.getByLabel('购买方名称', { exact: true }).inputValue(), 'E2E 默认抬头');
      assert.equal(await page.getByLabel('购买方统一社会信用代码', { exact: true }).inputValue(), 'E2E-TAX-001');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '批量导入', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '批量导入', exact: true });
      await dialog.getByText('一次传多张，系统自动配对，你只确认', { exact: true }).waitFor();
      await assert.equal(await dialog.getByRole('button', { name: '打车', exact: true }).count(), 0);
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
      assert.equal(await page.getByLabel('购买方名称', { exact: true }).inputValue(), 'E2E 默认抬头');
      assert.equal(await page.getByLabel('购买方统一社会信用代码', { exact: true }).inputValue(), 'E2E-TAX-001');
      await page.getByRole('button', { name: '确认并建单', exact: true }).click();
      await page.locator('.reimb-import-jobs__archive').waitFor();
      assert.equal(await page.locator('.reimb-import-jobs > .reimb-import-jobs__list > .reimb-import-job[data-job-status="closed"]').count(), 0);
      const archive = page.locator('.reimb-import-jobs__archive');
      const closedJob = archive.locator('.reimb-import-job[data-job-status="closed"]');
      assert.equal(await closedJob.isVisible(), false);
      await archive.locator(':scope > summary').click();
      await closedJob.waitFor({ state: 'visible' });
      await closedJob.getByRole('button', { name: '重新解析', exact: true }).click();
      await page.locator('.reimb-import-job[data-job-status="closed"]').waitFor();
      await page.locator('.reimb-table tbody tr').filter({ hasText: '测试采购' }).waitFor();
      await page.locator('.reimb-import-job__files summary').click();
      await page.getByText('20261120-E2E导入商店-36.80.xml', { exact: true }).waitFor();
      await assertNoOverflow(page);
    });
    console.log('PASS reimburse-import-v2: upload, server parse, persistent review, confirm, renamed evidence');
  } finally { await hub.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
