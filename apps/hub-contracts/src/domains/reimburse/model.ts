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

/** 凭证附件种类（D-094 受控留档）：发票原件 / 付款截图 / 查验单。 */
export const ReimburseEvidenceKindSchema = z.enum(['invoice', 'paymentShot', 'inspection']);

/**
 * 凭证附件元数据（D-094）：字节存受控目录（TEAMHUB_EVIDENCE_FILES_DIR），库内只留指针。
 * 只对条目本人与超管可见；永不进批次聚合/统计/导出。
 */
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

/** 凭证下载留痕（D-094：下载留操作者痕迹）；仅条目本人与超管可查。 */
export const ReimburseEvidenceDownloadSchema = z.object({
  id: z.string().min(1),
  entryId: z.string().min(1),
  evidenceId: z.string().min(1),
  actorId: z.string().min(1),
  at: isoDateTimeSchema,
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
  // 留档上线前的存量行无此键，反序列化时补空数组（免数据迁移）。
  // 该键是**存储与专属端点**用的：服务端出 HTTP 前把条目上的 evidence 剥成空数组（D-094「永不进列表」），
  // 原件清单只经 GET /entries/:id/evidence 流动。
  evidence: z.array(ReimburseEvidenceSchema).default([]),
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

/** 报销域单例配置；任一期望值为空字符串时跳过该字段校验，两者都空即完全跳过。 */
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
export type ReimburseEvidenceKind = z.infer<typeof ReimburseEvidenceKindSchema>;
export type ReimburseEvidence = z.infer<typeof ReimburseEvidenceSchema>;
export type ReimburseEvidenceDownload = z.infer<typeof ReimburseEvidenceDownloadSchema>;
export type ReimburseEntry = z.infer<typeof ReimburseEntrySchema>;
export type ReimburseBatch = z.infer<typeof ReimburseBatchSchema>;
export type ReimburseAmountBucket = z.infer<typeof ReimburseAmountBucketSchema>;
export type ReimburseFinancialSummary = z.infer<typeof ReimburseFinancialSummarySchema>;
export type ReimburseBatchSummary = z.infer<typeof ReimburseBatchSummarySchema>;
export type ReimburseProfile = z.infer<typeof ReimburseProfileSchema>;

// 默认报销抬头（队伍所属单位），仅作初始值；实际生效抬头可经 PUT /api/reimburse/profile 修改。
export const DEFAULT_REIMBURSE_PROFILE: ReimburseProfile = {
  expectedPurchaserName: '哈尔滨工业大学',
  expectedPurchaserTaxNo: '12100000400000456B',
};
