import { z } from 'zod';

import { isoDateTimeSchema } from '../../common.js';

export const ReimburseEntryKindSchema = z.enum(['goods', 'expense']);
export const ReimburseExpenseTypeSchema = z.enum(['purchase', 'taxi', 'ticket', 'other']);
export const InvoiceTypeSchema = z.enum(['vatOrdinary', 'vatSpecial', 'railway', 'other', 'unknown']);
export type InvoiceType = z.infer<typeof InvoiceTypeSchema>;
export const ReimburseBatchStatusSchema = z.enum(['collecting', 'submitted']);
export const ReimburseCompletenessSchema = z.enum(['draft', 'partial', 'complete']);
export const ReimburseWorkflowStatusSchema = z.enum([
  'draft', 'submitted', 'reviewing', 'returned', 'pendingPayment', 'completed', 'cancelled',
]);
export const InvoiceRecognitionSourceSchema = z.enum(['xml', 'pdf', 'ocr', 'manual']);

export const ReimburseItemSchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1).nullable(),
  quantity: z.number().positive(),
  unitPriceFen: z.number().int().nullable(),
  amountFen: z.number().int(),
});

export const ReimburseMaterialsSchema = z.object({
  invoice: z.boolean().default(false),
  paymentShot: z.boolean(),
  inspection: z.boolean(),
});

/** D-094 受控附件：发票、付款截图、可选的查验结果及其他配套材料。 */
export const ReimburseEvidenceKindSchema = z.enum(['invoice', 'paymentShot', 'inspection', 'supporting']);
export const ReimburseEvidenceSchema = z.object({
  id: z.string().min(1),
  kind: ReimburseEvidenceKindSchema,
  originalName: z.string().min(1),
  ext: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().min(1),
  uploadedBy: z.string().min(1),
  uploadedAt: isoDateTimeSchema,
});
export const ReimburseEvidenceDownloadSchema = z.object({
  id: z.string().min(1),
  entryId: z.string().min(1),
  evidenceId: z.string().min(1),
  actorId: z.string().min(1),
  at: isoDateTimeSchema,
});

export const ReimburseHistoryActionSchema = z.enum([
  'created', 'edited', 'submitted', 'accepted', 'checked', 'returned', 'approved',
  'approvalRevoked', 'cancelled', 'evidenceAdded', 'evidenceRemoved', 'batchChanged',
  'payoutRegistered', 'exported',
]);
export const ReimburseHistoryEventSchema = z.object({
  action: ReimburseHistoryActionSchema,
  actorId: z.string().min(1),
  at: isoDateTimeSchema,
  revision: z.number().int().positive(),
  from: ReimburseWorkflowStatusSchema.nullable().default(null),
  to: ReimburseWorkflowStatusSchema.nullable().default(null),
  reason: z.string().min(1).nullable().default(null),
  changedFields: z.array(z.string()).default([]),
});

export const ReimburseEntrySchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  seasonId: z.string().min(1).default('unassigned'),
  memberId: z.string().min(1),
  batchId: z.string().min(1).nullable(),
  kind: ReimburseEntryKindSchema,
  expenseType: ReimburseExpenseTypeSchema.nullable().default(null),
  summary: z.string().min(1).nullable().default(null),
  invoiceType: InvoiceTypeSchema.optional(),
  invoiceNo: z.string().min(1).nullable(),
  invoiceDate: z.string().min(1).nullable(),
  seller: z.string().min(1).nullable(),
  purchaserName: z.string().min(1).nullable(),
  purchaserTaxNo: z.string().min(1).nullable(),
  recognitionSource: InvoiceRecognitionSourceSchema,
  recognitionConfirmedRevision: z.number().int().positive().nullable().default(null),
  totalAmountFen: z.number().int().nonnegative().nullable(),
  items: z.array(ReimburseItemSchema),
  actualItemName: z.string().min(1).nullable(),
  materials: ReimburseMaterialsSchema,
  note: z.string().min(1).nullable(),
  workflowStatus: ReimburseWorkflowStatusSchema.default('draft'),
  revision: z.number().int().positive().default(1),
  checkedRevision: z.number().int().positive().nullable().default(null),
  reviewedRevision: z.number().int().positive().nullable().default(null),
  approvedAmountFen: z.number().int().nonnegative().nullable().default(null),
  reviewNote: z.string().min(1).nullable().default(null),
  returnReason: z.string().min(1).nullable().default(null),
  payoutId: z.string().min(1).nullable().default(null),
  history: z.array(ReimburseHistoryEventSchema).default([]),
  // 存储行可含原件元数据；任何条目 HTTP 响应都必须由 service 剥成空数组（D-094）。
  evidence: z.array(ReimburseEvidenceSchema).default([]),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const ReimburseBatchSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  seasonId: z.string().min(1).default('unassigned'),
  name: z.string().min(1),
  status: ReimburseBatchStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const ReimbursePayoutSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  recipientId: z.string().min(1),
  entryIds: z.array(z.string().min(1)).min(1),
  amountFen: z.number().int().positive(),
  paidAt: isoDateTimeSchema,
  method: z.enum(['bank', 'wechat', 'alipay', 'cash', 'other']),
  transactionRef: z.string().min(1).nullable(),
  note: z.string().min(1).nullable(),
  recordedBy: z.string().min(1),
  recordedAt: isoDateTimeSchema,
});

