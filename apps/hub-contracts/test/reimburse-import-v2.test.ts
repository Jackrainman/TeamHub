import { describe, expect, it } from 'vitest';
import {
  classifyPackageText,
  extractPaymentAmountFen,
  matchReimburseImportFiles,
  parseInvoicePdfText,
  type ReimburseImportFile,
} from '../src/index.js';

let sequence = 0;
function file(patch: Partial<ReimburseImportFile>): ReimburseImportFile {
  sequence += 1;
  return {
    id: `reif-${sequence}`,
    originalName: `file-${sequence}.png`,
    displayName: `file-${sequence}.png`,
    ext: '.png',
    sizeBytes: 100,
    sha256: `sha-${sequence}`,
    role: 'unknown',
    status: 'parsed',
    amountFen: null,
    confidence: null,
    parsed: null,
    error: null,
    removedAt: null,
    ...patch,
  };
}
function match(files: ReimburseImportFile[]) {
  let id = 0;
  return matchReimburseImportFiles(files, () => `reip-${++id}`);
}

describe('reimburse import v2 matching', () => {
  it('pairs one invoice and one payment screenshot at the same amount', () => {
    const pairs = match([
      file({ role: 'invoice', amountFen: 2450, parsed: {
        invoiceNo: '12345678901234567890', invoiceDate: '2026-11-20', seller: '测试商店',
        purchaserName: null, purchaserTaxNo: null, recognitionSource: 'xml', totalAmountFen: 2450,
        items: [{ name: '测试物料', unit: null, quantity: 1, unitPriceFen: null, amountFen: 2450 }],
      } }),
      file({ role: 'paymentShot', amountFen: 2450 }),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ status: 'matched', amountFen: 2450, confidence: 'high', reason: null });
    expect(pairs[0].invoiceFileIds).toHaveLength(1);
    expect(pairs[0].paymentFileIds).toHaveLength(1);
    expect(pairs[0].draft).toMatchObject({ summary: '测试商店', actualItemName: '测试物料', invoiceNo: '12345678901234567890' });
  });

  it('keeps every same-amount candidate pending instead of guessing', () => {
    const pairs = match([
      file({ role: 'invoice', amountFen: 2450 }),
      file({ role: 'paymentShot', amountFen: 2450 }),
      file({ role: 'paymentShot', amountFen: 2450 }),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ status: 'pending', reason: 'ambiguous-amount' });
    expect(pairs[0].paymentFileIds).toHaveLength(2);
  });

  it('marks files without an amount as no-amount pending', () => {
    const pairs = match([file({ role: 'invoice', amountFen: null })]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ status: 'pending', reason: 'no-amount', amountFen: null });
  });

  it('marks an unmatched role as no-match pending', () => {
    const pairs = match([
      file({ role: 'invoice', amountFen: 100 }),
      file({ role: 'paymentShot', amountFen: 200 }),
    ]);
    expect(pairs).toHaveLength(2);
    expect(pairs.every(pair => pair.status === 'pending' && pair.reason === 'no-match')).toBe(true);
  });

  it('recomputes a unique match after one ambiguous file is removed', () => {
    const invoice = file({ role: 'invoice', amountFen: 2450 });
    const firstPayment = file({ role: 'paymentShot', amountFen: 2450 });
    const secondPayment = file({ role: 'paymentShot', amountFen: 2450 });
    expect(match([invoice, firstPayment, secondPayment])[0].status).toBe('pending');
    const recomputed = match([invoice, firstPayment, { ...secondPayment, status: 'removed', removedAt: '2026-11-20T00:00:00.000Z' }]);
    expect(recomputed[0]).toMatchObject({ status: 'matched', invoiceFileIds: [invoice.id], paymentFileIds: [firstPayment.id] });
  });

  it('derives an OCR total from net and tax when the total row is lost', () => {
    const parsed = parseInvoicePdfText([
      '电子发票',
      '纸制品 箱 1 40. 59 40. 59 13% 5.28',
      '合 计 ¥40.59 ¥5. 2 引',
    ], 'ocr');
    expect(parsed?.totalAmountFen).toBe(4587);
  });

  it('normalizes decimal-point whitespace without joining two separated amounts', () => {
    expect(parseInvoicePdfText(['电子发票', '价税合计（小写）¥45. 87'], 'ocr')?.totalAmountFen).toBe(4587);
    expect(parseInvoicePdfText(['电子发票', '价税合计（小写）¥45 87'], 'ocr')?.totalAmountFen ?? null).toBeNull();
  });

  it('recognizes invoice-photo layout signals without classifying payment screenshots as invoices', () => {
    const invoicePhoto = '开票日期: 2026年10月01日\n项目名称 税率/征收率 税额\n价税合计（小写）¥45.87';
    expect(classifyPackageText(invoicePhoto)).toBe('invoice');
    expect(classifyPackageText('交易成功\n先用后付 实付:45.87\n支付方式: 先用后付')).toBe('paymentShot');
    expect(classifyPackageText('微信支付\n支付成功\n¥45.87')).toBe('paymentShot');
  });

  it('extracts the labelled payment amount before the largest currency amount', () => {
    expect(extractPaymentAmountFen('支付金额 ￥1,234.56\n其他金额 ¥9999.99')).toBe(123456);
    expect(extractPaymentAmountFen('账户余额 ¥9999.99\n实付：¥88.00')).toBe(8800);
    expect(extractPaymentAmountFen('先用后付 实付:45.87\n已从微信文付付款冯45.87')).toBe(4587);
    expect(extractPaymentAmountFen('先 用 后 付 实 付 :45.87\n已 从 微 信 支付 付款 45.87')).toBe(4587);
    expect(extractPaymentAmountFen('商品 总 价 ¥240.00\n实 付款 ^ ¥191.00')).toBe(19100);
    expect(extractPaymentAmountFen('实 付 :45. 87')).toBe(4587);
    expect(extractPaymentAmountFen('实 付 :45 87')).toBeNull();
    expect(extractPaymentAmountFen('没有金额')).toBeNull();
  });
});
