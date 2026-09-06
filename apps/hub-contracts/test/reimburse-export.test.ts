import { describe, expect, test } from 'vitest';

import {
  DEFAULT_REIMBURSE_PROFILE,
  REIMBURSE_EXPORT_COLUMNS,
  ReimburseEntrySchema,
  buildCsv,
  buildReimburseCsv,
  deriveReimburseExportRow,
  escapeCsvCell,
  type ReimburseEntry,
  type ReimburseExportCsvRow,
} from '../src/index.js';

const NOW = '2026-08-01T02:00:00.000Z';

function makeEntry(overrides: Partial<ReimburseEntry> = {}): ReimburseEntry {
  return ReimburseEntrySchema.parse({
    id: 'reimb-1',
    projectId: 'proj-1',
    memberId: 'member-1',
    batchId: null,
    kind: 'goods',
    invoiceNo: null,
    invoiceDate: null,
    seller: null,
    purchaserName: null,
    purchaserTaxNo: null,
    recognitionSource: 'pdf',
    totalAmountFen: 0,
    items: [],
    actualItemName: null,
    materials: { paymentShot: false, inspection: false },
    note: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

/** 一张材料齐、抬头匹配、识别来源 pdf（无人工/OCR 核对原因）的完整发票。 */
function completeEntry(): ReimburseEntry {
  return makeEntry({
    invoiceNo: '26337000000651169782',
    invoiceDate: '2026-07-06',
    seller: '杭州洋橙电子商务有限公司',
    purchaserName: '哈尔滨工业大学',
    purchaserTaxNo: '12100000400000456B',
    totalAmountFen: 12062,
    items: [
      {
        name: '绿联typec拓展坞',
        unit: '件',
        quantity: 1,
        unitPriceFen: 10674,
        amountFen: 12062,
      },
    ],
    materials: { paymentShot: true, inspection: true },
  });
}

function localizedRow(overrides: Partial<ReimburseExportCsvRow> = {}): ReimburseExportCsvRow {
  return {
    filename: 'f',
    member: 'm',
    invoiceNo: 'n',
    invoiceDate: 'd',
    seller: 's',
    purchaserName: 'p',
    purchaserTaxNo: 't',
    kind: 'k',
    totalYuan: '0.00',
    status: 'st',
    purchaserCheck: 'pc',
    reviewReasons: 'rr',
    bucket: 'b',
    batch: '',
    items: 'i',
    note: 'nt',
    ...overrides,
  };
}

describe('deriveReimburseExportRow：单条条目 → 导出行（机器值）', () => {
  test('完整+抬头匹配条目：eligible、无核对原因、文件名/金额/明细正确', () => {
    const row = deriveReimburseExportRow(completeEntry(), DEFAULT_REIMBURSE_PROFILE);
    expect(row.filename).toBe('20260706-杭州洋橙电子商务有限公司-120.62.pdf');
    expect(row.member).toBe('member-1'); // 缺省回退 memberId（I0：人键）
    expect(row.invoiceNo).toBe('26337000000651169782');
    expect(row.invoiceDate).toBe('2026-07-06');
    expect(row.seller).toBe('杭州洋橙电子商务有限公司');
    expect(row.purchaserName).toBe('哈尔滨工业大学');
    expect(row.purchaserTaxNo).toBe('12100000400000456B');
    expect(row.kind).toBe('goods');
    expect(row.totalYuan).toBe('120.62');
    expect(row.status).toBe('complete');
    expect(row.purchaserCheck).toBe('match');
    expect(row.reviewReasons).toEqual([]);
    expect(row.bucket).toBe('eligible');
    expect(row.batch).toBe(''); // 未装批
    expect(row.items).toBe('绿联typec拓展坞×1');
  });

  test('未齐/抬头不符 → blocked；人工识别 → reviewReasons 给结构化原因', () => {
    const entry = completeEntry();
    entry.items = []; // 材料齐但 goods 无明细 → 非 complete
    const row = deriveReimburseExportRow(entry, DEFAULT_REIMBURSE_PROFILE);
    expect(row.status).toBe('partial');
    expect(row.bucket).toBe('blocked');

    const mismatch = makeEntry({
      ...completeEntry(),
      purchaserName: '别的公司',
      recognitionSource: 'manual',
    });
    const row2 = deriveReimburseExportRow(mismatch, DEFAULT_REIMBURSE_PROFILE);
    expect(row2.purchaserCheck).toBe('mismatch');
    expect(row2.bucket).toBe('blocked');
    expect(row2.reviewReasons).toContain('purchaser-mismatch');
    expect(row2.reviewReasons).toContain('manual-entry');
  });

  test('resolveMemberName/resolveBatchName 生效（console 传入名册/批次映射）', () => {
    const row = deriveReimburseExportRow(
      makeEntry({ ...completeEntry(), memberId: 'm-x', batchId: 'b-1' }),
      DEFAULT_REIMBURSE_PROFILE,
      {
        resolveMemberName: (id) => (id === 'm-x' ? '张三' : id),
        resolveBatchName: (id) => (id === 'b-1' ? '2026-08 第一批' : id ?? ''),
      },
    );
    expect(row.member).toBe('张三');
    expect(row.batch).toBe('2026-08 第一批');
  });

  test('空字段条目：占位 filename、空串兜底、draft 状态', () => {
    const row = deriveReimburseExportRow(makeEntry(), DEFAULT_REIMBURSE_PROFILE);
    expect(row.filename).toBe('unknown-date-unknown-seller-0.00.pdf');
    expect(row.invoiceNo).toBe('');
    expect(row.status).toBe('draft');
    expect(row.purchaserCheck).toBe('missing');
    expect(row.bucket).toBe('blocked');
  });
});

describe('buildReimburseCsv：列序固定 + BOM + 转义', () => {
  test('表头顺序 = REIMBURSE_EXPORT_COLUMNS，BOM 开头、CRLF 行尾', () => {
    const headers = Object.fromEntries(
      REIMBURSE_EXPORT_COLUMNS.map((column, index) => [column, `${column}-h${index}`]),
    ) as ReimburseExportCsvRow;
    const csv = buildReimburseCsv(headers, []);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines).toHaveLength(1);
    expect(lines[0].split(',')).toEqual(REIMBURSE_EXPORT_COLUMNS.map((c) => `${c}-h${REIMBURSE_EXPORT_COLUMNS.indexOf(c)}`));
  });

  test('行内含逗号/引号/换行的单元格被正确转义', () => {
    const headers = Object.fromEntries(
      REIMBURSE_EXPORT_COLUMNS.map((column) => [column, column]),
    ) as ReimburseExportCsvRow;
    const row = localizedRow({ seller: '甲,乙', note: '说"你好"\n第二行' });
    const csv = buildReimburseCsv(headers, [row]);
    const lines = csv.slice(1).split('\r\n');
    expect(lines).toHaveLength(2);
    // 列序固定 REIMBURSE_EXPORT_COLUMNS：seller 列含逗号、note 列含引号+换行，均整格双引号包裹、内部引号翻倍。
    expect(lines[1]).toBe(
      'f,m,n,d,"甲,乙",p,t,k,0.00,st,pc,rr,b,,i,"说""你好""\n第二行"',
    );
  });
});

describe('csv-core buildCsv/escapeCsvCell：通用导出序列化', () => {
  test('headers + 多行，BOM 与 CRLF', () => {
    const csv = buildCsv(['a', 'b'], [['1', '2'], ['3', '4']]);
    expect(csv).toBe('\uFEFFa,b\r\n1,2\r\n3,4');
  });

  test('escapeCsvCell：纯文本原样，含分隔符/引号/换行才包裹', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(escapeCsvCell('with,comma')).toBe('"with,comma"');
    expect(escapeCsvCell('with"quote')).toBe('"with""quote"');
    expect(escapeCsvCell('line\nbreak')).toBe('"line\nbreak"');
  });
});
