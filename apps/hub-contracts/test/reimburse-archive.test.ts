import { describe, expect, test } from 'vitest';
import {
  classifyInvoiceEntryKind,
  INVOICE_ARCHIVE_LIMITS,
  parseInvoiceXbrlText,
  planInvoiceArchive,
} from '../src/index.js';

/**
 * REIMBURSE-OFD-PARSE：OFD 内嵌 XBRL 解析 + 归档安全门规划。
 * XBRL 样本按真实铁路电子客票结构改写（字段值全部虚构脱敏）。
 */

const RAILWAY_XBRL = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xbrl xmlns="http://www.xbrl.org/2003/instance" xmlns:rai="http://xbrl.mof.gov.cn/taxonomy/2021-11-30/rai" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<context id="As_Of_2026_01_01"><entity><identifier scheme="http://xbrl.mof.gov.cn">12345678901234567890</identifier></entity></context>
<unit id="CNY"><measure>iso4217:CNY</measure></unit>
<rai:TypeOfVoucher contextRef="As_Of_2026_01_01">电子发票（铁路电子客票）</rai:TypeOfVoucher>
<rai:ElectronicInvoiceRailwayETicketNumber contextRef="As_Of_2026_01_01">12345678901234567890</rai:ElectronicInvoiceRailwayETicketNumber>
<rai:DateOfIssue contextRef="As_Of_2026_01_01">2026-01-01</rai:DateOfIssue>
<rai:DepartureStation contextRef="As_Of_2026_01_01">甲市</rai:DepartureStation>
<rai:DestinationStation contextRef="As_Of_2026_01_01">乙市</rai:DestinationStation>
<rai:TrainNumber contextRef="As_Of_2026_01_01">G0000</rai:TrainNumber>
<rai:Fare contextRef="As_Of_2026_01_01" unitRef="CNY" decimals="2">91.00</rai:Fare>
<rai:TotalAmountExcludingTax contextRef="As_Of_2026_01_01" unitRef="CNY" decimals="2">83.49</rai:TotalAmountExcludingTax>
<rai:TaxAmount contextRef="As_Of_2026_01_01" unitRef="CNY" decimals="2">7.51</rai:TaxAmount>
<rai:NameOfPurchaser contextRef="As_Of_2026_01_01">某某大学</rai:NameOfPurchaser>
<rai:UnifiedSocialCreditCodeOfPurchaser contextRef="As_Of_2026_01_01">12345678901234567X</rai:UnifiedSocialCreditCodeOfPurchaser>
<rai:Remarks contextRef="As_Of_2026_01_01" xsi:nil="true"/>
</xbrl>`;

describe('parseInvoiceXbrlText（OFD 内嵌 XBRL）', () => {
  test('铁路电子客票：号码/日期/购买方/税号/票价 + 区间车次合成单条明细', () => {
    const inv = parseInvoiceXbrlText(RAILWAY_XBRL)!;
    expect(inv).not.toBeNull();
    expect(inv.invoiceNo).toBe('12345678901234567890');
    expect(inv.invoiceDate).toBe('2026-01-01');
    expect(inv.purchaserName).toBe('某某大学');
    expect(inv.purchaserTaxNo).toBe('12345678901234567X');
    expect(inv.totalAmountFen).toBe(9100);
    expect(inv.recognitionSource).toBe('xml'); // XBRL 信任级别同数电票 XML
    expect(inv.seller).toBeNull(); // 铁路票无销售方字段，不臆造
    expect(inv.items).toHaveLength(1);
    expect(inv.items[0]).toMatchObject({
      name: '电子发票（铁路电子客票） 甲市→乙市 G0000',
      quantity: 1,
      amountFen: 9100,
    });
  });

  test('非 XBRL 文档（普通 xml / 空串）→ null', () => {
    expect(parseInvoiceXbrlText('<invoice><EIid>123</EIid></invoice>')).toBeNull();
    expect(parseInvoiceXbrlText('')).toBeNull();
  });

  test('XBRL 但取不到发票号 → null', () => {
    expect(parseInvoiceXbrlText('<xbrl><context id="c"/></xbrl>')).toBeNull();
  });

  test('xsi:nil 自闭合标签按缺失处理（remarks 空不影响整体）', () => {
    const inv = parseInvoiceXbrlText(RAILWAY_XBRL)!;
    expect(inv.invoiceNo).toBeTruthy();
  });
});

describe('classifyInvoiceEntryKind / planInvoiceArchive（归档安全门）', () => {
  test('扩展名分类：大小写不敏感，目录占位归 other，zip 归 container', () => {
    expect(classifyInvoiceEntryKind('a.PDF')).toBe('pdf');
    expect(classifyInvoiceEntryKind('b.Xml')).toBe('xml');
    expect(classifyInvoiceEntryKind('c.ofd')).toBe('ofd');
    expect(classifyInvoiceEntryKind('d.zip')).toBe('container');
    expect(classifyInvoiceEntryKind('dir/')).toBe('other');
    expect(classifyInvoiceEntryKind('截图.jpg')).toBe('other');
  });

  test('发票条目先到先得；非发票/嵌套容器/超限各自 skip 带原因', () => {
    const plan = planInvoiceArchive([
      { name: 'a.xml', size: 100 },
      { name: '截图.jpg', size: 10 },
      { name: 'nested.zip', size: 10 },
      { name: 'big.pdf', size: INVOICE_ARCHIVE_LIMITS.maxSingleUncompressedBytes + 1 },
      { name: 'b.ofd', size: 100 },
    ]);
    expect(plan.map((p) => [p.action, p.reason ?? ''])).toEqual([
      ['parse', ''],
      ['skip', 'type'],
      ['skip', 'nestedContainer'],
      ['skip', 'tooLarge'],
      ['parse', ''],
    ]);
  });

  test('条目数预算耗尽 → quotaEntries；解压总量预算耗尽 → quotaBytes', () => {
    const limits = { ...INVOICE_ARCHIVE_LIMITS, maxEntries: 2, maxTotalUncompressedBytes: 250 };
    const plan = planInvoiceArchive(
      [
        { name: 'a.xml', size: 100 },
        { name: 'b.xml', size: 100 },
        { name: 'c.xml', size: 100 }, // 超条目数
      ],
      limits,
    );
    expect(plan[2]).toMatchObject({ action: 'skip', reason: 'quotaEntries' });

    const plan2 = planInvoiceArchive(
      [
        { name: 'a.xml', size: 100 },
        { name: 'b.xml', size: 100 },
        { name: 'c.xml', size: 100 }, // 超总量 250
      ],
      { ...INVOICE_ARCHIVE_LIMITS, maxTotalUncompressedBytes: 250 },
    );
    expect(plan2[2]).toMatchObject({ action: 'skip', reason: 'quotaBytes' });
  });
});
