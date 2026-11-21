const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { startV1Server, withBrowser, login, assertNoOverflow } = require('./lib/v1.cjs');

const ROOT = path.resolve(__dirname, '../../../..');
async function load(relative) { return import(pathToFileURL(path.join(ROOT, relative)).href); }
function pdfFixture() {
  const stream = 'BT /F1 24 Tf 72 720 Td (Invoice Preview) Tj ET';
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];
  let text = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) { offsets.push(Buffer.byteLength(text)); text += object; }
  const xref = Buffer.byteLength(text);
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) text += `${String(offset).padStart(10, '0')} 00000 n \n`;
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(text);
}

async function seedReviewJob(hub) {
  const { ReimburseImportJobSchema } = await load('apps/hub-contracts/dist/index.js');
  const id = 'reimp-review-preview-e2e';
  const invoiceId = 'reif-review-invoice-pdf';
  const paymentId = 'reif-review-payment-png';
  const emptyCandidates = () => ({ seller: [], purchaserName: [], invoiceNo: [], invoiceDate: [], amounts: [] });
  const invoice = {
    invoiceNo: '22345678901234567890', invoiceType: 'vatOrdinary', invoiceDate: '2026-11-20',
    seller: 'E2E 解析商店', purchaserName: 'E2E 购买方', purchaserTaxNo: null,
    recognitionSource: 'ocr', totalAmountFen: 3680,
    items: [{ name: 'E2E 采购', unit: null, quantity: 1, unitPriceFen: null, amountFen: 3680 }],
  };
  const files = [
    { id: invoiceId, originalName: 'review-invoice.pdf', displayName: 'review-invoice.pdf', ext: '.pdf', sizeBytes: 1,
      sha256: 'review-invoice-sha', role: 'invoice', status: 'parsed', amountFen: 3680, confidence: 91, parsed: invoice,
      candidates: { seller: ['E2E 解析商店', 'E2E 第二商店'], purchaserName: ['E2E 购买方'], invoiceNo: ['22345678901234567890'], invoiceDate: ['2026-11-20'], amounts: [3680, 4000] }, error: null, removedAt: null },
    { id: paymentId, originalName: 'review-payment.png', displayName: 'review-payment.png', ext: '.png', sizeBytes: 1,
      sha256: 'review-payment-sha', role: 'paymentShot', status: 'parsed', amountFen: 3680, confidence: 88, parsed: null,
      candidates: { ...emptyCandidates(), amounts: [3680] }, error: null, removedAt: null },
  ];
  const draft = {
    kind: 'goods', expenseType: 'purchase', summary: 'E2E 采购', invoiceType: 'vatOrdinary', invoiceNo: null,
    invoiceDate: '2026-11-20', seller: '手工保留销方', purchaserName: 'E2E 购买方', purchaserTaxNo: null,
    recognitionSource: 'ocr', totalAmountFen: 3680, items: invoice.items, actualItemName: 'E2E 采购',
    materials: { invoice: true, paymentShot: true, inspection: false }, note: null,
  };
  const pair = { id: 'reip-review-preview-e2e', status: 'matched', fileIds: [invoiceId, paymentId], invoiceFileIds: [invoiceId],
    paymentFileIds: [paymentId], amountFen: 3680, draft, confidence: 'high', reasons: ['ocr-recognition'], reason: null, confirmedEntryId: null };
  const job = ReimburseImportJobSchema.parse({ id, memberId: hub.ids.admin, status: 'ready', createdAt: '2026-11-20T00:00:00.000Z',
    updatedAt: '2026-11-20T00:00:00.000Z', files, pairs: [pair], confirmedEntryIds: [], history: [], error: null });
  hub.database.db.insertRow('reimburse_import_jobs', id, job);
  const directory = path.join(hub.root, 'imports', id);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `${invoiceId}.pdf`), pdfFixture());
  fs.copyFileSync(path.join(ROOT, 'apps/hub-console/public/logo.png'), path.join(directory, `${paymentId}.png`));
}

