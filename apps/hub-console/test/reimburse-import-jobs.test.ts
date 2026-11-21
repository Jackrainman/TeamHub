import { describe, expect, it } from 'vitest';
import { importPairAmountApproxNotice } from '../src/features/reimburse/components/ReimburseImportJobs';

describe('reimburse import approximate pairing notice', () => {
  it('shows the invoice/payment difference in yuan for an approximate pair', () => {
    const pair = {
      reasons: ['amount-approx'], invoiceFileIds: ['invoice'], paymentFileIds: ['payment'],
    };
    const files = [
      { id: 'invoice', amountFen: 4587 },
      { id: 'payment', amountFen: 4588 },
    ];
    expect(importPairAmountApproxNotice(pair, files)).toBe('金额相差 0.01，请核对');
  });

  it('does not show an approximate notice for an exact pair', () => {
    const pair = { reasons: [], invoiceFileIds: [], paymentFileIds: [] };
    expect(importPairAmountApproxNotice(pair, [])).toBeNull();
  });
});
