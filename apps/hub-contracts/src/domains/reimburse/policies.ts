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
