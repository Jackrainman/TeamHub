import { expect, test } from 'vitest';
import {
  ReimburseEntrySchema,
  deriveReimburseDeliveryRow,
  deriveReimburseStructuralSummary,
  type ReimburseEntry,
  type ReimbursePayout,
} from '../src/index.js';

function entry(id: string, expenseType: 'purchase' | 'taxi' | 'ticket' | 'other' | null, amount: number | null, workflowStatus = 'draft'): ReimburseEntry {
  return ReimburseEntrySchema.parse({
    id, projectId: 'prj', seasonId: '2027RC', memberId: 'm-a', batchId: null,
    kind: expenseType === 'purchase' ? 'goods' : 'expense', expenseType, summary: `合成${id}`,
    invoiceType: 'unknown', invoiceNo: '00123456789012345678', invoiceDate: null, seller: null,
    purchaserName: null, purchaserTaxNo: null, recognitionSource: 'manual', totalAmountFen: amount,
    items: [], actualItemName: null, materials: { invoice: false, paymentShot: false, inspection: false }, note: null,
    workflowStatus, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
  });
}

test('结构汇总排除撤销、单列未知金额且没有按人维度', () => {
  const paid = entry('a', 'purchase', 1000, 'completed');
  paid.approvedAmountFen = 1000;
  const entries = [paid, entry('b', 'purchase', null), entry('c', 'taxi', 500), entry('d', null, null), entry('e', 'other', 900, 'cancelled')];
  const payout: ReimbursePayout = { id: 'payout', projectId: 'prj', recipientId: 'm-a', entryIds: ['a'], amountFen: 1000, paidAt: '2026-11-12T00:00:00Z', method: 'bank', transactionRef: null, note: null, recordedBy: 'finance', recordedAt: '2026-11-12T00:00:00Z' };
  const summary = deriveReimburseStructuralSummary(entries, [payout]);
  expect(summary).toMatchObject({ count: 4, unknownAmountCount: 2, unclassifiedCount: 1 });
  expect(summary.types.find((row) => row.expenseType === 'purchase')).toMatchObject({ count: 2, unknownAmountCount: 1, requestedAmountFen: 1000, paidAmountFen: 1000 });
  expect(summary.types.find((row) => row.expenseType === 'other')?.count).toBe(0);
  expect(JSON.stringify(summary)).not.toContain('m-a');
});

test('交付行未知金额留 null，打款金额取本条核准额，缺项和凭证路径并列', () => {
  const current = entry('a', 'purchase', 1000, 'completed');
  current.approvedAmountFen = 900;
  current.payoutId = 'payout';
  const payout: ReimbursePayout = { id: 'payout', projectId: 'prj', recipientId: 'm-a', entryIds: ['a', 'other'], amountFen: 1900, paidAt: '2026-11-12T00:00:00Z', method: 'bank', transactionRef: 'SYN', note: null, recordedBy: 'finance', recordedAt: '2026-11-12T00:00:00Z' };
  const row = deriveReimburseDeliveryRow(current, payout, { evidencePaths: ['凭证/a/1.pdf'] });
  expect(row).toMatchObject({ totalAmountFen: 1000, approvedAmountFen: 900, paidAmountFen: 900, invoiceNo: '00123456789012345678', missingMaterials: ['invoice', 'paymentShot'], evidencePaths: ['凭证/a/1.pdf'] });
  expect(deriveReimburseDeliveryRow(entry('b', 'other', null), null).totalAmountFen).toBeNull();
});
