import { describe, expect, it } from 'vitest';
import { draftFromParsedInvoice } from '../src/features/reimburse/reimburse-import';
import {
  buildCreateEntryRequest,
  emptyEntryDraft,
  entryDraftValidationIssue,
  entryItemsTotalFen,
  updateEntryItemDraft,
} from '../src/features/reimburse/reimburse-utils';

describe('reimburse entry form drafts', () => {
  it('uses the first purchase item name when summary and actual item name are empty', () => {
    const draft = {
      ...emptyEntryDraft(),
      expenseType: 'purchase' as const,
      items: [
        { name: '惠普975墨盒', unit: '个', quantity: '2', unitPriceYuan: '84.52', amountYuan: '169.04' },
      ],
    };
    expect(buildCreateEntryRequest(draft)).toMatchObject({
      summary: '惠普975墨盒',
      totalAmountFen: null,
    });
  });

  it('calculates an empty amount from quantity and unit price using integer fen', () => {
    const row = { name: '惠普975墨盒', unit: '个', quantity: '2', unitPriceYuan: '84.52', amountYuan: '' };
    expect(updateEntryItemDraft(row, { unitPriceYuan: '84.52' }).amountYuan).toBe('169.04');
  });

  it('recalculates an automatic amount but never overwrites a manually edited amount', () => {
    const imported = { name: '墨盒', unit: '个', quantity: '2', unitPriceYuan: '84.52', amountYuan: '169.04' };
    expect(updateEntryItemDraft(imported, { quantity: '3' }).amountYuan).toBe('253.56');
    const manual = updateEntryItemDraft(imported, { amountYuan: '200.00' });
    expect(updateEntryItemDraft(manual, { quantity: '3' }).amountYuan).toBe('200.00');
  });

  it('reports the exact invalid field instead of a generic form error', () => {
    const draft = { ...emptyEntryDraft(), expenseType: 'purchase' as const };
    expect(entryDraftValidationIssue({ ...draft, totalYuan: '12.345' })).toBe('total-invalid');
    expect(entryDraftValidationIssue({
      ...draft,
      items: [{ name: '', unit: '个', quantity: '1', unitPriceYuan: '10.00', amountYuan: '10.00' }],
    })).toBe('item-name-required');
    expect(entryDraftValidationIssue({
      ...draft,
      items: [{ name: '墨盒', unit: '个', quantity: '', unitPriceYuan: '10.00', amountYuan: '10.00' }],
    })).toBe('item-quantity-invalid');
    expect(entryDraftValidationIssue({
      ...draft,
      items: [{ name: '墨盒', unit: '个', quantity: '1', unitPriceYuan: '10.00', amountYuan: '' }],
    })).toBe('item-amount-required');
  });

  it('sums valid item amounts for a non-blocking total mismatch hint', () => {
    expect(entryItemsTotalFen({
      ...emptyEntryDraft(),
      items: [
        { name: '墨盒', unit: '个', quantity: '1', unitPriceYuan: '90.71', amountYuan: '84.52' },
        { name: '墨盒', unit: '个', quantity: '1', unitPriceYuan: '90.71', amountYuan: '84.52' },
      ],
    })).toBe(16904);
    expect(entryItemsTotalFen(emptyEntryDraft())).toBeNull();
  });

  it('round-trips every existing item into edit form fields', () => {
    const draft = draftFromParsedInvoice({
      invoiceNo: '12345678', invoiceDate: '2026-11-21', seller: '测试商店',
      purchaserName: null, purchaserTaxNo: null, recognitionSource: 'pdf', totalAmountFen: 16904,
      items: [
        { name: '墨盒', unit: '个', quantity: 1, unitPriceFen: 9071, amountFen: 8452 },
        { name: '打印纸', unit: '包', quantity: 2, unitPriceFen: 1000, amountFen: 2000 },
      ],
    });
    expect(draft.items).toEqual([
      { name: '墨盒', unit: '个', quantity: '1', unitPriceYuan: '90.71', amountYuan: '84.52' },
      { name: '打印纸', unit: '包', quantity: '2', unitPriceYuan: '10.00', amountYuan: '20.00' },
    ]);
    expect(draft.totalYuan).toBe('169.04');
  });
});
