import { describe, expect, it } from 'vitest';
import {
  extractPaymentAmountFen,
  matchReimburseImportFiles,
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
      file({ role: 'invoice', amountFen: 2450 }),
      file({ role: 'paymentShot', amountFen: 2450 }),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ status: 'matched', amountFen: 2450, confidence: 'high', reason: null });
    expect(pairs[0].invoiceFileIds).toHaveLength(1);
    expect(pairs[0].paymentFileIds).toHaveLength(1);
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

  it('extracts the labelled payment amount before the largest currency amount', () => {
    expect(extractPaymentAmountFen('支付金额 ￥1,234.56\n其他金额 ¥9999.99')).toBe(123456);
    expect(extractPaymentAmountFen('账户余额 ¥9999.99\n实付：¥88.00')).toBe(8800);
    expect(extractPaymentAmountFen('没有金额')).toBeNull();
  });
});
