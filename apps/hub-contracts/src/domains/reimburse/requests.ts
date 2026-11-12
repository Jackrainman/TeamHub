import { z } from 'zod';

import { isoDateTimeSchema } from '../../common.js';
import { PartActionSchema, PartTypeSchema } from '../inventory/index.js';
import {
  ReimburseBatchSchema,
  ReimburseBatchStatusSchema,
  ReimburseBatchSummarySchema,
  ReimburseEntrySchema,
  ReimburseEvidenceDownloadSchema,
  ReimburseEvidenceSchema,
  ReimburseExpenseTypeSchema,
  ReimburseMaterialsSchema,
  ReimbursePayoutSchema,
  ReimburseProfileSchema,
  ReimburseStructuralSummarySchema,
} from './model.js';

// 可空键宽容缺省；服务端独占的工作流、版本、历史、核准与打款字段全部剥离（ARC-INC-004）。
export const CreateReimburseEntryRequestSchema = ReimburseEntrySchema.omit({
  id: true,
  memberId: true,
  batchId: true,
  recognitionConfirmedRevision: true,
  workflowStatus: true,
  revision: true,
  checkedRevision: true,
  reviewedRevision: true,
  approvedAmountFen: true,
  reviewNote: true,
  returnReason: true,
  payoutId: true,
  history: true,
  evidence: true,
  createdAt: true,
  updatedAt: true,
}).extend({ clientRequestId: z.string().uuid().optional() }).partial({
  invoiceNo: true,
  invoiceDate: true,
  seller: true,
  purchaserName: true,
  purchaserTaxNo: true,
  actualItemName: true,
  summary: true,
  note: true,
});
export const CreateReimburseEntryResponseSchema = z.object({ entry: ReimburseEntrySchema });

export const UpdateReimburseEntryRequestSchema = z.object({
  ...ReimburseEntrySchema.pick({ kind: true, expenseType: true, summary: true, invoiceType: true,
    invoiceNo: true, invoiceDate: true, seller: true, purchaserName: true, purchaserTaxNo: true,
    totalAmountFen: true, items: true,
  }).partial().shape,
  materials: ReimburseMaterialsSchema.optional(),
  actualItemName: z.string().min(1).nullable().optional(),
  note: z.string().min(1).nullable().optional(),
  batchId: z.string().min(1).nullable().optional(),
  expectedRevision: z.number().int().positive(),
  changeReason: z.string().min(1).optional(),
});
export const UpdateReimburseEntryResponseSchema = z.object({ entry: ReimburseEntrySchema });

export const ReimburseEntryActionSchema = z.enum([
  'submit', 'accept', 'check', 'return', 'approve', 'revokeApproval', 'cancel',
]);
export const ReimburseEntryActionRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  reason: z.string().trim().min(1).optional(),
  approvedAmountFen: z.number().int().nonnegative().optional(),
});
export const ReimburseEntryActionResponseSchema = UpdateReimburseEntryResponseSchema;

export const ReimburseEvidenceMutationRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
});
export const UpdateReimburseEvidenceRequestSchema = ReimburseEvidenceMutationRequestSchema.extend({
  kind: z.enum(['invoice', 'paymentShot', 'inspection', 'supporting']),
});
export const ReimburseEvidenceListResponseSchema = z.object({
  evidence: z.array(ReimburseEvidenceSchema),
});
export const UploadReimburseEvidenceResponseSchema = z.object({
  evidence: ReimburseEvidenceSchema,
  entry: ReimburseEntrySchema,
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
export const StockInPartTypeCandidateSchema = PartTypeSchema.pick({
  id: true, partNumber: true, name: true, category: true, unit: true,
}).strict();
export const StockedLineSchema = z.object({
  itemIndex: z.number().int().nonnegative(), quantity: z.number().int().positive(),
}).strict();
export const StockInEntryContextSchema = z.object({
  entryId: z.string().min(1), stockedLines: z.array(StockedLineSchema),
}).strict();
export const StockInContextResponseSchema = z.object({
  partTypes: z.array(StockInPartTypeCandidateSchema),
  entries: z.array(StockInEntryContextSchema),
}).strict();

export const CreateReimburseBatchRequestSchema = ReimburseBatchSchema.omit({
  id: true, status: true, createdAt: true, updatedAt: true,
});
export const UpdateReimburseBatchRequestSchema = z.object({
  name: z.string().min(1).optional(),
  status: ReimburseBatchStatusSchema.optional(),
});
export const ReimburseBatchResponseSchema = z.object({ batch: ReimburseBatchSchema });
export const ReimburseEntriesResponseSchema = z.object({ entries: z.array(ReimburseEntrySchema) });
export const ReimburseBatchesResponseSchema = z.object({
  batches: z.array(ReimburseBatchSchema),
  summaries: z.array(ReimburseBatchSummarySchema),
  profile: ReimburseProfileSchema,
});

export const CreateReimbursePayoutRequestSchema = z.object({
  entries: z.array(z.object({
    id: z.string().min(1), expectedRevision: z.number().int().positive(),
  }).strict()).min(1),
  amountFen: z.number().int().positive(),
  paidAt: isoDateTimeSchema,
  method: ReimbursePayoutSchema.shape.method,
  transactionRef: z.string().trim().min(1).nullable().optional(),
  note: z.string().trim().min(1).nullable().optional(),
  clientRequestId: z.string().uuid().optional(),
});
export const ReimbursePayoutResponseSchema = z.object({ payout: ReimbursePayoutSchema });
export const ReimbursePayoutsResponseSchema = z.object({ payouts: z.array(ReimbursePayoutSchema) });

export const ReimburseExportRequestSchema = z.object({
  entryIds: z.array(z.string().min(1)).optional(),
  seasonId: z.string().min(1).optional(),
  batchId: z.string().min(1).optional(),
  expenseType: ReimburseExpenseTypeSchema.optional(),
  includeEvidence: z.boolean().default(false),
}).strict();
export const ReimburseSummaryQuerySchema = z.object({
  seasonId: z.string().min(1).optional(),
  batchId: z.string().min(1).optional(),
  expenseType: ReimburseExpenseTypeSchema.optional(),
});
export const ReimburseSummaryResponseSchema = z.object({ summary: ReimburseStructuralSummarySchema });

export const GetReimburseProfileResponseSchema = z.object({ profile: ReimburseProfileSchema }).strict();
export const UpdateReimburseProfileRequestSchema = ReimburseProfileSchema;
export const UpdateReimburseProfileResponseSchema = GetReimburseProfileResponseSchema;

export type CreateReimburseEntryRequest = z.infer<typeof CreateReimburseEntryRequestSchema>;
export type CreateReimburseEntryResponse = z.infer<typeof CreateReimburseEntryResponseSchema>;
export type UpdateReimburseEntryRequest = z.infer<typeof UpdateReimburseEntryRequestSchema>;
export type UpdateReimburseEntryResponse = z.infer<typeof UpdateReimburseEntryResponseSchema>;
export type ReimburseEntryAction = z.infer<typeof ReimburseEntryActionSchema>;
export type ReimburseEntryActionRequest = z.infer<typeof ReimburseEntryActionRequestSchema>;
export type ReimburseEntryActionResponse = z.infer<typeof ReimburseEntryActionResponseSchema>;
export type ReimburseEvidenceMutationRequest = z.infer<typeof ReimburseEvidenceMutationRequestSchema>;
export type UpdateReimburseEvidenceRequest = z.infer<typeof UpdateReimburseEvidenceRequestSchema>;
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
export type CreateReimbursePayoutRequest = z.infer<typeof CreateReimbursePayoutRequestSchema>;
export type ReimbursePayoutResponse = z.infer<typeof ReimbursePayoutResponseSchema>;
export type ReimbursePayoutsResponse = z.infer<typeof ReimbursePayoutsResponseSchema>;
export type ReimburseExportRequest = z.infer<typeof ReimburseExportRequestSchema>;
export type ReimburseSummaryQuery = z.infer<typeof ReimburseSummaryQuerySchema>;
export type ReimburseSummaryResponse = z.infer<typeof ReimburseSummaryResponseSchema>;
export type GetReimburseProfileResponse = z.infer<typeof GetReimburseProfileResponseSchema>;
export type UpdateReimburseProfileRequest = z.infer<typeof UpdateReimburseProfileRequestSchema>;
export type UpdateReimburseProfileResponse = z.infer<typeof UpdateReimburseProfileResponseSchema>;
