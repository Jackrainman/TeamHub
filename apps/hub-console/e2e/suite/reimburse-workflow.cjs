const assert = require('node:assert/strict');
const { startV1Server, withBrowser, login, assertNoOverflow } = require('./lib/v1.cjs');

(async () => {
  const hub = await startV1Server();
  try {
    await withBrowser(async page => {
      await login(page, hub, 'admin');
      await page.getByRole('button', { name: '报销', exact: true }).click();
      await page.locator('.reimb-page').waitFor();
      await page.getByRole('button', { name: '打车', exact: true }).click();
      await page.getByLabel('费用摘要', { exact: true }).fill('E2E交通报销');
      await page.getByLabel('发票号码', { exact: true }).fill('E2E-TAXI-001');
      await page.getByLabel('开票日期', { exact: true }).fill('2026-11-01');
      await page.getByLabel('销售方', { exact: true }).fill('测试出租车公司');
      await page.getByLabel('价税合计（元）', { exact: true }).fill('24.50');
      await page.getByRole('button', { name: '提交', exact: true }).click();
      const row = page.locator('.reimb-table tbody tr').filter({ hasText: 'E2E交通报销' });
      await row.waitFor();
      await row.getByRole('button', { name: '查看 / 编辑', exact: true }).click();
      const card = page.locator('.reimb-entry');
      await card.getByRole('button', { name: '凭证留档', exact: false }).click();
      const groups = page.locator('.reimb-evidence__kind');
      await groups.nth(0).getByRole('button', { name: '上传原件', exact: true }).click();
      await page.locator('.reimb-evidence input[type="file"]').setInputFiles({ name: 'invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('e2e invoice') });
      await page.getByText('invoice.pdf', { exact: true }).waitFor();
      await groups.nth(1).getByRole('button', { name: '上传原件', exact: true }).click();
      await page.locator('.reimb-evidence input[type="file"]').setInputFiles({ name: 'payment.png', mimeType: 'image/png', buffer: Buffer.from('e2e payment') });
      await page.getByText('payment.png', { exact: true }).waitFor();
      await card.getByRole('button', { name: '提交财务', exact: true }).click();
      await card.getByRole('button', { name: '接收核对', exact: true }).click();
      await card.getByRole('button', { name: '记录已核对当前材料', exact: true }).click();
      await card.getByRole('button', { name: '核准', exact: true }).click();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '财务工作台', exact: true }).click();
      await row.getByRole('checkbox').check();
      await page.getByRole('button', { name: '登记打款结果', exact: true }).click();
      await page.getByRole('dialog', { name: '登记打款结果', exact: true }).getByRole('button', { name: '登记打款结果', exact: true }).click();
      await row.locator('.badge').filter({ hasText: /^完成$/ }).waitFor();
      await assertNoOverflow(page);
    });
    console.log('PASS reimburse-workflow: UI create, evidence, submit, check, approve, payout');
  } finally { await hub.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
