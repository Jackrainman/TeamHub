import { describe, expect, it } from 'vitest';
import { importPairAmountApproxNotice, isArchivedReimburseImportJob } from '../src/features/reimburse/components/ReimburseImportJobs';

describe('reimburse import job archiving', () => {
  it('archives only closed jobs that have confirmed entries', () => {
    expect(isArchivedReimburseImportJob({ status: 'closed', confirmedEntryIds: ['entry-1'] })).toBe(true);
    expect(isArchivedReimburseImportJob({ status: 'closed', confirmedEntryIds: [] })).toBe(false);
    expect(isArchivedReimburseImportJob({ status: 'ready', confirmedEntryIds: ['entry-1'] })).toBe(false);
  });
});

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
