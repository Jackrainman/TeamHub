import { describe, expect, test } from 'vitest';
import {
  DEFAULT_REIMBURSE_PROFILE,
  REIMBURSE_EXPORT_COLUMNS,
  ReimburseEntrySchema,
  buildReimburseCsv,
  deriveReimburseExportRow,
  type ReimburseEntry,
} from '@teamhub/hub-contracts';
import {
  localizeReimburseExportRow,
  reimburseExportHeaders,
  suggestReimburseExportFilename,
} from '../src/features/reimburse/reimburse-export';

// 报销全员发票导出的纯函数单测（REIMBURSE-PM-EXPORT）——测逻辑不测 DOM：
// 枚举本地化 / 表头装配 / 文件名建议，与 contracts 共享 derive 走同一条派生链。

/** mock t：原样返回 key，让断言锁定「该字段映射到哪个 i18n key」而不依赖语言包内容。 */
const keyT = (key: string) => key;

function completeEntry(): ReimburseEntry {
  return ReimburseEntrySchema.parse({
    id: 'reimb-1',
    projectId: 'proj-1',
    memberId: 'member-1',
    batchId: 'b-1',
    kind: 'goods',
    invoiceNo: '26337000000651169782',
    invoiceDate: '2026-07-06',
    seller: '杭州洋橙电子商务有限公司',
    purchaserName: '哈尔滨工业大学',
    purchaserTaxNo: '12100000400000456B',
    recognitionSource: 'pdf',
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
    actualItemName: null,
    materials: { paymentShot: true, inspection: true },
    note: '请尽快处理',
    createdAt: '2026-08-01T02:00:00.000Z',
    updatedAt: '2026-08-01T02:00:00.000Z',
  });
}

describe('reimburseExportHeaders：表头列序固定 + 逐列 t()', () => {
  test('覆盖全部 16 列，顺序 = REIMBURSE_EXPORT_COLUMNS', () => {
    const headers = reimburseExportHeaders(keyT);
    expect(Object.keys(headers)).toEqual(REIMBURSE_EXPORT_COLUMNS);
    expect(Object.values(headers)).toEqual(
      REIMBURSE_EXPORT_COLUMNS.map((column) => `reimb.export.col.${column}`),
    );
  });
});

describe('localizeReimburseExportRow：机器值 → 本地化字符串行', () => {
  test('枚举映射到对应 i18n key，非枚举原样透传', () => {
    const row = deriveReimburseExportRow(completeEntry(), DEFAULT_REIMBURSE_PROFILE, {
      resolveMemberName: (id) => (id === 'member-1' ? '张三' : id),
      resolveBatchName: (id) => (id === 'b-1' ? '2026-08 第一批' : id ?? ''),
    });
    const localized = localizeReimburseExportRow(row, keyT);
    expect(localized.kind).toBe('reimb.kind.goods');
    expect(localized.status).toBe('reimb.status.complete');
    expect(localized.purchaserCheck).toBe('reimb.export.check.match');
    expect(localized.bucket).toBe('reimb.export.bucket.eligible');
    expect(localized.reviewReasons).toBe('');
    expect(localized.member).toBe('张三');
    expect(localized.batch).toBe('2026-08 第一批');
    expect(localized.totalYuan).toBe('120.62');
    expect(localized.note).toBe('请尽快处理');
  });

  test('blocked 条目：bucket/status/核对原因都落到对应 key', () => {
    const entry = completeEntry();
    entry.items = [];
    entry.materials = { paymentShot: false, inspection: false };
    const row = deriveReimburseExportRow(entry, DEFAULT_REIMBURSE_PROFILE);
    const localized = localizeReimburseExportRow(row, keyT);
    expect(localized.status).toBe('reimb.status.partial');
    expect(localized.bucket).toBe('reimb.export.bucket.blocked');
    expect(localized.reviewReasons).toContain('reimb.review.itemsMissing');
  });
});

describe('suggestReimburseExportFilename：日期化 CSV 文件名', () => {
  test('基础名随 t + 本地日期 YYYYMMDD', () => {
    const t = (key: string) => (key === 'reimb.export.fileBase' ? '报销全员发票' : key);
    expect(suggestReimburseExportFilename(new Date(2026, 7, 1), t)).toBe(
      '报销全员发票-20260801.csv',
    );
  });
});

describe('完整管线：derive → localize → buildReimburseCsv', () => {
  test('BOM + 表头 16 列 + 本地化数据行', () => {
    const row = deriveReimburseExportRow(completeEntry(), DEFAULT_REIMBURSE_PROFILE);
    const headers = reimburseExportHeaders(keyT);
    const rows = [localizeReimburseExportRow(row, keyT)];
    const csv = buildReimburseCsv(headers, rows);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0].split(',')).toHaveLength(REIMBURSE_EXPORT_COLUMNS.length);
    // 数据行 = 表头列序对齐的 16 个字段。
    expect(lines[1].split(',')).toHaveLength(REIMBURSE_EXPORT_COLUMNS.length);
    expect(lines[1]).toContain('reimb.kind.goods');
    expect(lines[1]).toContain('reimb.status.complete');
    expect(lines[1]).toContain('reimb.export.check.match');
  });
});