(async () => {
  const hub = await startV1Server();
  try {
    await seedReviewJob(hub);
    await withBrowser(async page => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await login(page, hub, 'admin');
      await page.getByRole('button', { name: '报销', exact: true }).click();
      await page.getByRole('button', { name: '核对并建单', exact: true }).click();
      const review = page.getByRole('dialog', { name: '核对并建单', exact: true });
      await review.locator('.reimb-preview-card').first().waitFor();
      assert.equal(await review.locator('.reimb-preview-card').count(), 2);
      await review.getByText('发票', { exact: true }).waitFor();
      await review.getByText('付款截图', { exact: true }).waitFor();
      await review.locator('.reimb-preview-card__name').getByText('review-invoice.pdf', { exact: true }).waitFor();
      await review.locator('.reimb-preview-card__name').getByText('review-payment.png', { exact: true }).waitFor();
      await page.waitForFunction(() => {
        const canvas = document.querySelector('.reimb-preview-card .reimb-pdf-canvas[data-state="ready"] canvas');
        const image = document.querySelector('.reimb-preview-card img');
        return canvas && canvas.width > 0 && image && image.complete && image.naturalWidth > 0;
      });
      const columns = await page.evaluate(() => {
        const preview = document.querySelector('.reimb-import-review__preview').getBoundingClientRect();
        const form = document.querySelector('.reimb-entry-form--review').getBoundingClientRect();
        return { previewRight: preview.right, formLeft: form.left, previewTop: preview.top, formTop: form.top };
      });
      assert.ok(columns.previewRight <= columns.formLeft, JSON.stringify(columns));
      assert.ok(Math.abs(columns.previewTop - columns.formTop) < 2, JSON.stringify(columns));

      assert.equal(await page.getByLabel('销售方', { exact: true }).inputValue(), '手工保留销方');
      await page.getByRole('button', { name: '填入销售方：E2E 第二商店', exact: true }).click();
      assert.equal(await page.getByLabel('销售方', { exact: true }).inputValue(), 'E2E 第二商店');
      await page.getByRole('button', { name: '填入发票号码：22345678901234567890', exact: true }).click();
      assert.equal(await page.getByLabel('发票号码', { exact: true }).inputValue(), '22345678901234567890');
      await page.getByRole('button', { name: '填入价税合计（元）：40.00', exact: true }).click();
      assert.equal(await page.getByLabel('价税合计（元）', { exact: true }).inputValue(), '40.00');

      const paymentTrigger = page.getByRole('button', { name: '放大查看付款截图：review-payment.png', exact: true });
      await paymentTrigger.click();
      const viewer = page.getByRole('dialog', { name: '查看付款截图：review-payment.png', exact: true });
      await viewer.waitFor();
      for (let index = 0; index < 4; index += 1) await viewer.getByRole('button', { name: '放大', exact: true }).click();
      assert.equal(await viewer.getByLabel('缩放比例', { exact: true }).innerText(), '200%');
      assert.match(await viewer.locator('.reimb-viewer__transform').getAttribute('style'), /scale\(2\)/);
      await viewer.locator('.reimb-viewer__stage').dispatchEvent('wheel', { deltaY: -120 });
      assert.notEqual(await viewer.getByLabel('缩放比例', { exact: true }).innerText(), '200%');
      await viewer.getByRole('button', { name: '重置为 100%', exact: true }).click();
      const stage = await viewer.locator('.reimb-viewer__stage').boundingBox();
      await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
      await page.mouse.down();
      await page.mouse.move(stage.x + stage.width / 2 + 70, stage.y + stage.height / 2 + 30, { steps: 4 });
      await page.mouse.up();
      assert.match(await viewer.locator('.reimb-viewer__transform').getAttribute('style'), /translate\(70px, 30px\)/);
      await page.keyboard.press('Escape');
      await viewer.waitFor({ state: 'detached' });
      await review.waitFor();
      await page.waitForFunction(() => document.querySelector('.reimb-entry-form--review')?.contains(document.activeElement));

      await page.getByRole('button', { name: '放大查看发票：review-invoice.pdf', exact: true }).click();
      const pdfViewer = page.getByRole('dialog', { name: '查看发票：review-invoice.pdf', exact: true });
      await pdfViewer.waitFor();
      await page.waitForFunction(() => document.querySelector('.reimb-viewer .reimb-pdf-canvas')?.dataset.state === 'ready');
      await pdfViewer.getByRole('button', { name: '关闭原件查看器', exact: true }).click();
      await pdfViewer.waitFor({ state: 'detached' });

      await page.setViewportSize({ width: 900, height: 1000 });
      const stacked = await page.evaluate(() => {
        const preview = document.querySelector('.reimb-import-review__preview').getBoundingClientRect();
        const form = document.querySelector('.reimb-entry-form--review').getBoundingClientRect();
        return { previewBottom: preview.bottom, formTop: form.top };
      });
      assert.ok(stacked.previewBottom <= stacked.formTop, JSON.stringify(stacked));
      await assertNoOverflow(page);
    });
    console.log('PASS reimburse-review-preview: dual originals, PDF/image render, candidate chips, zoom/wheel/pan/Esc/focus, responsive stack');
  } finally { await hub.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
