import { expect, test } from 'vitest';
import { ReimburseEntrySchema, deriveReimburseStatus, deriveReimburseFinancialSummary, deriveReimburseExportRow, DEFAULT_REIMBURSE_PROFILE } from '../src/index.js';

test('unknown money stays unknown, cannot be eligible, and exports blank', () => {
  const entry = ReimburseEntrySchema.parse({
    id: 'entry', projectId: 'project', memberId: 'member', batchId: null,
    kind: 'expense', invoiceType: 'unknown', invoiceNo: '123', invoiceDate: '2026-11-04',
    seller: 'shop', purchaserName: DEFAULT_REIMBURSE_PROFILE.expectedPurchaserName,
    purchaserTaxNo: DEFAULT_REIMBURSE_PROFILE.expectedPurchaserTaxNo,
    recognitionSource: 'manual', totalAmountFen: null, items: [], actualItemName: null,
    materials: { paymentShot: true, inspection: true }, note: null,
    createdAt: '2026-11-04T00:00:00Z', updatedAt: '2026-11-04T00:00:00Z',
  });
  expect(entry.totalAmountFen).toBeNull();
  expect(deriveReimburseStatus(entry)).toBe('partial');
  expect(deriveReimburseFinancialSummary([entry], DEFAULT_REIMBURSE_PROFILE).eligible.count).toBe(0);
  expect(deriveReimburseExportRow(entry, DEFAULT_REIMBURSE_PROFILE).totalYuan).toBe('');
  expect(deriveReimburseExportRow({ ...entry, totalAmountFen: 12345 }, DEFAULT_REIMBURSE_PROFILE).totalYuan).toBe('123.45');
});
