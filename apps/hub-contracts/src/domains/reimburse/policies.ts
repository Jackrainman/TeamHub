import { z } from 'zod';

import type {
  ReimburseEntry,
  ReimburseEntryStatus,
  ReimburseProfile,
} from './model.js';

export const PurchaserCheckStatusSchema = z.enum([
  'match',
  'mismatch',
  'missing',
  'skipped',
]);
export type PurchaserCheckStatus = z.infer<typeof PurchaserCheckStatusSchema>;

export const ReimburseReviewReasonSchema = z.enum([
  'invoice-no-missing',
  'invoice-date-missing',
  'seller-missing',
  'amount-missing',
  'items-missing',
  'purchaser-mismatch',
  'purchaser-missing',
  'unit-price-imprecise',
  'ocr-recognition',
  'manual-entry',
]);
export type ReimburseReviewReason = z.infer<typeof ReimburseReviewReasonSchema>;

function normalizeName(value: string): string {
  return value.replace(/\s+/g, '').trim();
}

function normalizeTaxNo(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/** 只校验 profile 中非空的期望字段；实际字段缺失优先返回 missing。 */
export function derivePurchaserCheckStatus(
  purchaser: Pick<ReimburseEntry, 'purchaserName' | 'purchaserTaxNo'>,
  profile: ReimburseProfile,
): PurchaserCheckStatus {
  const expectedName = normalizeName(profile.expectedPurchaserName);
  const expectedTaxNo = normalizeTaxNo(profile.expectedPurchaserTaxNo);
  if (!expectedName && !expectedTaxNo) {
    return 'skipped';
  }

  const actualName = purchaser.purchaserName
    ? normalizeName(purchaser.purchaserName)
    : '';
  const actualTaxNo = purchaser.purchaserTaxNo
    ? normalizeTaxNo(purchaser.purchaserTaxNo)
    : '';
  if ((expectedName && !actualName) || (expectedTaxNo && !actualTaxNo)) {
    return 'missing';
  }
  if (
    (expectedName && actualName !== expectedName) ||
    (expectedTaxNo && actualTaxNo !== expectedTaxNo)
  ) {
    return 'mismatch';
  }
  return 'match';
}

/** 保留既有三档就绪度语义；购买方质量门由独立 policy 处理。 */
export function deriveReimburseStatus(entry: ReimburseEntry): ReimburseEntryStatus {
  const coreFilled =
    entry.invoiceNo !== null &&
    entry.invoiceDate !== null &&
    entry.seller !== null &&
    entry.totalAmountFen > 0 &&
    (entry.kind !== 'goods' || entry.items.length > 0);
  const materialsDone = entry.materials.paymentShot && entry.materials.inspection;
  if (coreFilled && materialsDone) {
    return 'complete';
  }
  const anyFilled =
    entry.invoiceNo !== null ||
    entry.invoiceDate !== null ||
    entry.seller !== null ||
    entry.purchaserName !== null ||
    entry.purchaserTaxNo !== null ||
    entry.totalAmountFen > 0 ||
    entry.items.length > 0 ||
    entry.actualItemName !== null ||
    entry.materials.paymentShot ||
    entry.materials.inspection;
  return anyFilled ? 'partial' : 'draft';
}

export function deriveReimburseReviewReasons(
  entry: ReimburseEntry,
  profile: ReimburseProfile,
): ReimburseReviewReason[] {
  const reasons: ReimburseReviewReason[] = [];
  if (entry.invoiceNo === null) reasons.push('invoice-no-missing');
  if (entry.invoiceDate === null) reasons.push('invoice-date-missing');
  if (entry.seller === null) reasons.push('seller-missing');
  if (entry.totalAmountFen <= 0) reasons.push('amount-missing');
  if (entry.kind === 'goods' && entry.items.length === 0) reasons.push('items-missing');

  const purchaserStatus = derivePurchaserCheckStatus(entry, profile);
  if (purchaserStatus === 'mismatch') reasons.push('purchaser-mismatch');
  if (purchaserStatus === 'missing') reasons.push('purchaser-missing');
  if (entry.items.some((item) => item.unitPriceFen === null)) {
    reasons.push('unit-price-imprecise');
  }
  if (entry.recognitionSource === 'ocr') reasons.push('ocr-recognition');
  if (entry.recognitionSource === 'manual') reasons.push('manual-entry');
  return reasons;
}

export function isReimburseEntryBlocked(
  entry: ReimburseEntry,
  profile: ReimburseProfile,
): boolean {
  const purchaserStatus = derivePurchaserCheckStatus(entry, profile);
  return (
    deriveReimburseStatus(entry) !== 'complete' ||
    purchaserStatus === 'mismatch' ||
    purchaserStatus === 'missing'
  );
}

/**
 * 凭证留档口径（D-094）：服务器是唯一闸门，浏览器拿同一份常量只做提前拦截，
 * 故两处不会各写一套上限/后缀（前后端不得重新实现）。
 */
export const REIMBURSE_EVIDENCE_MAX_BYTES = 20 * 1024 * 1024;
export const REIMBURSE_EVIDENCE_MAX_PER_ENTRY = 12;

/** 允许后缀 → 下载 contentType（发票 PDF + 付款/查验截图）。 */
export const REIMBURSE_EVIDENCE_CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

/** 文件选择框的 accept 串（顺序即界面口径，与上表同源）。 */
export const REIMBURSE_EVIDENCE_ACCEPT = Object.keys(REIMBURSE_EVIDENCE_CONTENT_TYPES).join(',');

/** 取小写后缀（无后缀/点开头/目录段一律回 ''），浏览器与 node 共用一份实现。 */
export function evidenceExtOf(filename: string | undefined): string {
  const base = (filename ?? '').split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  return base.slice(dot).toLowerCase();
}

export function isEvidenceExtAllowed(ext: string): boolean {
  return Object.hasOwn(REIMBURSE_EVIDENCE_CONTENT_TYPES, ext);
}

export function evidenceContentType(ext: string): string {
  return REIMBURSE_EVIDENCE_CONTENT_TYPES[ext] ?? 'application/octet-stream';
}
