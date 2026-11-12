import type {
  ReimburseEntry,
  ReimburseExpenseType,
  ReimburseEntryKind,
  ReimburseCompleteness,
  ReimburseWorkflowStatus,
} from './model.js';

const WORKFLOW_EDGES: Readonly<Record<ReimburseWorkflowStatus, readonly ReimburseWorkflowStatus[]>> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['reviewing', 'cancelled'],
  reviewing: ['returned', 'pendingPayment'],
  returned: ['submitted', 'cancelled'],
  pendingPayment: ['reviewing', 'completed'],
  completed: [],
  cancelled: [],
};

export function canTransitionReimburseWorkflow(
  from: ReimburseWorkflowStatus,
  to: ReimburseWorkflowStatus,
): boolean {
  return WORKFLOW_EDGES[from].includes(to);
}

export function kindForExpenseType(type: ReimburseExpenseType): ReimburseEntryKind {
  return type === 'purchase' ? 'goods' : 'expense';
}

export function validateReimburseSubmission(
  entry: Pick<ReimburseEntry, 'expenseType' | 'workflowStatus'>,
): string | null {
  if (entry.workflowStatus !== 'draft' && entry.workflowStatus !== 'returned') {
    return 'REIMBURSE_WORKFLOW_INVALID';
  }
  return entry.expenseType ? null : 'REIMBURSE_EXPENSE_TYPE_REQUIRED';
}

export function validateReimburseApproval(
  entry: Pick<ReimburseEntry, 'totalAmountFen' | 'workflowStatus'> & { completeness: ReimburseCompleteness },
  approvedAmountFen: number | null,
  note: string | null,
): string | null {
  if (entry.workflowStatus !== 'reviewing') return 'REIMBURSE_WORKFLOW_INVALID';
  if (approvedAmountFen === null) return 'REIMBURSE_APPROVED_AMOUNT_REQUIRED';
  const adjusted = entry.totalAmountFen !== approvedAmountFen;
  if ((entry.completeness !== 'complete' || adjusted) && !note?.trim()) {
    return 'REIMBURSE_REVIEW_NOTE_REQUIRED';
  }
  return null;
}

export function validateReimbursePayout(
  entries: readonly Pick<ReimburseEntry, 'memberId' | 'workflowStatus' | 'approvedAmountFen' | 'reviewedRevision' | 'revision' | 'payoutId'>[],
  recipientId: string,
  amountFen: number,
): string | null {
  if (entries.length === 0) return 'REIMBURSE_PAYOUT_EMPTY';
  if (entries.some((entry) => entry.memberId !== recipientId)) return 'REIMBURSE_PAYOUT_RECIPIENT_MISMATCH';
  if (entries.some((entry) => entry.workflowStatus !== 'pendingPayment'
    || entry.approvedAmountFen === null
    || entry.reviewedRevision !== entry.revision
    || entry.payoutId !== null)) {
    return 'REIMBURSE_PAYOUT_ENTRY_NOT_APPROVED';
  }
  const approvedTotal = entries.reduce((sum, entry) => sum + (entry.approvedAmountFen ?? 0), 0);
  return approvedTotal === amountFen ? null : 'REIMBURSE_PAYOUT_AMOUNT_MISMATCH';
}

export type ReimburseBatchProgress = 'empty' | 'processing' | 'completed';

export function deriveReimburseBatchProgress(
  entries: readonly Pick<ReimburseEntry, 'workflowStatus'>[],
): ReimburseBatchProgress {
  const active = entries.filter((entry) => entry.workflowStatus !== 'cancelled');
  if (active.length === 0) return 'empty';
  return active.every((entry) => entry.workflowStatus === 'completed') ? 'completed' : 'processing';
}
