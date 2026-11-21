import { describe, expect, it } from 'vitest';
import { parseInvoicePdfText } from '@teamhub/hub-contracts';

/**
 * 版式回归：pdf.js 文本流在这类数电票上按「品名 规格 税率 单位 金额 税额 单价 数量」输出，
 * 折扣行单独成行（净额/税额为负），必须并入上一条明细而不是新起一条。
 * 文本为合成样例，不含任何真实票据信息。
 */
const PDF_TEXT_LINES = [
  '电子发票（普通发票） 发票号码：26442000011340470000',
  '开票日期：2026年10月03日',
  '购 名称：示例理工大学 销 名称：示例科技有限公司',
  '信 统一社会信用代码/纳税人识别号：91110000000000000X 信 统一社会信用代码/纳税人识别号：91320000000000000Y',
  '项目名称 规格型号 单 位 数 量 单 价 金 额 税率/征收率 税 额',
  '合 计 ¥169.04 ¥21.96',
  '价税合计（大写） （小写）',
  '*计算机配套产品*墨盒  惠普975   13% 个   90.71   11.79 90.71 1',
  '*计算机配套产品*墨盒  13% -6.19   -0.81',
  '*计算机配套产品*墨盒  惠普975   13% 个   90.71   11.79 90.71 1',
  '*计算机配套产品*墨盒  13% -6.19   -0.81',
  '壹佰玖拾壹圆整  ¥ 191.00',
];

describe('invoice PDF detail extraction', () => {
  it('parses tax-rate-first rows and merges discount lines into the previous item', () => {
    const parsed = parseInvoicePdfText(PDF_TEXT_LINES, 'pdf');
    expect(parsed).not.toBeNull();
    expect(parsed!.totalAmountFen).toBe(19100);
    expect(parsed!.items).toEqual([
      { name: '墨盒', unit: '个', quantity: 1, unitPriceFen: 9071, amountFen: 8452 },
      { name: '墨盒', unit: '个', quantity: 1, unitPriceFen: 9071, amountFen: 8452 },
    ]);
    expect(parsed!.items.reduce((sum, item) => sum + item.amountFen, 0)).toBe(16904);
  });
});
