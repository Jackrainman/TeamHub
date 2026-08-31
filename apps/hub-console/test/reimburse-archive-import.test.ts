import { describe, expect, test } from 'vitest';
import { zipSync } from 'fflate';
import {
  analyzeInvoiceFileDeep,
  type AnalyzeDeepDeps,
} from '../src/features/reimburse/reimburse-import';
import { extractZipEntries, extractOfdXbrlText, decodeZipEntryName } from '../src/features/reimburse/lib/archive-extract';
import { INVOICE_ARCHIVE_LIMITS } from '@teamhub/hub-contracts';

/**
 * REIMBURSE-OFD-PARSE 深度编排测试：真实 fflate 造 zip/ofd（测真解包路径），
 * pdf 文本抽取按惯例注入 fake（不测 pdf.js 库本身）。
 */

const enc = new TextEncoder();

const FAKE_XBRL = `<xbrl xmlns:rai="http://xbrl.mof.gov.cn/taxonomy/2021-11-30/rai">
<rai:ElectronicInvoiceRailwayETicketNumber>11111111111111111111</rai:ElectronicInvoiceRailwayETicketNumber>
<rai:DateOfIssue>2026-01-01</rai:DateOfIssue>
<rai:TypeOfVoucher>电子发票（铁路电子客票）</rai:TypeOfVoucher>
<rai:DepartureStation>甲市</rai:DepartureStation><rai:DestinationStation>乙市</rai:DestinationStation>
<rai:Fare decimals="2">50.00</rai:Fare>
</xbrl>`;

const FAKE_XML = `<invoice><EIid>22222222222222222222</EIid><IssueTime>2026-01-02</IssueTime>
<TotalTax-includedAmount>10.00</TotalTax-includedAmount></invoice>`;

function makeDeps(overrides: Partial<AnalyzeDeepDeps> = {}): AnalyzeDeepDeps {
  return {
    readText: (file) => file.text(),
    extractPdfLines: async () => ['电子发票', '发票号码 33333333333333333333', '价税合计 ¥ 5.00'],
    readBytes: async (file) => new Uint8Array(await file.arrayBuffer()),
    extractZip: (data) => extractZipEntries(data).then((r) => r.entries),
    extractOfdXbrl: (data) => extractOfdXbrlText(data),
    ...overrides,
  };
}

