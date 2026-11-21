import { z } from 'zod';
import { isoDateTimeSchema } from '../../common.js';
import { classifyPackageText } from './import-package.js';
import { kindForExpenseType } from './workflow.js';
import {
  InvoiceRecognitionSourceSchema, InvoiceTypeSchema, ReimburseItemSchema,
} from './model.js';
import {
  CreateReimburseEntryRequestSchema,
} from './requests.js';
import type { ParsedInvoice } from './import.js';
import type { ReimburseExpenseType } from './model.js';

export const ReimburseImportFileStatusSchema = z.enum(['uploading', 'parsed', 'mounted', 'unreadable', 'duplicate', 'pending', 'removed']);
export const ReimburseImportPairStatusSchema = z.enum(['matched', 'pending', 'confirmed', 'dismissed']);
export const ReimburseImportPendingReasonSchema = z.enum(['no-match', 'ambiguous-amount', 'no-amount', 'unsupported']);
export const ReimburseImportDraftSchema = CreateReimburseEntryRequestSchema.omit({ clientRequestId: true });

export const ParsedInvoiceSchema = z.object({
  invoiceNo: z.string(),
  invoiceType: InvoiceTypeSchema.default('unknown'),
  invoiceDate: z.string().nullable(),
  seller: z.string().nullable(),
  purchaserName: z.string().nullable(),
  purchaserTaxNo: z.string().nullable(),
  recognitionSource: InvoiceRecognitionSourceSchema,
  totalAmountFen: z.number().int().nullable(),
  items: z.array(ReimburseItemSchema),
});

export const ReimburseImportFileSchema = z.object({
  id: z.string().min(1),
  originalName: z.string().min(1),
  displayName: z.string().min(1),
  ext: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().min(1),
  role: z.enum(['invoice', 'paymentShot', 'inspection', 'unknown']),
  status: ReimburseImportFileStatusSchema,
  amountFen: z.number().int().nonnegative().nullable(),
  confidence: z.number().min(0).max(100).nullable(),
  parsed: ParsedInvoiceSchema.nullable(),
  error: z.string().nullable(),
  removedAt: isoDateTimeSchema.nullable(),
});

export const ReimburseImportPairSchema = z.object({
  id: z.string().min(1),
  status: ReimburseImportPairStatusSchema,
  fileIds: z.array(z.string().min(1)),
  invoiceFileIds: z.array(z.string().min(1)),
  paymentFileIds: z.array(z.string().min(1)),
  amountFen: z.number().int().nonnegative().nullable(),
  draft: ReimburseImportDraftSchema,
  confidence: z.enum(['high', 'medium', 'low']),
  reasons: z.array(z.string()),
  reason: ReimburseImportPendingReasonSchema.nullable(),
  confirmedEntryId: z.string().min(1).nullable(),
});

export const ReimburseImportHistoryEventSchema = z.object({
  action: z.literal('file-removed'),
  fileId: z.string().min(1),
  originalName: z.string().min(1),
  sha256: z.string().min(1),
  at: isoDateTimeSchema,
});

export const ReimburseImportJobSchema = z.object({
  id: z.string().min(1),
  memberId: z.string().min(1),
  status: z.enum(['parsing', 'ready', 'closed']),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  files: z.array(ReimburseImportFileSchema),
  pairs: z.array(ReimburseImportPairSchema),
  confirmedEntryIds: z.array(z.string().min(1)),
  history: z.array(ReimburseImportHistoryEventSchema),
  error: z.string().nullable(),
});

export const ReimburseImportJobResponseSchema = z.object({ job: ReimburseImportJobSchema });
export const ReimburseImportJobsResponseSchema = z.object({ jobs: z.array(ReimburseImportJobSchema) });
export const ReimburseImportListQuerySchema = z.object({ memberId: z.string().min(1).optional() });
export const ConfirmReimburseImportRequestSchema = z.object({
  items: z.array(z.object({
    pairId: z.string().min(1),
    draft: ReimburseImportDraftSchema,
    clientRequestId: z.string().uuid(),
    batchId: z.string().min(1).nullable().optional(),
  }).strict()).min(1),
}).strict();
export const ConfirmReimburseImportResponseSchema = ReimburseImportJobResponseSchema;

function emptyDraft() {
  return {
    kind: 'expense' as const,
    expenseType: null,
    summary: null,
    invoiceType: 'unknown' as const,
    invoiceNo: null,
    invoiceDate: null,
    seller: null,
    purchaserName: null,
    purchaserTaxNo: null,
    recognitionSource: 'manual' as const,
    totalAmountFen: null,
    items: [],
    actualItemName: null,
    materials: { invoice: false, paymentShot: false, inspection: false },
    note: null,
  };
}

