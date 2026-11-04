import { expect, test, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { analyzeReimbursePackage } from '../src/features/reimburse/lib/package-import';

const xml = '<Invoice><EIid>24312000000012345678</EIid><IssueTime>2026-07-01</IssueTime><SellerName>Shop</SellerName><TotalTax-includedAmount>113.00</TotalTax-includedAmount></Invoice>';
test('one ZIP stays one draft and retains invoice plus payment original', async () => {
  const file = new File([zipSync({ 'invoice.xml': strToU8(xml), 'payment.jpg': new Uint8Array([255,216,255,217]) })], 'one.zip');
  const result = await analyzeReimbursePackage(file, { extractOcrText: async () => ({ lines: ['支付成功 113.00'], confidence: 90 }) });
  expect(result.kind).toBe('draft');
  if (result.kind !== 'draft') return;
  expect(result.attachments).toHaveLength(2);
  expect(result.review.selectedInvoice?.invoiceNo).toBe('24312000000012345678');
  expect(result.review.missingMaterials).toEqual([]);
});
test('standalone images become one manual draft each when OCR is unavailable', async () => {
  const results = await Promise.all(['1.jpg', '2.JPG', '3.jpeg'].map(name => analyzeReimbursePackage(new File([new Uint8Array([255,216,255,217])], name))));
  expect(results.every(result => result.kind === 'draft')).toBe(true);
  expect(results.filter(result => result.kind === 'draft').every(result => result.notices.some(n => n.reason === 'ocr-unavailable'))).toBe(true);
});

test('text PDFs skip OCR; failed image OCR retains the original for manual correction', async () => {
  const ocr = vi.fn().mockRejectedValue(new Error('unavailable'));
  const pdf = await analyzeReimbursePackage(new File(['%PDF'], 'invoice.pdf'), {
    extractPdfLines: async () => ['发票号码：24312000000012345678', '价税合计（小写）123.45'], extractOcrText: ocr,
  });
  expect(pdf.kind).toBe('draft');
  expect(ocr).not.toHaveBeenCalled();
  const image = await analyzeReimbursePackage(new File([new Uint8Array([255,216,255,217])], 'image.jpg'), { extractOcrText: ocr });
  expect(image.kind).toBe('draft');
  if (image.kind === 'draft') {
    expect(image.attachments).toHaveLength(1);
    expect(image.notices[0].reason).toBe('ocr-failed');
  }
});
test('unsupported members are listed; multiple invoices stay one conflict draft', async () => {
  const result = await analyzeReimbursePackage(new File([zipSync({
    'one.xml': strToU8(xml), 'two.xml': strToU8(xml.replace('24312000000012345678', '24312000000012345679')),
    'notes.txt': strToU8('notes'),
  })], 'mixed.zip'));
  expect(result.kind).toBe('draft');
  if (result.kind !== 'draft') return;
  expect(result.review.conflictingInvoiceNos).toHaveLength(2);
  expect(result.review.selectedInvoice).toBeNull();
  expect(result.notices).toContainEqual({ fileName: 'notes.txt', reason: 'unsupported' });
});
test('bad file and renamed executables are rejected without affecting following inputs', async () => {
  expect((await analyzeReimbursePackage(new File(['not a zip'], 'broken.zip'))).kind).toBe('failed');
  expect((await analyzeReimbursePackage(new File(['MZ exe'], 'fake.jpg'))).kind).toBe('failed');
  expect((await analyzeReimbursePackage(new File([xml], 'good.xml'))).kind).toBe('draft');
});

test('duplicate normalized ZIP paths are rejected instead of silently replacing originals', async () => {
  const zip = zipSync({ 'a.xml': strToU8(xml), 'b.xml': strToU8(xml) });
  // Replace the equal-length second name in local and central headers.
  for (let i = 0; i < zip.length - 4; i++) {
    if (zip[i] === 98 && zip[i+1] === 46 && zip[i+2] === 120 && zip[i+3] === 109 && zip[i+4] === 108) zip[i] = 97;
  }
  expect((await analyzeReimbursePackage(new File([zip], 'duplicate.zip'))).kind).toBe('failed');
});