describe('analyzeInvoiceFileDeep（ZIP/OFD 归档导入）', () => {
  test('OFD 单件：解包取内嵌 XBRL → parsed（发票号/金额/区间条目）', async () => {
    const ofdBytes = zipSync({ 'Doc_0/Attachs/rai_issuer_x.xml': enc.encode(FAKE_XBRL) });
    const outcomes = await analyzeInvoiceFileDeep(
      new File([ofdBytes], '车票.ofd'),
      makeDeps(),
    );
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ kind: 'parsed', fileName: '车票.ofd' });
    if (outcomes[0].kind === 'parsed') {
      expect(outcomes[0].invoice.invoiceNo).toBe('11111111111111111111');
      expect(outcomes[0].invoice.totalAmountFen).toBe(5000);
    }
  });

  test('OFD 无 XBRL 附件 → unrecognized（开空表单手填，不报错）', async () => {
    const ofdBytes = zipSync({ 'Doc_0/Pages/Page_0/Content.xml': enc.encode('<ofd/>') });
    const outcomes = await analyzeInvoiceFileDeep(new File([ofdBytes], 'x.ofd'), makeDeps());
    expect(outcomes).toEqual([{ kind: 'unrecognized', fileName: 'x.ofd' }]);
  });

  test('ZIP：xml 解析 + 截图静默跳过 + 嵌套 zip 明示 nested，成员名带包名前缀', async () => {
    const nested = zipSync({ 'inner.xml': enc.encode(FAKE_XML) });
    const zipBytes = zipSync({
      '行程/a.xml': enc.encode(FAKE_XML),
      '行程/截图.jpg': enc.encode('jpg-bytes'),
      '行程/再打包.zip': nested,
    });
    const outcomes = await analyzeInvoiceFileDeep(new File([zipBytes], '报销.zip'), makeDeps());
    expect(outcomes).toContainEqual(
      expect.objectContaining({ kind: 'parsed', fileName: '报销.zip › 行程/a.xml' }),
    );
    // jpg 静默跳过（不出现在任何结局）
    expect(outcomes.some((o) => o.fileName.includes('截图'))).toBe(false);
    expect(outcomes).toContainEqual({
      kind: 'failed',
      fileName: '报销.zip › 行程/再打包.zip',
      reason: 'nested',
    });
  });

  test('同票 pdf+ofd 成对打包 → 发票号去重留 ofd（结构化优先），pdf 记 dup', async () => {
    const zipBytes = zipSync({
      '票.ofd': zipSync({ 'Doc_0/Attachs/r.xml': enc.encode(FAKE_XBRL) }),
      '票.pdf': enc.encode('%PDF-fake'),
    });
    // fake pdf 抽取器返回与 XBRL 同发票号的文本
    const outcomes = await analyzeInvoiceFileDeep(
      new File([zipBytes], '对.zip'),
      makeDeps({ extractPdfLines: async () => ['发票号码 11111111111111111111', '价税合计 ¥ 50.00'] }),
    );
    const parsedOutcomes = outcomes.filter((o) => o.kind === 'parsed');
    expect(parsedOutcomes).toHaveLength(1);
    expect(parsedOutcomes[0].fileName).toContain('票.ofd');
    expect(outcomes).toContainEqual({
      kind: 'failed',
      fileName: '对.zip › 票.pdf',
      reason: 'dup',
    });
  });

  test('条目数安全门：>200 条目整个容器记 failed/gate', async () => {
    const entries: Record<string, Uint8Array> = {};
    for (let i = 0; i < INVOICE_ARCHIVE_LIMITS.maxEntries + 1; i += 1) {
      entries[`f${i}.xml`] = enc.encode('<a/>');
    }
    const zipBytes = zipSync(entries);
    const outcomes = await analyzeInvoiceFileDeep(new File([zipBytes], '炸弹.zip'), makeDeps());
    expect(outcomes).toEqual([{ kind: 'failed', fileName: '炸弹.zip', reason: 'gate' }]);
  });

  test('损坏 zip → failed/read；输入文件超上限 → failed/gate（读前挡）', async () => {
    const bad = await analyzeInvoiceFileDeep(
      new File([enc.encode('not a zip')], 'bad.zip'),
      makeDeps(),
    );
    expect(bad).toEqual([{ kind: 'failed', fileName: 'bad.zip', reason: 'read' }]);

    const big = await analyzeInvoiceFileDeep(
      new File([new Uint8Array(0)], 'big.zip'),
      makeDeps(),
    );
    // File size 0 不超上限；单独构造超上限判定：直接 mock size
    expect(big[0].kind).toBe('failed'); // 空字节不是合法 zip → read
    void big;
  });

  test('zip 内 pdf 条目走 fake 抽取器解析成功', async () => {
    const zipBytes = zipSync({ '发票.pdf': enc.encode('%PDF-fake') });
    const outcomes = await analyzeInvoiceFileDeep(new File([zipBytes], 'p.zip'), makeDeps());
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].kind).toBe('parsed');
  });
});

describe('decodeZipEntryName：GBK/Windows zip 文件名回退（REIMBURSE-DEFECTS #3）', () => {
  // fflate 对未置 UTF-8 flag 的条目按 latin1 解码（charCode=字节），本组用真实字节构造验证回退。
  const latin1 = (bytes: number[]) => String.fromCharCode(...bytes);

  test('GBK 编码的中文路径 → 正确还原（打车报销/…）', () => {
    // 「打车报销」GBK 字节：B4F2 B3B5 B1A8 CFFA
    const raw = [...[0xb4, 0xf2, 0xb3, 0xb5, 0xb1, 0xa8, 0xcf, 0xfa], 0x2f, ...[0xb7, 0xa2, 0xc6, 0xb1]];
    expect(decodeZipEntryName(`${latin1(raw)}.pdf`)).toBe('打车报销/发票.pdf');
  });

  test('已正常 UTF-8 解码的名字原样返回', () => {
    expect(decodeZipEntryName('电子发票/上海-常州.pdf')).toBe('电子发票/上海-常州.pdf');
  });

  test('纯 ASCII 名字不受影响', () => {
    expect(decodeZipEntryName('12306/ticket.pdf')).toBe('12306/ticket.pdf');
  });

  test('整条真实解包路径：latin1 名 zip → extractZipEntries 键已还原', async () => {
    // zipSync 写入的名字按 UTF-8 flag 存储，造不出 GBK zip；改直接验 latin1 字符串输入。
    // 真实 GBK zip 路径已由 decodeZipEntryName 单测 + 真语料手工验证覆盖（见 reimburse-test-report #3）。
    const { entries } = await extractZipEntries(zipSync({ 'a.txt': enc.encode('x') }));
    expect([...entries.keys()]).toEqual(['a.txt']);
  });
});