function expenseTypeFor(invoice: ParsedInvoice): ReimburseExpenseType | null {
  const text = [invoice.seller ?? '', ...invoice.items.map(item => item.name)].join(' ');
  if (/铁路电子客票|铁路客运/.test(text)) return 'ticket';
  if (/出租车|网约车|滴滴|出行服务/.test(text)) return 'taxi';
  if (invoice.items.length > 0) return 'purchase';
  return null;
}

function draftForInvoice(invoice: ParsedInvoice | null, confidence: number | null, hasPayment: boolean) {
  if (!invoice) return emptyDraft();
  const expenseType = expenseTypeFor(invoice);
  const invoiceNoValid = /^(?:\d{8}|\d{20})$/.test(invoice.invoiceNo);
  const trustworthyInvoiceNo = invoice.recognitionSource !== 'ocr'
    ? invoiceNoValid
    : invoiceNoValid && confidence !== null && confidence >= 80;
  return {
    ...emptyDraft(),
    kind: expenseType ? kindForExpenseType(expenseType) : 'goods' as const,
    expenseType,
    summary: invoice.items[0]?.name ?? invoice.seller ?? null,
    invoiceType: invoice.invoiceType,
    invoiceNo: trustworthyInvoiceNo ? invoice.invoiceNo : null,
    invoiceDate: invoice.invoiceDate,
    seller: invoice.seller,
    purchaserName: invoice.purchaserName,
    purchaserTaxNo: invoice.purchaserTaxNo,
    recognitionSource: invoice.recognitionSource,
    totalAmountFen: invoice.totalAmountFen,
    items: invoice.items,
    actualItemName: invoice.items[0]?.name ?? null,
    materials: { invoice: true, paymentShot: hasPayment, inspection: false },
  };
}

/** 元文本转分；只接受至多两位小数，不用浮点金额做配对。 */
function paymentYuanToFen(raw: string): number | null {
  const cleaned = raw.replace(/[¥￥]/g, '').trim()
    .replace(/(?<=\d)\s*\.\s*(?=\d)/g, '.')
    .replace(/(?<=\d)[,，]\s*(?=\d)/g, ',');
  if (/\s/.test(cleaned)) return null;
  const normalized = cleaned.replace(/[,，]/g, '');
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  return Number.parseInt(match[1], 10) * 100 + Number.parseInt((match[2] ?? '').padEnd(2, '0'), 10);
}

const CURRENCY = String.raw`[¥￥]\s*([0-9][0-9,，\s]*(?:\.\s*\d{1,2})?)`;
const PAYMENT_LABEL = String.raw`支\s*付\s*金\s*额|实\s*付\s*款?|合\s*计|交\s*易\s*金\s*额`;
/** 付款截图金额：优先标签同行，其次全图最大 ¥ 金额。 */
export function extractPaymentAmountFen(text: string): number | null {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!new RegExp(PAYMENT_LABEL).test(line)) continue;
    const match = new RegExp(CURRENCY).exec(line)
      ?? new RegExp(String.raw`(?:${PAYMENT_LABEL})\s*[:：]?\s*([0-9][0-9,，]*(?:\.\s*\d{1,2})?)(?!\s*\d)`).exec(line);
    const amount = match ? paymentYuanToFen(match[1]) : null;
    if (amount !== null) return amount;
  }
  const amounts = [...text.matchAll(new RegExp(CURRENCY, 'g'))]
    .map(match => paymentYuanToFen(match[1]))
    .filter((amount): amount is number => amount !== null);
  return amounts.length ? Math.max(...amounts) : null;
}

/** 角色判定的统一入口；XML/OFD/PDF 的结构化结果与 OCR 文本均复用 contracts 分类。 */
export function classifyReimburseImportText(text: string) {
  return classifyPackageText(text);
}