export const ReimburseAmountBucketSchema = z.object({
  count: z.number().int().nonnegative(),
  amountFen: z.number().int().nonnegative(),
});
export const ReimburseFinancialSummarySchema = z.object({
  gross: ReimburseAmountBucketSchema,
  eligible: ReimburseAmountBucketSchema,
  blocked: ReimburseAmountBucketSchema,
  review: ReimburseAmountBucketSchema,
});
export const ReimburseBatchSummarySchema = z.object({
  batchId: z.string().min(1),
  count: z.number().int().nonnegative(),
  totalAmountFen: z.number().int().nonnegative(),
  incompleteCount: z.number().int().nonnegative(),
  unknownAmountCount: z.number().int().nonnegative().default(0),
  progress: z.enum(['empty', 'processing', 'completed']).default('empty'),
  financial: ReimburseFinancialSummarySchema,
});
export const ReimburseTypeSummarySchema = z.object({
  expenseType: ReimburseExpenseTypeSchema,
  count: z.number().int().nonnegative(),
  unknownAmountCount: z.number().int().nonnegative(),
  requestedAmountFen: z.number().int().nonnegative(),
  approvedAmountFen: z.number().int().nonnegative(),
  paidAmountFen: z.number().int().nonnegative(),
});
export const ReimburseStructuralSummarySchema = z.object({
  count: z.number().int().nonnegative(),
  unknownAmountCount: z.number().int().nonnegative(),
  unclassifiedCount: z.number().int().nonnegative(),
  types: z.array(ReimburseTypeSummarySchema),
});

/** 报销域单例配置；任一期望值为空字符串时跳过该字段校验，两者都空即完全跳过。 */
export const ReimburseProfileSchema = z.object({
  expectedPurchaserName: z.string().trim(),
  expectedPurchaserTaxNo: z.string().trim(),
}).strict();

export type ReimburseEntryKind = z.infer<typeof ReimburseEntryKindSchema>;
export type ReimburseExpenseType = z.infer<typeof ReimburseExpenseTypeSchema>;
export type ReimburseBatchStatus = z.infer<typeof ReimburseBatchStatusSchema>;
export type ReimburseCompleteness = z.infer<typeof ReimburseCompletenessSchema>;
export type ReimburseWorkflowStatus = z.infer<typeof ReimburseWorkflowStatusSchema>;
export type InvoiceRecognitionSource = z.infer<typeof InvoiceRecognitionSourceSchema>;
export type ReimburseItem = z.infer<typeof ReimburseItemSchema>;
export type ReimburseMaterials = z.infer<typeof ReimburseMaterialsSchema>;
export type ReimburseEvidenceKind = z.infer<typeof ReimburseEvidenceKindSchema>;
export type ReimburseEvidence = z.infer<typeof ReimburseEvidenceSchema>;
export type ReimburseEvidenceDownload = z.infer<typeof ReimburseEvidenceDownloadSchema>;
export type ReimburseHistoryAction = z.infer<typeof ReimburseHistoryActionSchema>;
export type ReimburseHistoryEvent = z.infer<typeof ReimburseHistoryEventSchema>;
export type ReimburseEntry = z.infer<typeof ReimburseEntrySchema>;
export type ReimburseBatch = z.infer<typeof ReimburseBatchSchema>;
export type ReimbursePayout = z.infer<typeof ReimbursePayoutSchema>;
export type ReimburseAmountBucket = z.infer<typeof ReimburseAmountBucketSchema>;
export type ReimburseFinancialSummary = z.infer<typeof ReimburseFinancialSummarySchema>;
export type ReimburseBatchSummary = z.infer<typeof ReimburseBatchSummarySchema>;
export type ReimburseTypeSummary = z.infer<typeof ReimburseTypeSummarySchema>;
export type ReimburseStructuralSummary = z.infer<typeof ReimburseStructuralSummarySchema>;
export type ReimburseProfile = z.infer<typeof ReimburseProfileSchema>;

export const DEFAULT_REIMBURSE_PROFILE: ReimburseProfile = {
  expectedPurchaserName: '哈尔滨工业大学',
  expectedPurchaserTaxNo: '12100000400000456B',
};
