// 报销全员发票导出的前端纯函数层（REIMBURSE-PM-EXPORT）：
// 枚举本地化 + 表头装配 + 文件名建议——全部零副作用、可单测，Blob 下载留在组件里。
// 派生逻辑不在这里重写：行数据来自 contracts 的 deriveReimburseExportRow（共享真相）。
import {
  REIMBURSE_EXPORT_COLUMNS,
  type ReimburseEntryKind,
  type ReimburseEntryStatus,
  type ReimburseExportCsvRow,
  type ReimburseExportRow,
  type PurchaserCheckStatus,
  type ReimburseReviewReason,
} from '@teamhub/hub-contracts';
import type { TranslationKey } from '../../i18n';

const KIND_KEY: Record<ReimburseEntryKind, TranslationKey> = {
  goods: 'reimb.kind.goods',
  expense: 'reimb.kind.expense',
};
const STATUS_KEY: Record<ReimburseEntryStatus, TranslationKey> = {
  draft: 'reimb.status.draft',
  partial: 'reimb.status.partial',
  complete: 'reimb.status.complete',
};
const CHECK_KEY: Record<PurchaserCheckStatus, TranslationKey> = {
  match: 'reimb.export.check.match',
  mismatch: 'reimb.export.check.mismatch',
  missing: 'reimb.export.check.missing',
  skipped: 'reimb.export.check.skipped',
};
const BUCKET_KEY: Record<'eligible' | 'blocked', TranslationKey> = {
  eligible: 'reimb.export.bucket.eligible',
  blocked: 'reimb.export.bucket.blocked',
};
// 与条目卡片 REVIEW_REASON_KEY 同一组文案，保证导出与展示口径一致。
const REVIEW_REASON_KEY: Record<ReimburseReviewReason, TranslationKey> = {
  'invoice-no-missing': 'reimb.review.invoiceNoMissing',
  'invoice-date-missing': 'reimb.review.invoiceDateMissing',
  'seller-missing': 'reimb.review.sellerMissing',
  'amount-missing': 'reimb.review.amountMissing',
  'items-missing': 'reimb.review.itemsMissing',
  'purchaser-mismatch': 'reimb.review.purchaserMismatch',
  'purchaser-missing': 'reimb.review.purchaserMissing',
  'unit-price-imprecise': 'reimb.review.unitPriceImprecise',
  'ocr-recognition': 'reimb.review.ocrRecognition',
  'manual-entry': 'reimb.review.manualEntry',
};

/** 可传入 useI18n 的 t()（params 可选，这里只用无参形式）。 */
export type CsvT = (key: TranslationKey | string) => string;

/** 表头：列序固定 REIMBURSE_EXPORT_COLUMNS，逐列走 t()（中英双语随语言包）。 */
export function reimburseExportHeaders(t: CsvT): ReimburseExportCsvRow {
  return Object.fromEntries(
    REIMBURSE_EXPORT_COLUMNS.map((column) => [column, t(`reimb.export.col.${column}`)]),
  ) as ReimburseExportCsvRow;
}

/**
 * 机器值行 → 已本地化字符串行：枚举统一翻成 t() 文案，再交给 buildReimburseCsv。
 * 与卡片展示同源（status/kind/reviewReasons 复用同一组 key），reviewReasons 用「、」分隔
 * （同卡片，也避免和 CSV 逗号分隔混淆）。
 */
export function localizeReimburseExportRow(row: ReimburseExportRow, t: CsvT): ReimburseExportCsvRow {
  return {
    filename: row.filename,
    member: row.member,
    invoiceNo: row.invoiceNo,
    invoiceDate: row.invoiceDate,
    seller: row.seller,
    purchaserName: row.purchaserName,
    purchaserTaxNo: row.purchaserTaxNo,
    kind: t(KIND_KEY[row.kind]),
    totalYuan: row.totalYuan,
    status: t(STATUS_KEY[row.status]),
    purchaserCheck: t(CHECK_KEY[row.purchaserCheck]),
    reviewReasons: row.reviewReasons
      .map((reason) => t(REVIEW_REASON_KEY[reason]))
      .join('、'),
    bucket: t(BUCKET_KEY[row.bucket]),
    batch: row.batch,
    items: row.items,
    note: row.note,
  };
}

/** 导出文件名 `报销全员发票-YYYYMMDD.csv`（基础名随语言包，日期取本地时间）。 */
export function suggestReimburseExportFilename(now: Date, t: CsvT): string {
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate(),
  ).padStart(2, '0')}`;
  return `${t('reimb.export.fileBase')}-${ymd}.csv`;
}
