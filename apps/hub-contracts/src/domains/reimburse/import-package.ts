import type { ParsedInvoice } from './import.js';
import type { InvoiceType, ReimburseProfile } from './model.js';
import { derivePurchaserCheckStatus, type ReimburseReviewReason } from './policies.js';

export type PackageRole = 'invoice' | 'paymentShot' | 'inspection' | 'supporting' | 'unknown';
export interface PackageCandidate {
  path: string;
  role: PackageRole;
  invoice: ParsedInvoice | null;
  invoiceType: InvoiceType;
}
export type PackageReviewReason = ReimburseReviewReason | 'multiple-invoices' | 'ambiguous-invoices' |
  'amount-conflict' | 'items-total-mismatch' | 'unknown-type' | 'unclassified-material';
export interface PackageReview {
  selectedInvoice: ParsedInvoice | null;
  invoiceType: InvoiceType;
  conflictingInvoiceNos: string[];
  missingMaterials: ('invoice' | 'paymentShot')[];
  reviewReasons: PackageReviewReason[];
}

export function classifyInvoiceType(text: string): InvoiceType {
  const compact = text.replace(/\s/g, '');
  if (/铁路电子客票|电子客票号/.test(compact)) return 'railway';
  if (/专用发票/.test(compact)) return 'vatSpecial';
  if (/普通发票/.test(compact)) return 'vatOrdinary';
  if (/机动车销售统一发票|航空运输电子客票行程单|定额发票/.test(compact)) return 'other';
  return 'unknown';
}

/** 只有票面标识支持的文本才能给发票字段赋值；付款截图中的金额不代表发票金额。 */
export function classifyPackageText(text: string): PackageRole {
  const compact = text.replace(/\s/g, '');
  if (/查验结果|发票查验|查验一致/.test(compact)) return 'inspection';
  if (/发票号码|电子客票号|铁路电子客票|<Invoice[\s>]|<EIid>|<[^>]*:xbrl/i.test(text) ||
    /发票号码|铁路电子客票/.test(compact)) return 'invoice';
  if (/付款成功|支付成功|交易成功|支付方式|交易单号|商户单号/.test(compact)) return 'paymentShot';
  return 'unknown';
}

export function derivePackageReview(candidates: readonly PackageCandidate[], profile: ReimburseProfile): PackageReview {
  const invoices = candidates.filter(candidate => candidate.role === 'invoice');
  const parsed = invoices.filter((candidate): candidate is PackageCandidate & { invoice: ParsedInvoice } => candidate.invoice !== null);
  const numbers = [...new Set(parsed.map(candidate => candidate.invoice.invoiceNo.trim()).filter(Boolean))];
  const ambiguous = parsed.length > 1 && parsed.some(candidate => !candidate.invoice.invoiceNo.trim());
  const conflictingInvoiceNos = numbers.length > 1 ? numbers : [];
  const rank = { xml: 0, pdf: 1, ocr: 2, manual: 3 };
  const selected = conflictingInvoiceNos.length || ambiguous ? undefined :
    [...parsed].sort((a, b) => rank[a.invoice.recognitionSource] - rank[b.invoice.recognitionSource])[0];
  const selectedInvoice = selected?.invoice ?? null;
  const knownTypes = [...new Set(invoices.map(candidate => candidate.invoiceType).filter(type => type !== 'unknown'))];
  const invoiceType = selected && knownTypes.length === 1 ? knownTypes[0] : 'unknown';
  const missingMaterials: PackageReview['missingMaterials'] = [];
  if (!invoices.length) missingMaterials.push('invoice');
  if (!candidates.some(candidate => candidate.role === 'paymentShot')) missingMaterials.push('paymentShot');
  const reviewReasons: PackageReviewReason[] = [];
  if (conflictingInvoiceNos.length) reviewReasons.push('multiple-invoices');
  if (ambiguous) reviewReasons.push('ambiguous-invoices');
  if (invoiceType === 'unknown') reviewReasons.push('unknown-type');
  if (candidates.some(candidate => candidate.role === 'unknown')) reviewReasons.push('unclassified-material');
  if (!selectedInvoice?.invoiceNo) reviewReasons.push('invoice-no-missing');
  if (!selectedInvoice?.invoiceDate) reviewReasons.push('invoice-date-missing');
  if (!selectedInvoice?.seller) reviewReasons.push('seller-missing');
  if (selectedInvoice?.totalAmountFen == null) reviewReasons.push('amount-missing');
  if (invoiceType !== 'railway' && !selectedInvoice?.items.length) reviewReasons.push('items-missing');
  const purchaser = derivePurchaserCheckStatus({ purchaserName: selectedInvoice?.purchaserName ?? null,
    purchaserTaxNo: selectedInvoice?.purchaserTaxNo ?? null }, profile);
  if (purchaser === 'missing') reviewReasons.push('purchaser-missing');
  if (purchaser === 'mismatch') reviewReasons.push('purchaser-mismatch');
  if (selectedInvoice?.recognitionSource === 'ocr') reviewReasons.push('ocr-recognition');
  if (new Set(parsed.map(candidate => candidate.invoice.totalAmountFen).filter(amount => amount !== null)).size > 1) reviewReasons.push('amount-conflict');
  if (selectedInvoice?.items.length && selectedInvoice.totalAmountFen !== null &&
    selectedInvoice.items.reduce((sum, item) => sum + item.amountFen, 0) !== selectedInvoice.totalAmountFen) reviewReasons.push('items-total-mismatch');
  return { selectedInvoice, invoiceType, conflictingInvoiceNos, missingMaterials, reviewReasons };
}
