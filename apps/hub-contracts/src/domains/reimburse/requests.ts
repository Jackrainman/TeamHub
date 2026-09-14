import { z } from 'zod';

import { PartActionSchema, PartTypeSchema } from '../inventory/index.js';
import {
  ReimburseBatchSchema,
  ReimburseBatchStatusSchema,
  ReimburseBatchSummarySchema,
  ReimburseEntrySchema,
  ReimburseEvidenceDownloadSchema,
  ReimburseEvidenceSchema,
  ReimburseMaterialsSchema,
  ReimburseProfileSchema,
} from './model.js';

// 可空键宽容缺省（REIMBURSE-DEFECTS #5）：裸 API 客户端可省略 null 键，服务端规整为 null。
// evidence 一并 omit：凭证只能经受控上传端点 append，创建体带进来会在 parse 时被剥掉（D-094）。
export const CreateReimburseEntryRequestSchema = ReimburseEntrySchema.omit({
  id: true,
  memberId: true,
  batchId: true,
  evidence: true,
  createdAt: true,
  updatedAt: true,
}).partial({
  invoiceNo: true,
  invoiceDate: true,
  seller: true,
  purchaserName: true,
  purchaserTaxNo: true,
  actualItemName: true,
  note: true,
});
export const CreateReimburseEntryResponseSchema = z.object({ entry: ReimburseEntrySchema });

export const UpdateReimburseEntryRequestSchema = z.object({
  materials: ReimburseMaterialsSchema.optional(),
  actualItemName: z.string().min(1).nullable().optional(),
  note: z.string().min(1).nullable().optional(),
  batchId: z.string().min(1).nullable().optional(),
});
export const UpdateReimburseEntryResponseSchema = z.object({ entry: ReimburseEntrySchema });

// 凭证附件（D-094）：**条目对象在 HTTP 面上永不含 evidence**（不进列表），原件清单/留痕只走本域专属端点，
// 下载与删除的回执直接给最新清单，省一次往返。
export const ReimburseEvidenceListResponseSchema = z.object({
  evidence: z.array(ReimburseEvidenceSchema),
});
export const UploadReimburseEvidenceResponseSchema = z.object({
  evidence: ReimburseEvidenceSchema,
});
export const DeleteReimburseEvidenceResponseSchema = ReimburseEvidenceListResponseSchema;
export const ReimburseEvidenceDownloadsResponseSchema = z.object({
  downloads: z.array(ReimburseEvidenceDownloadSchema),
});

export const StockInLineSchema = z.object({
  itemIndex: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  target: z.union([
    z.object({ partTypeId: z.string().min(1) }),
    z.object({
      newPart: z.object({
        partNumber: z.string().min(1),
        name: z.string().min(1),
        category: z.string().min(1),
        unit: z.string().min(1),
      }),
    }),
  ]),
});
export const StockInRequestSchema = z.object({ lines: z.array(StockInLineSchema).min(1) });
export const StockInResponseSchema = z.object({
  partTypes: z.array(PartTypeSchema),
  actions: z.array(PartActionSchema),
});

/** 入库对话框只读候选所需的最小 PartType 投影，不暴露库存完整快照。 */
export const StockInPartTypeCandidateSchema = PartTypeSchema.pick({
  id: true,
  partNumber: true,
  name: true,
  category: true,
  unit: true,
}).strict();
export const StockedLineSchema = z.object({
  itemIndex: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
}).strict();
export const StockInEntryContextSchema = z.object({
  entryId: z.string().min(1),
  stockedLines: z.array(StockedLineSchema),
}).strict();
export const StockInContextResponseSchema = z.object({
  partTypes: z.array(StockInPartTypeCandidateSchema),
  entries: z.array(StockInEntryContextSchema),
}).strict();

export const CreateReimburseBatchRequestSchema = ReimburseBatchSchema.omit({
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});
export const UpdateReimburseBatchRequestSchema = z.object({
  name: z.string().min(1).optional(),
  status: ReimburseBatchStatusSchema.optional(),
});
export const ReimburseBatchResponseSchema = z.object({ batch: ReimburseBatchSchema });
export const ReimburseEntriesResponseSchema = z.object({
  entries: z.array(ReimburseEntrySchema),
});
export const ReimburseBatchesResponseSchema = z.object({
  batches: z.array(ReimburseBatchSchema),
  summaries: z.array(ReimburseBatchSummarySchema),
  profile: ReimburseProfileSchema,
});

export const GetReimburseProfileResponseSchema = z.object({
  profile: ReimburseProfileSchema,
}).strict();
export const UpdateReimburseProfileRequestSchema = ReimburseProfileSchema;
export const UpdateReimburseProfileResponseSchema = GetReimburseProfileResponseSchema;

export type CreateReimburseEntryRequest = z.infer<typeof CreateReimburseEntryRequestSchema>;
export type CreateReimburseEntryResponse = z.infer<typeof CreateReimburseEntryResponseSchema>;
export type UpdateReimburseEntryRequest = z.infer<typeof UpdateReimburseEntryRequestSchema>;
export type UpdateReimburseEntryResponse = z.infer<typeof UpdateReimburseEntryResponseSchema>;
export type ReimburseEvidenceListResponse = z.infer<typeof ReimburseEvidenceListResponseSchema>;
export type UploadReimburseEvidenceResponse = z.infer<typeof UploadReimburseEvidenceResponseSchema>;
export type DeleteReimburseEvidenceResponse = z.infer<typeof DeleteReimburseEvidenceResponseSchema>;
export type ReimburseEvidenceDownloadsResponse = z.infer<typeof ReimburseEvidenceDownloadsResponseSchema>;
export type StockInLine = z.infer<typeof StockInLineSchema>;
export type StockInRequest = z.infer<typeof StockInRequestSchema>;
export type StockInResponse = z.infer<typeof StockInResponseSchema>;
export type StockInPartTypeCandidate = z.infer<typeof StockInPartTypeCandidateSchema>;
export type StockedLine = z.infer<typeof StockedLineSchema>;
export type StockInEntryContext = z.infer<typeof StockInEntryContextSchema>;
export type StockInContextResponse = z.infer<typeof StockInContextResponseSchema>;
export type CreateReimburseBatchRequest = z.infer<typeof CreateReimburseBatchRequestSchema>;
export type UpdateReimburseBatchRequest = z.infer<typeof UpdateReimburseBatchRequestSchema>;
export type ReimburseBatchResponse = z.infer<typeof ReimburseBatchResponseSchema>;
export type ReimburseEntriesResponse = z.infer<typeof ReimburseEntriesResponseSchema>;
export type ReimburseBatchesResponse = z.infer<typeof ReimburseBatchesResponseSchema>;
export type GetReimburseProfileResponse = z.infer<typeof GetReimburseProfileResponseSchema>;
export type UpdateReimburseProfileRequest = z.infer<typeof UpdateReimburseProfileRequestSchema>;
export type UpdateReimburseProfileResponse = z.infer<typeof UpdateReimburseProfileResponseSchema>;
