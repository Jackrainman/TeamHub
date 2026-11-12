import type {
  ReimburseAmountBucket,
  ReimburseBatchSummary,
  ReimburseCompleteness,
  ReimburseEntry,
  ReimburseEntryKind,
  ReimburseExpenseType,
  ReimburseFinancialSummary,
  ReimbursePayout,
  ReimburseProfile,
  ReimburseStructuralSummary,
  ReimburseWorkflowStatus,
} from './model.js';
import {
  derivePurchaserCheckStatus,
  deriveReimburseCompleteness,
  deriveReimburseReviewReasons,
  isReimburseEntryBlocked,
  type PurchaserCheckStatus,
  type ReimburseReviewReason,
} from './policies.js';
import { deriveReimburseBatchProgress } from './workflow.js';
import { buildCsv } from '../../csv-core.js';

function summarize(entries: ReimburseEntry[]): ReimburseAmountBucket {
  return {
    count: entries.length,
    amountFen: entries.reduce((sum, entry) => sum + (entry.totalAmountFen ?? 0), 0),
  };
}

/** gross=全部；eligible/blocked 互补；review 是独立核对口径，可与 blocked 重叠。 */
export function deriveReimburseFinancialSummary(
  entries: ReimburseEntry[],
  profile: ReimburseProfile,
): ReimburseFinancialSummary {
  const blocked = entries.filter((entry) => isReimburseEntryBlocked(entry, profile));
  const eligible = entries.filter((entry) => !isReimburseEntryBlocked(entry, profile));
  const review = entries.filter(
    (entry) => deriveReimburseReviewReasons(entry, profile).length > 0,
  );
  return {
    gross: summarize(entries),
    eligible: summarize(eligible),
    blocked: summarize(blocked),
    review: summarize(review),
  };
}

export function deriveBatchSummary(
  entries: ReimburseEntry[],
  batchId: string,
  profile: ReimburseProfile,
): Omit<ReimburseBatchSummary, 'batchId'> {
  const inBatch = entries.filter((entry) => entry.batchId === batchId && entry.workflowStatus !== 'cancelled');
  return {
    count: inBatch.length,
    totalAmountFen: inBatch.reduce((sum, entry) => sum + (entry.totalAmountFen ?? 0), 0),
    incompleteCount: inBatch.filter((entry) => deriveReimburseCompleteness(entry) !== 'complete').length,
    unknownAmountCount: inBatch.filter((entry) => entry.totalAmountFen === null).length,
    progress: deriveReimburseBatchProgress(inBatch),
    financial: deriveReimburseFinancialSummary(inBatch, profile),
  };
}

function sanitizeFilenamePart(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 80);
}

/** 生成 `YYYYMMDD-销方-金额.pdf`；缺日期/销方时给稳定占位，不猜票面信息。 */
export function suggestReimburseFilename(
  entry: Pick<ReimburseEntry, 'invoiceDate' | 'seller' | 'totalAmountFen'>,
  extension: 'pdf' | 'xml' = 'pdf',
): string {
  const dateDigits = entry.invoiceDate?.replace(/\D/g, '') ?? '';
  const date = /^\d{8}$/.test(dateDigits) ? dateDigits : 'unknown-date';
  const seller = sanitizeFilenamePart(entry.seller ?? '') || 'unknown-seller';
  const amount = entry.totalAmountFen === null ? 'unknown-amount' : (entry.totalAmountFen / 100).toFixed(2);
  return `${date}-${seller}-${amount}.${extension}`;
}

/** 全员发票导出列（顺序即 CSV 列序；console 逐列配 t() 表头，保证表头与行对齐）。 */
export const REIMBURSE_EXPORT_COLUMNS = [
  'filename',
  'member',
  'invoiceNo',
  'invoiceDate',
  'seller',
  'purchaserName',
  'purchaserTaxNo',
  'kind',
  'totalYuan',
  'status',
  'purchaserCheck',
  'reviewReasons',
  'bucket',
  'batch',
  'items',
  'note',
] as const;
export type ReimburseExportColumn = (typeof REIMBURSE_EXPORT_COLUMNS)[number];

/** 导出行的机器值形态：枚举保持原始 code，由 console 本地化后再交给 buildReimburseCsv。 */
export interface ReimburseExportRow {
  filename: string;
  member: string;
  invoiceNo: string;
  invoiceDate: string;
  seller: string;
  purchaserName: string;
  purchaserTaxNo: string;
  kind: ReimburseEntryKind;
  totalYuan: string;
  status: ReimburseCompleteness;
  purchaserCheck: PurchaserCheckStatus;
  reviewReasons: ReimburseReviewReason[];
  /** 质量门互补口径：eligible / blocked（review 为独立口径，由 reviewReasons 非空表达）。 */
  bucket: 'eligible' | 'blocked';
  batch: string;
  items: string;
  note: string;
}

/** 已本地化的字符串行（枚举已翻成人类文案）；表头与行共用同一形状。 */
export type ReimburseExportCsvRow = Record<ReimburseExportColumn, string>;

export interface ReimburseExportOptions {
  /** memberId → 成员显示名；缺省回退 memberId（人键只回本人+超管，导出仅超管触发）。 */
  resolveMemberName?: (memberId: string) => string;
  /** batchId → 批次名；未装批（null）→ 空串；缺省回退 batchId。 */
  resolveBatchName?: (batchId: string | null) => string;
}

