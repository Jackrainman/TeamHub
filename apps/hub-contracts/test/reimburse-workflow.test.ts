import { describe, expect, test } from 'vitest';
import {
  canTransitionReimburseWorkflow,
  deriveReimburseBatchProgress,
  kindForExpenseType,
  validateReimburseApproval,
  validateReimbursePayout,
  validateReimburseSubmission,
  type ReimburseCompleteness,
  type ReimburseEntry,
} from '../src/index.js';

type WorkflowEntry = ReimburseEntry & { completeness: ReimburseCompleteness };

function entry(patch: Partial<WorkflowEntry> = {}): WorkflowEntry {
  return {
    id: 'entry-1',
    projectId: 'project-1',
    seasonId: '2027RC',
    memberId: 'member-1',
    batchId: null,
    kind: 'goods',
    expenseType: 'purchase',
    summary: '合成测试条目',
    note: null,
    invoiceNo: 'TEST-001',
    invoiceDate: '2026-11-01',
    seller: '合成销售方',
    purchaserName: '合成战队',
    purchaserTaxNo: null,
    invoiceType: 'vatOrdinary',
    totalAmountFen: 12345,
    items: [],
    actualItemName: null,
    materials: { invoice: true, paymentShot: true, inspection: false },
    recognitionSource: 'manual',
    recognitionConfirmedRevision: 2,
    completeness: 'complete',
    workflowStatus: 'reviewing',
    revision: 2,
    checkedRevision: 2,
    reviewedRevision: null,
    approvedAmountFen: null,
    reviewNote: null,
    returnReason: null,
    payoutId: null,
    history: [],
    evidence: [],
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...patch,
  };
}

describe('新赛季报账状态机', () => {
  test('支出分类只映射既有库存 kind，不与票种混用', () => {
    expect(kindForExpenseType('purchase')).toBe('goods');
    expect(kindForExpenseType('taxi')).toBe('expense');
    expect(kindForExpenseType('ticket')).toBe('expense');
    expect(kindForExpenseType('other')).toBe('expense');
  });

  test('只允许明确的状态边，完成不能撤销或退回', () => {
    expect(canTransitionReimburseWorkflow('draft', 'submitted')).toBe(true);
    expect(canTransitionReimburseWorkflow('submitted', 'reviewing')).toBe(true);
    expect(canTransitionReimburseWorkflow('reviewing', 'returned')).toBe(true);
    expect(canTransitionReimburseWorkflow('returned', 'submitted')).toBe(true);
    expect(canTransitionReimburseWorkflow('reviewing', 'pendingPayment')).toBe(true);
    expect(canTransitionReimburseWorkflow('pendingPayment', 'reviewing')).toBe(true);
    expect(canTransitionReimburseWorkflow('pendingPayment', 'completed')).toBe(true);
    expect(canTransitionReimburseWorkflow('submitted', 'completed')).toBe(false);
    expect(canTransitionReimburseWorkflow('completed', 'reviewing')).toBe(false);
    expect(canTransitionReimburseWorkflow('cancelled', 'submitted')).toBe(false);
  });

  test('提交前必须确认四类支出，缺发票或付款材料不阻塞提交', () => {
    expect(validateReimburseSubmission(entry({ expenseType: null, workflowStatus: 'draft' }))).toBe('REIMBURSE_EXPENSE_TYPE_REQUIRED');
    expect(validateReimburseSubmission(entry({
      workflowStatus: 'returned',
      completeness: 'partial',
      materials: { invoice: false, paymentShot: false, inspection: false },
    }))).toBeNull();
    expect(validateReimburseSubmission(entry({ workflowStatus: 'reviewing' }))).toBe('REIMBURSE_WORKFLOW_INVALID');
  });

  test('缺项核准和金额调整必须留处理意见', () => {
    expect(validateReimburseApproval(entry(), 12345, null)).toBeNull();
    expect(validateReimburseApproval(entry({ completeness: 'partial' }), 12345, null)).toBe('REIMBURSE_REVIEW_NOTE_REQUIRED');
    expect(validateReimburseApproval(entry(), 12000, ' ')).toBe('REIMBURSE_REVIEW_NOTE_REQUIRED');
    expect(validateReimburseApproval(entry(), 12000, '按实际有效票据核准')).toBeNull();
    expect(validateReimburseApproval(entry(), null, '金额未知')).toBe('REIMBURSE_APPROVED_AMOUNT_REQUIRED');
  });
});

describe('合并打款与批次派生', () => {
  test('只接受同一提交人的待打款条目，金额等于核准合计', () => {
    const pending = entry({ workflowStatus: 'pendingPayment', approvedAmountFen: 10000, reviewedRevision: 2 });
    expect(validateReimbursePayout([pending, entry({ id: 'entry-2', workflowStatus: 'pendingPayment', approvedAmountFen: 5000, reviewedRevision: 2 })], 'member-1', 15000)).toBeNull();
    expect(validateReimbursePayout([pending], 'member-2', 10000)).toBe('REIMBURSE_PAYOUT_RECIPIENT_MISMATCH');
    expect(validateReimbursePayout([entry({ workflowStatus: 'reviewing' })], 'member-1', 0)).toBe('REIMBURSE_PAYOUT_ENTRY_NOT_APPROVED');
    expect(validateReimbursePayout([pending], 'member-1', 9999)).toBe('REIMBURSE_PAYOUT_AMOUNT_MISMATCH');
    expect(validateReimbursePayout([entry({ workflowStatus: 'pendingPayment', approvedAmountFen: null })], 'member-1', 0)).toBe('REIMBURSE_PAYOUT_ENTRY_NOT_APPROVED');
    expect(validateReimbursePayout([], 'member-1', 0)).toBe('REIMBURSE_PAYOUT_EMPTY');
  });

  test('批次只派生归集进度，空批次与全撤销都不算完成', () => {
    expect(deriveReimburseBatchProgress([])).toBe('empty');
    expect(deriveReimburseBatchProgress([entry({ workflowStatus: 'cancelled' })])).toBe('empty');
    expect(deriveReimburseBatchProgress([entry({ workflowStatus: 'submitted' })])).toBe('processing');
    expect(deriveReimburseBatchProgress([entry({ workflowStatus: 'completed' })])).toBe('completed');
    expect(deriveReimburseBatchProgress([
      entry({ workflowStatus: 'completed' }),
      entry({ id: 'entry-2', workflowStatus: 'cancelled' }),
    ])).toBe('completed');
  });
});
