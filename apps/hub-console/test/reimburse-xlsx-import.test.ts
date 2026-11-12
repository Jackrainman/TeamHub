import { describe, expect, test } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { draftsFromXlsxRows, readXlsxRows } from '../src/features/reimburse/lib/xlsx-import';

function workbook(): File {
  const files = {
    'xl/workbook.xml': strToU8('<workbook xmlns:r="r"><sheet name="报账明细" r:id="rId1"/></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/sharedStrings.xml': strToU8('<sst><si><t>发票号码</t></si><si><t>实付金额</t></si><si><t>支出类型</t></si><si><t>00123456789012345678</t></si><si><t>车票</t></si><si><t>费用摘要</t></si><si><t>合成行程</t></si></sst>'),
    'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>5</v></c></row><row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>123.45</v></c><c r="C2" t="s"><v>4</v></c><c r="D2" t="s"><v>6</v></c></row></sheetData></worksheet>'),
  };
  return new File([new Uint8Array(zipSync(files))], '合成报账.xlsx');
}

describe('本地 Excel 候选行', () => {
  test('读取共享字符串和数值缓存，长号码保持文本', async () => {
    const rows = await readXlsxRows(workbook());
    expect(rows[1]).toEqual(['00123456789012345678', '123.45', '车票', '合成行程']);
    const drafts = draftsFromXlsxRows(rows);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ invoiceNo: '00123456789012345678', totalYuan: '123.45', expenseType: 'ticket', kind: 'expense', summary: '合成行程' });
  });

  test('无有效明细金额时不造 0；明确商品行才建议采购', () => {
    const rows = [['商品名称', '数量', '明细金额', '实付金额'], ['一包螺丝', '2', '', '10.00']];
    expect(draftsFromXlsxRows(rows)[0].items[0].amountYuan).toBe('');
    const valid = draftsFromXlsxRows([['商品名称', '数量', '明细金额'], ['一包螺丝', '2', '10.00']]);
    expect(valid[0]).toMatchObject({ expenseType: 'purchase', kind: 'goods' });
  });
});