/** 单条报销条目 → 一行导出数据；全部派生自共享 rules，与卡片/批次展示同源。 */
export function deriveReimburseExportRow(
  entry: ReimburseEntry,
  profile: ReimburseProfile,
  opts: ReimburseExportOptions = {},
): ReimburseExportRow {
  return {
    filename: suggestReimburseFilename(entry),
    member: opts.resolveMemberName?.(entry.memberId) ?? entry.memberId,
    invoiceNo: entry.invoiceNo ?? '',
    invoiceDate: entry.invoiceDate ?? '',
    seller: entry.seller ?? '',
    purchaserName: entry.purchaserName ?? '',
    purchaserTaxNo: entry.purchaserTaxNo ?? '',
    kind: entry.kind,
    totalYuan: entry.totalAmountFen === null ? '' : (entry.totalAmountFen / 100).toFixed(2),
    status: deriveReimburseCompleteness(entry),
    purchaserCheck: derivePurchaserCheckStatus(entry, profile),
    reviewReasons: deriveReimburseReviewReasons(entry, profile),
    bucket: isReimburseEntryBlocked(entry, profile) ? 'blocked' : 'eligible',
    batch: entry.batchId ? (opts.resolveBatchName?.(entry.batchId) ?? entry.batchId) : '',
    items: entry.items.map((item) => `${item.name}×${item.quantity}`).join('; '),
    note: entry.note ?? '',
  };
}

/** 全员发票 CSV：列序固定为 REIMBURSE_EXPORT_COLUMNS，BOM 保证 Excel 打开中文不乱码。 */
export function buildReimburseCsv(
  headers: ReimburseExportCsvRow,
  rows: ReimburseExportCsvRow[],
): string {
  return buildCsv(
    REIMBURSE_EXPORT_COLUMNS.map((column) => headers[column]),
    rows.map((row) => REIMBURSE_EXPORT_COLUMNS.map((column) => row[column])),
  );
}

const EXPENSE_TYPES: readonly ReimburseExpenseType[] = ['purchase', 'taxi', 'ticket', 'other'];

/** 只按结构维度汇总；撤销条目不进入任何金额或次数口径（I0 / D-099）。 */
export function deriveReimburseStructuralSummary(
  entries: readonly ReimburseEntry[],
  payouts: readonly ReimbursePayout[] = [],
): ReimburseStructuralSummary {
  const active = entries.filter((entry) => entry.workflowStatus !== 'cancelled');
  const paidEntryIds = new Set(payouts.flatMap((payout) => payout.entryIds));
  return {
    count: active.length,
    unknownAmountCount: active.filter((entry) => entry.totalAmountFen === null).length,
    unclassifiedCount: active.filter((entry) => entry.expenseType === null).length,
    types: EXPENSE_TYPES.map((expenseType) => {
      const typed = active.filter((entry) => entry.expenseType === expenseType);
      return {
        expenseType,
        count: typed.length,
        unknownAmountCount: typed.filter((entry) => entry.totalAmountFen === null).length,
        requestedAmountFen: typed.reduce((sum, entry) => sum + (entry.totalAmountFen ?? 0), 0),
        approvedAmountFen: typed.reduce((sum, entry) => sum + (entry.approvedAmountFen ?? 0), 0),
        paidAmountFen: typed.reduce((sum, entry) => sum + (paidEntryIds.has(entry.id) ? entry.approvedAmountFen ?? 0 : 0), 0),
      };
    }),
  };
}

export interface ReimburseDeliveryRow {
  seasonId: string;
  batch: string;
  expenseType: ReimburseExpenseType | null;
  member: string;
  summary: string;
  items: string;
  totalAmountFen: number | null;
  approvedAmountFen: number | null;
  paidAmountFen: number | null;
  workflowStatus: ReimburseWorkflowStatus;
  completeness: ReimburseCompleteness;
  missingMaterials: ('invoice' | 'paymentShot')[];
  invoiceNo: string;
  invoiceDate: string;
  evidencePaths: string[];
  paidAt: string;
  transactionRef: string;
  note: string;
}

/** XLSX 一行一条目；未知金额保持 null，由 adapter 写成空单元格而不是 0。 */
export function deriveReimburseDeliveryRow(
  entry: ReimburseEntry,
  payout: ReimbursePayout | null,
  options: ReimburseExportOptions & { evidencePaths?: string[] } = {},
): ReimburseDeliveryRow {
  return {
    seasonId: entry.seasonId,
    batch: entry.batchId ? options.resolveBatchName?.(entry.batchId) ?? entry.batchId : '',
    expenseType: entry.expenseType,
    member: options.resolveMemberName?.(entry.memberId) ?? entry.memberId,
    summary: entry.summary ?? entry.actualItemName ?? entry.seller ?? '',
    items: entry.items.map((item) => `${item.name}×${item.quantity}`).join('; '),
    totalAmountFen: entry.totalAmountFen,
    approvedAmountFen: entry.approvedAmountFen,
    paidAmountFen: payout ? entry.approvedAmountFen : null,
    workflowStatus: entry.workflowStatus,
    completeness: deriveReimburseCompleteness(entry),
    missingMaterials: [
      ...(entry.materials.invoice ? [] : ['invoice' as const]),
      ...(entry.materials.paymentShot ? [] : ['paymentShot' as const]),
    ],
    invoiceNo: entry.invoiceNo ?? '',
    invoiceDate: entry.invoiceDate ?? '',
    evidencePaths: options.evidencePaths ?? [],
    paidAt: payout?.paidAt ?? '',
    transactionRef: payout?.transactionRef ?? '',
    note: entry.note ?? '',
  };
}