export function matchReimburseImportFiles(
  files: readonly ReimburseImportFile[],
  createId: () => string,
): ReimburseImportPair[] {
  const active = files.filter(file => file.status === 'parsed');
  const invoices = active.filter(file => file.role === 'invoice');
  const payments = active.filter(file => file.role === 'paymentShot');
  const pairs: ReimburseImportPair[] = [];
  const makePair = (
    group: readonly ReimburseImportFile[],
    status: ReimburseImportPair['status'],
    amountFen: number | null,
    reason: ReimburseImportPendingReason | null,
    approximate = false,
  ): ReimburseImportPair => {
    const invoiceFiles = group.filter(file => file.role === 'invoice');
    const invoice = invoiceFiles.length === 1 ? invoiceFiles[0].parsed : null;
    const draft = draftForInvoice(invoice, invoiceFiles[0]?.confidence ?? null, group.some(file => file.role === 'paymentShot'));
    draft.totalAmountFen = amountFen ?? draft.totalAmountFen;
    return {
      id: createId(), status, fileIds: group.map(file => file.id),
      invoiceFileIds: group.filter(file => file.role === 'invoice').map(file => file.id),
      paymentFileIds: group.filter(file => file.role === 'paymentShot').map(file => file.id),
      amountFen, draft, confidence: status === 'matched' ? approximate ? 'medium' : 'high' : 'low',
      reasons: [
        ...(invoice?.recognitionSource === 'ocr' ? ['ocr-recognition'] : []),
        ...(approximate ? ['amount-approx'] : []),
      ],
      reason, confirmedEntryId: null,
    };
  };

  const amounts = [...new Set([...invoices, ...payments]
    .map(file => file.amountFen).filter((amount): amount is number => amount !== null))].sort((a, b) => a - b);
  for (const amountFen of amounts) {
    const group = [...invoices, ...payments].filter(file => file.amountFen === amountFen);
    const invoiceCount = group.filter(file => file.role === 'invoice').length;
    const paymentCount = group.filter(file => file.role === 'paymentShot').length;
    if (invoiceCount === 1 && paymentCount === 1) pairs.push(makePair(group, 'matched', amountFen, null));
    else if (invoiceCount > 0 && paymentCount > 0) pairs.push(makePair(group, 'pending', amountFen, 'ambiguous-amount'));
    else pairs.push(makePair(group, 'pending', amountFen, 'no-match'));
  }
  // 精确配对优先。只差 1～2 分时，仅合并互为唯一候选的单边待定项；
  // 重复发票/付款截图或更大差额仍保留待定，不用近似金额猜测归属。
  const unmatchedSingles = pairs.filter(pair => pair.status === 'pending' && pair.reason === 'no-match'
    && pair.amountFen !== null && pair.fileIds.length === 1);
  const invoicePairs = unmatchedSingles.filter(pair => pair.invoiceFileIds.length === 1);
  const paymentPairs = unmatchedSingles.filter(pair => pair.paymentFileIds.length === 1);
  const closeEnough = (left: ReimburseImportPair, right: ReimburseImportPair) =>
    Math.abs(left.amountFen! - right.amountFen!) > 0 && Math.abs(left.amountFen! - right.amountFen!) <= 2;
  const approximations: Array<[ReimburseImportPair, ReimburseImportPair]> = [];
  for (const invoicePair of invoicePairs) {
    const candidates = paymentPairs.filter(paymentPair => closeEnough(invoicePair, paymentPair));
    if (candidates.length !== 1) continue;
    const paymentPair = candidates[0];
    if (invoicePairs.filter(candidate => closeEnough(candidate, paymentPair)).length !== 1) continue;
    approximations.push([invoicePair, paymentPair]);
  }
  const approximated = new Set(approximations.flat());
  for (let index = pairs.length - 1; index >= 0; index -= 1) {
    if (approximated.has(pairs[index])) pairs.splice(index, 1);
  }
  for (const [invoicePair, paymentPair] of approximations) {
    const invoiceFile = invoices.find(file => file.id === invoicePair.invoiceFileIds[0])!;
    const paymentFile = payments.find(file => file.id === paymentPair.paymentFileIds[0])!;
    pairs.push(makePair([invoiceFile, paymentFile], 'matched', invoicePair.amountFen, null, true));
  }
  for (const file of [...invoices, ...payments].filter(file => file.amountFen === null)) {
    pairs.push(makePair([file], 'pending', null, 'no-amount'));
  }
  const unsupported = files.filter(file => file.status === 'unreadable' ||
    (file.status === 'parsed' && file.role !== 'invoice' && file.role !== 'paymentShot' && file.role !== 'inspection'));
  for (const file of unsupported) pairs.push(makePair([file], 'pending', file.amountFen, 'unsupported'));
  return pairs;
}

export type ReimburseImportFileStatus = z.infer<typeof ReimburseImportFileStatusSchema>;
export type ReimburseImportPairStatus = z.infer<typeof ReimburseImportPairStatusSchema>;
export type ReimburseImportPendingReason = z.infer<typeof ReimburseImportPendingReasonSchema>;
export type ReimburseImportDraft = z.infer<typeof ReimburseImportDraftSchema>;
export type ReimburseImportFile = z.infer<typeof ReimburseImportFileSchema>;
export type ReimburseImportPair = z.infer<typeof ReimburseImportPairSchema>;
export type ReimburseImportJob = z.infer<typeof ReimburseImportJobSchema>;
export type ReimburseImportJobResponse = z.infer<typeof ReimburseImportJobResponseSchema>;
export type ReimburseImportJobsResponse = z.infer<typeof ReimburseImportJobsResponseSchema>;
export type ReimburseImportListQuery = z.infer<typeof ReimburseImportListQuerySchema>;
export type ConfirmReimburseImportRequest = z.infer<typeof ConfirmReimburseImportRequestSchema>;
