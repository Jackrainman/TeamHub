import { z } from 'zod';

import { isoDateTimeSchema } from '../../common.js';

export const ReimburseEntryKindSchema = z.enum(['goods', 'expense']);
export const ReimburseBatchStatusSchema = z.enum([
  'collecting',
  'submitted',
  'reimbursed',
]);
export const ReimburseEntryStatusSchema = z.enum(['draft', 'partial', 'complete']);
export const InvoiceRecognitionSourceSchema = z.enum(['xml', 'pdf', 'ocr', 'manual']);

export const ReimburseItemSchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1).nullable(),
  quantity: z.number().positive(),
  unitPriceFen: z.number().int().nullable(),
  amountFen: z.number().int(),
});

export const ReimburseMaterialsSchema = z.object({
  paymentShot: z.boolean(),
  inspection: z.boolean(),
});

export const ReimburseEntrySchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  memberId: z.string().min(1),
  batchId: z.string().min(1).nullable(),
  kind: ReimburseEntryKindSchema,
  invoiceNo: z.string().min(1).nullable(),
  invoiceDate: z.string().min(1).nullable(),
  seller: z.string().min(1).nullable(),
  purchaserName: z.string().min(1).nullable(),
  purchaserTaxNo: z.string().min(1).nullable(),
  recognitionSource: InvoiceRecognitionSourceSchema,
  totalAmountFen: z.number().int().nonnegative(),
  items: z.array(ReimburseItemSchema),
  actualItemName: z.string().min(1).nullable(),
  materials: ReimburseMaterialsSchema,
  note: z.string().min(1).nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const ReimburseBatchSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1),
  status: ReimburseBatchStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
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
  financial: ReimburseFinancialSummarySchema,
});

/** 报账域单例配置；任一期望值为空字符串时跳过该字段校验，两者都空即完全跳过。 */
export const ReimburseProfileSchema = z.object({
  expectedPurchaserName: z.string().trim(),
  expectedPurchaserTaxNo: z.string().trim(),
}).strict();

export type ReimburseEntryKind = z.infer<typeof ReimburseEntryKindSchema>;
export type ReimburseBatchStatus = z.infer<typeof ReimburseBatchStatusSchema>;
export type ReimburseEntryStatus = z.infer<typeof ReimburseEntryStatusSchema>;
export type InvoiceRecognitionSource = z.infer<typeof InvoiceRecognitionSourceSchema>;
export type ReimburseItem = z.infer<typeof ReimburseItemSchema>;
export type ReimburseMaterials = z.infer<typeof ReimburseMaterialsSchema>;
export type ReimburseEntry = z.infer<typeof ReimburseEntrySchema>;
export type ReimburseBatch = z.infer<typeof ReimburseBatchSchema>;
export type ReimburseAmountBucket = z.infer<typeof ReimburseAmountBucketSchema>;
export type ReimburseFinancialSummary = z.infer<typeof ReimburseFinancialSummarySchema>;
export type ReimburseBatchSummary = z.infer<typeof ReimburseBatchSummarySchema>;
export type ReimburseProfile = z.infer<typeof ReimburseProfileSchema>;

export const DEFAULT_REIMBURSE_PROFILE: ReimburseProfile = {
  expectedPurchaserName: '哈尔滨工业大学',
  expectedPurchaserTaxNo: '12100000400000456B',
};
