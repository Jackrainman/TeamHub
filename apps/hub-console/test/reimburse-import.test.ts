import { describe, expect, test } from 'vitest';
import { buildTextLines, type PdfTextItemLike } from '../src/features/reimburse/lib/pdf-extract';
import {
  analyzeInvoiceFile,
  classifyInvoiceFile,
  draftFromParsedInvoice,
  type AnalyzeDeps,
} from '../src/features/reimburse/reimburse-import';
import { emptyEntryDraft } from '../src/features/reimburse/reimburse-utils';
import type { ParsedInvoice } from '@teamhub/hub-contracts';

// 发票导入域单测（REIMBURSE-PROC 阶段 4）——测逻辑不测库/DOM：
// buildTextLines 喂 mock 的 pdf.js item 流；analyzeInvoiceFile 注入 fake 读文件/抽取器。

function item(str: string, x: number, y: number, width?: number): PdfTextItemLike {
  return { str, x, y, width, height: 10 };
}

describe('buildTextLines：pdf.js item 流 → 忠实版式文本行', () => {
  test('同视觉行的拆分 run 合并，行间按 y 降序排列', () => {
    const lines = buildTextLines([
      item('合计', 40, 700, 20),
      item('电子发票', 40, 780, 40),
      item('¥', 66, 700, 6),
      item('100.00', 76, 700, 30),
    ]);
    expect(lines).toEqual(['电子发票', '合计 ¥ 100.00']);
  });

  test('按列拆分的文本流（购销双列交错）按视觉位置重排到同一行', () => {
    // pdf.js 内容流顺序：先左列全部再右列——直接拼接会把「购」「销」行错开。
    const lines = buildTextLines([
      item('购', 40, 600, 10),
      item('名称：某某大学', 60, 600, 110),
      item('统一社会信用代码：91A', 60, 585, 150),
      item('销', 300, 600, 10),
      item('名称：某某科技公司', 320, 600, 130),
      item('统一社会信用代码：91B', 320, 585, 150),
    ]);
    expect(lines).toEqual([
      '购 名称：某某大学 销 名称：某某科技公司',
      '统一社会信用代码：91A 统一社会信用代码：91B',
    ]);
  });

  test('y 容差内的轻微基线偏移仍归同一行', () => {
    const lines = buildTextLines([
      item('发票号码：', 40, 640, 50),
      item('24312000000012345678', 95, 641.5, 100), // 数字 run 基线偏 1.5pt
    ]);
    expect(lines).toEqual(['发票号码： 24312000000012345678']);
  });

  test('相邻 run 空隙小不补空格（避免把品名拆碎）', () => {
    const lines = buildTextLines([
      item('*电子设备*', 40, 500, 60),
      item('电机驱动板', 100.5, 500, 50),
    ]);
    expect(lines).toEqual(['*电子设备*电机驱动板']);
  });

  test('空串 item 被过滤', () => {
    const lines = buildTextLines([item('   ', 40, 500), item('备注：无', 40, 480, 40)]);
    expect(lines).toEqual(['备注：无']);
  });
});

describe('classifyInvoiceFile：按扩展名分类', () => {
  test('.xml/.pdf 大小写不敏感', () => {
    expect(classifyInvoiceFile('a.xml')).toBe('xml');
    expect(classifyInvoiceFile('B.PDF')).toBe('pdf');
    expect(classifyInvoiceFile('目录/c.Xml')).toBe('xml');
  });

  test('其他类型 → null', () => {
    expect(classifyInvoiceFile('截图.png')).toBeNull();
    expect(classifyInvoiceFile('无扩展名')).toBeNull();
    expect(classifyInvoiceFile('x.pdfx')).toBeNull();
  });
});

const SAMPLE_XML =
  '<Invoice><EIid>24312000000012345678</EIid><IssueTime>2026-07-01</IssueTime>' +
  '<SellerName>某某科技公司</SellerName><TotalTax-includedAmount>113.00</TotalTax-includedAmount>' +
  '<Item><ItemName>*电子设备*电机</ItemName><MeaUnits>个</MeaUnits><Quantity>1</Quantity>' +
  '<UnPrice>100.00</UnPrice><Amount>100.00</Amount><ComTaxAm>13.00</ComTaxAm></Item></Invoice>';

const SAMPLE_PDF_LINES = [
  '电子发票（普通发票）',
  '发票号码：24312000000012345678',
  '开票日期：2026年07月01日',
  '购 名称：某某大学 销 名称：某某科技公司',
  '*电子设备*电机 个 1 100.00 100.00 13% 13.00',
  '价税合计（小写）¥113.00',
];

function deps(overrides: Partial<AnalyzeDeps>): AnalyzeDeps {
  return {
    readText: () => Promise.reject(new Error('不应走到')),
    extractPdfLines: () => Promise.reject(new Error('不应走到')),
    ...overrides,
  };
}

