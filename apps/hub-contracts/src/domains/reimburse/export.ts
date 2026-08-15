import type {
  ReimburseAmountBucket,
  ReimburseBatchSummary,
  ReimburseEntry,
  ReimburseFinancialSummary,
  ReimburseProfile,
} from './model.js';
import {
  deriveReimburseReviewReasons,
  deriveReimburseStatus,
  isReimburseEntryBlocked,
} from './policies.js';

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
