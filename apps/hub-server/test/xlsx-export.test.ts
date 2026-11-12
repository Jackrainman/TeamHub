import { describe, expect, test } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { buildXlsx } from '../src/platform/export/xlsx.js';

describe('最小 XLSX 交付生成器', () => {
  test('生成含两张工作表的有效 OOXML，保留长号码并留空未知金额', () => {
    const bytes = buildXlsx([
      { name: '报账明细', rows: [['赛季', '发票号码', '核准金额'], ['2027RC', '00123456789012345678', null], ['=不是公式', '<合成>&"', 12345]] },
      { name: '类型汇总', rows: [['支出类型', '数量'], ['采购', 1]] },
    ]);
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toContain('xl/workbook.xml');
    const workbook = strFromU8(files['xl/workbook.xml']);
    expect(workbook).toContain('报账明细');
    expect(workbook).toContain('类型汇总');
    const detail = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(detail).toContain('00123456789012345678');
    expect(detail).toContain('t="inlineStr"');
    expect(detail).toContain('&lt;合成&gt;&amp;&quot;');
    expect(detail).not.toContain('<f>');
    expect(detail).toContain('<v>12345</v>');
    expect(strFromU8(files['xl/worksheets/sheet2.xml'])).toContain('采购');
  });

  test('空工作表集合明确失败', () => {
    expect(() => buildXlsx([])).toThrow('at least one sheet');
  });
});
