import { expect, test } from 'vitest';
import { classifyInvoiceType, derivePackageReview, type PackageCandidate } from '../src/domains/reimburse/import-package.js';
import { DEFAULT_REIMBURSE_PROFILE } from '../src/index.js';

function candidate(no: string, source: 'pdf' | 'xml' = 'pdf'): PackageCandidate {
  return { path: `invoice.${source}`, role: 'invoice', invoiceType: 'vatOrdinary', invoice: {
    invoiceNo: no, invoiceDate: null, seller: null, purchaserName: null, purchaserTaxNo: null,
    totalAmountFen: 100, recognitionSource: source, items: [],
  } };
}
test('same invoice chooses structured source; payment stays a separate material', () => {
  const result = derivePackageReview([candidate('123'), { ...candidate('123', 'xml'), invoiceType: 'unknown' },
    { path: 'payment.jpg', role: 'paymentShot', invoice: null, invoiceType: 'unknown' },
  ], DEFAULT_REIMBURSE_PROFILE);
  expect(result.selectedInvoice?.recognitionSource).toBe('xml');
  expect(result.invoiceType).toBe('vatOrdinary');
  expect(result.missingMaterials).toEqual([]);
  expect(result.reviewReasons).toContain('invoice-date-missing');
});
test('different invoice numbers conflict and never sum amounts or split a package', () => {
  const result = derivePackageReview([candidate('123'), candidate('456')], DEFAULT_REIMBURSE_PROFILE);
  expect(result.conflictingInvoiceNos).toEqual(['123', '456']);
  expect(result.selectedInvoice).toBeNull();
});
test('unknown numbers cannot be used to deduplicate distinct invoice candidates', () => {
  expect(derivePackageReview([candidate(''), candidate('')], DEFAULT_REIMBURSE_PROFILE).reviewReasons).toContain('ambiguous-invoices');
});
test('payment-only package does not manufacture invoice fields', () => {
  const result = derivePackageReview([{ ...candidate('123'), role: 'paymentShot' }], DEFAULT_REIMBURSE_PROFILE);
  expect(result.selectedInvoice).toBeNull();
  expect(result.missingMaterials).toEqual(['invoice']);
});
test('types require explicit invoice evidence, and differing amounts need review', () => {
  expect(classifyInvoiceType('电子发票（增值税专用发票）')).toBe('vatSpecial');
  expect(classifyInvoiceType('铁路电子客票')).toBe('railway');
  expect(classifyInvoiceType('付款成功 ¥100.00')).toBe('unknown');
  const second = candidate('123', 'xml'); second.invoice!.totalAmountFen = 200;
  expect(derivePackageReview([candidate('123'), second], DEFAULT_REIMBURSE_PROFILE).reviewReasons).toContain('amount-conflict');
});