describe('analyzeInvoiceFile：单文件导入编排', () => {
  test('xml 识别成功 → parsed（带结构化字段）', async () => {
    const file = new File([SAMPLE_XML], 'inv.xml');
    const outcome = await analyzeInvoiceFile(
      file,
      deps({ readText: (f) => f.text() }),
    );
    expect(outcome.kind).toBe('parsed');
    if (outcome.kind !== 'parsed') throw new Error('unreachable');
    expect(outcome.invoice.invoiceNo).toBe('24312000000012345678');
    expect(outcome.invoice.seller).toBe('某某科技公司');
    expect(outcome.invoice.totalAmountFen).toBe(11300);
    expect(outcome.invoice.items).toHaveLength(1);
  });

  test('pdf 走注入的抽取器 → 文本行进 contracts 解析', async () => {
    const file = new File(['%PDF-fake'], 'inv.pdf');
    const outcome = await analyzeInvoiceFile(
      file,
      deps({ extractPdfLines: () => Promise.resolve(SAMPLE_PDF_LINES) }),
    );
    expect(outcome.kind).toBe('parsed');
    if (outcome.kind !== 'parsed') throw new Error('unreachable');
    expect(outcome.invoice.invoiceNo).toBe('24312000000012345678');
    expect(outcome.invoice.totalAmountFen).toBe(11300);
  });

  test('解析函数返回 null → unrecognized（开空表单手填，不算错误）', async () => {
    const file = new File(['随便一段文字'], 'note.xml');
    const outcome = await analyzeInvoiceFile(
      file,
      deps({ readText: (f) => f.text() }),
    );
    expect(outcome).toEqual({ kind: 'unrecognized', fileName: 'note.xml' });
  });

  test('读取/抽取抛错（非发票 PDF、损坏文件）→ failed/read，不静默', async () => {
    const file = new File(['garbage'], 'broken.pdf');
    const outcome = await analyzeInvoiceFile(
      file,
      deps({ extractPdfLines: () => Promise.reject(new Error('Invalid PDF structure')) }),
    );
    expect(outcome).toEqual({ kind: 'failed', fileName: 'broken.pdf', reason: 'read' });
  });

  test('非 .xml/.pdf → failed/type，不尝试读取', async () => {
    const file = new File(['png-bytes'], '付款截图.png');
    const outcome = await analyzeInvoiceFile(file, deps({}));
    expect(outcome).toEqual({ kind: 'failed', fileName: '付款截图.png', reason: 'type' });
  });
});

describe('draftFromParsedInvoice：识别结果 → 表单预填草稿', () => {
  const invoice: ParsedInvoice = {
    invoiceNo: '24312000000012345678',
    invoiceDate: '2026-07-01',
    seller: '某某科技公司',
    purchaserName: '哈尔滨工业大学',
    purchaserTaxNo: '12100000400000456B',
    recognitionSource: 'xml',
    totalAmountFen: 11300,
    items: [
      { name: '电机驱动板', unit: '块', quantity: 2, unitPriceFen: 5000, amountFen: 11300 },
    ],
  };

  test('字段映射 + 分转元两位小数', () => {
    const draft = draftFromParsedInvoice(invoice);
    expect(draft.kind).toBe('goods');
    expect(draft.invoiceNo).toBe('24312000000012345678');
    expect(draft.invoiceDate).toBe('2026-07-01');
    expect(draft.seller).toBe('某某科技公司');
    expect(draft.purchaserName).toBe('哈尔滨工业大学');
    expect(draft.purchaserTaxNo).toBe('12100000400000456B');
    expect(draft.recognitionSource).toBe('xml');
    expect(draft.totalYuan).toBe('113.00');
    expect(draft.items).toEqual([
      { name: '电机驱动板', unit: '块', quantity: '2', unitPriceYuan: '50.00', amountYuan: '113.00' },
    ]);
    // 预填草稿须能直接通过表单装配校验（等价于用户照着填了一遍）。
    expect(draft.items[0].name).not.toBe('');
  });

  test('识别不出的字段留空串，明细空时给一行空行', () => {
    const draft = draftFromParsedInvoice({
      invoiceNo: '24312000000012345678',
      invoiceDate: null,
      seller: null,
      purchaserName: null,
      purchaserTaxNo: null,
      recognitionSource: 'pdf',
      totalAmountFen: null,
      items: [],
    });
    expect(draft.invoiceDate).toBe('');
    expect(draft.seller).toBe('');
    expect(draft.purchaserName).toBe('');
    expect(draft.purchaserTaxNo).toBe('');
    expect(draft.recognitionSource).toBe('pdf');
    expect(draft.totalYuan).toBe('');
    expect(draft.items).toEqual(emptyEntryDraft().items);
  });
});
