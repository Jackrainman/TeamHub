import { expect, test } from 'vitest';
import { suggestPackageExpenseType, type PackageReview, type ParsedInvoice } from '../src/index.js';

function review(invoice: Partial<ParsedInvoice> | null, invoiceType: PackageReview['invoiceType'] = 'unknown'): PackageReview {
  return {
    selectedInvoice: invoice ? {
      invoiceNo: 'SYN', invoiceDate: null, seller: null, purchaserName: null, purchaserTaxNo: null,
      recognitionSource: 'xml', totalAmountFen: 100, items: [], ...invoice,
    } : null,
    invoiceType, conflictingInvoiceNos: [], missingMaterials: [], reviewReasons: [],
  };
}

test('铁路票、明确打车文字与商品明细只产生可解释建议', () => {
  expect(suggestPackageExpenseType(review({}, 'railway'))).toEqual({ expenseType: 'ticket', reason: 'railway-invoice' });
  expect(suggestPackageExpenseType(review({ seller: '合成网约车出行服务' }))).toEqual({ expenseType: 'taxi', reason: 'taxi-text' });
  expect(suggestPackageExpenseType(review({ items: [{ name: '一包螺丝', unit: '包', quantity: 1, unitPriceFen: 100, amountFen: 100 }] }))).toEqual({ expenseType: 'purchase', reason: 'purchase-items' });
  expect(suggestPackageExpenseType(review(null))).toBeNull();
  expect(suggestPackageExpenseType({ ...review({}, 'railway'), conflictingInvoiceNos: ['A', 'B'] })).toBeNull();
});
