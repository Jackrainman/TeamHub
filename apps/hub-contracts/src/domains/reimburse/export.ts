import type {
  ReimburseAmountBucket,
  ReimburseBatchSummary,
  ReimburseEntry,
  ReimburseEntryKind,
  ReimburseEntryStatus,
  ReimburseFinancialSummary,
  ReimburseProfile,
} from './model.js';
import {
  derivePurchaserCheckStatus,
  deriveReimburseReviewReasons,
  deriveReimburseStatus,
  isReimburseEntryBlocked,
  type PurchaserCheckStatus,
  type ReimburseReviewReason,
} from './policies.js';
import { buildCsv } from '../../csv-core.js';

function summarize(entries: ReimburseEntry[]): ReimburseAmountBucket {
  return {
    count: entries.length,
    amountFen: entries.reduce((sum, entry) => sum + entry.totalAmountFen, 0),
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
  const inBatch = entries.filter((entry) => entry.batchId === batchId);
  return {
    count: inBatch.length,
    totalAmountFen: inBatch.reduce((sum, entry) => sum + entry.totalAmountFen, 0),
    incompleteCount: inBatch.filter((entry) => deriveReimburseStatus(entry) !== 'complete')
      .length,
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
  const amount = (entry.totalAmountFen / 100).toFixed(2);
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
  status: ReimburseEntryStatus;
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
    totalYuan: (entry.totalAmountFen / 100).toFixed(2),
    status: deriveReimburseStatus(entry),
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
