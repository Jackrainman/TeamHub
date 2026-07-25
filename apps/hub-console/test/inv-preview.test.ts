import { describe, expect, test } from 'vitest';
import {
  InventoryImportRowsRequestSchema,
  type InventoryImportRow,
} from '@teamhub/hub-contracts';
import {
  buildInvImportRows,
  invEditRowsValid,
  removeInvPreviewRow,
  setInvPreviewRowField,
  toInvEditRows,
  type InvEditRow,
} from '../src/features/inv/InvPreviewTable';
import { translations, type TranslationKey } from '../src/i18n/translations';

/**
 * 库存导入预览表（INV-BULK-IMPORT 刀⑪）纯数据单测——不测 DOM/RTL（「测逻辑不测 DOM」风格同
 * roster-preview.test.ts）：编辑行转换（数值↔字符串、阈值可空）、行编辑 helper、可提交判定边界、
 * 提交行过服务端同 schema、新增 i18n 键 zh/en 双语齐全。
 */

const SERVER_ROW: InventoryImportRow = {
  partNumber: 'GM6020',
  name: '6020 云台电机',
  category: 'motor',
  unit: '个',
  totalQuantity: 6,
  lowStockThreshold: 2,
  line: 2,
};

function editRow(over: Partial<InvEditRow> = {}): InvEditRow {
  return {
    partNumber: 'GM6020',
    name: '6020 云台电机',
    category: 'motor',
    unit: '个',
    totalQuantity: '6',
    lowStockThreshold: '2',
    line: 2,
    ...over,
  };
}

describe('inv-preview（刀⑪）：编辑行转换', () => {
  test('server 行 → 编辑行：数值转字符串；阈值 undefined → 空串（可空语义不丢）', () => {
    const [withThreshold, without] = toInvEditRows([
      SERVER_ROW,
      { ...SERVER_ROW, partNumber: 'M4x10', lowStockThreshold: undefined },
    ]);
    expect(withThreshold.totalQuantity).toBe('6');
    expect(withThreshold.lowStockThreshold).toBe('2');
    expect(without.lowStockThreshold).toBe('');
  });

  test('编辑行 → 提交行：trim + parse；阈值空串 → undefined；全行过服务端同 schema', () => {
    const rows = buildInvImportRows([
      editRow({ name: '  6020 电机  ', lowStockThreshold: '' }),
      editRow({ partNumber: 'M4x10', totalQuantity: '200', lowStockThreshold: '50' }),
    ]);
    expect(rows[0]).toMatchObject({ name: '6020 电机', lowStockThreshold: undefined });
    expect(rows[1]).toMatchObject({ totalQuantity: 200, lowStockThreshold: 50 });
    expect(InventoryImportRowsRequestSchema.safeParse({ rows }).success).toBe(true);
  });
});

describe('inv-preview（刀⑪）：行编辑 helper', () => {
  test('setInvPreviewRowField 只改目标行目标字段（不可变）', () => {
    const rows = [editRow(), editRow({ partNumber: 'M4x10' })];
    const next = setInvPreviewRowField(rows, 1, 'name', 'M4 螺丝');
    expect(next[1].name).toBe('M4 螺丝');
    expect(next[0].name).toBe('6020 云台电机');
    expect(rows[1].name).toBe('6020 云台电机'); // 原数组不动
  });

  test('removeInvPreviewRow 删整行（操作者主动剔除，区别于解析坏行）', () => {
    const rows = [editRow(), editRow({ partNumber: 'M4x10' })];
    const next = removeInvPreviewRow(rows, 0);
    expect(next).toHaveLength(1);
    expect(next[0].partNumber).toBe('M4x10');
  });
});

describe('inv-preview（刀⑪）：可提交判定边界', () => {
  test('空表 / 必填字段空 / 总数非非负整数 / 阈值非数 → 不可提交', () => {
    expect(invEditRowsValid([])).toBe(false);
    expect(invEditRowsValid([editRow({ name: '  ' })])).toBe(false);
    expect(invEditRowsValid([editRow({ category: '' })])).toBe(false);
    expect(invEditRowsValid([editRow({ unit: '' })])).toBe(false);
    expect(invEditRowsValid([editRow({ totalQuantity: '' })])).toBe(false);
    expect(invEditRowsValid([editRow({ totalQuantity: 'abc' })])).toBe(false);
    expect(invEditRowsValid([editRow({ totalQuantity: '-1' })])).toBe(false);
    expect(invEditRowsValid([editRow({ totalQuantity: '1.5' })])).toBe(false);
    expect(invEditRowsValid([editRow({ lowStockThreshold: 'x' })])).toBe(false);
  });

  test('正常行 / 阈值留空 / 0 与阈值 0 → 可提交', () => {
    expect(invEditRowsValid([editRow()])).toBe(true);
    expect(invEditRowsValid([editRow({ lowStockThreshold: '' })])).toBe(true);
    expect(invEditRowsValid([editRow({ totalQuantity: '0', lowStockThreshold: '0' })])).toBe(true);
  });
});

describe('inv-preview（刀⑪）：i18n 双语齐全', () => {
  test('inv.import.* + gate.inv.* + gate.step.inventory 全键 zh/en 都在', () => {
    const keys: TranslationKey[] = [
      'inv.import.title',
      'inv.import.desc',
      'inv.import.downloadTemplate',
      'inv.import.upload',
      'inv.import.importing',
      'inv.import.error',
      'inv.import.preview.hint',
      'inv.import.preview.failed',
      'inv.import.preview.failedRow',
      'inv.import.preview.colPartNumber',
      'inv.import.preview.colName',
      'inv.import.preview.colCategory',
      'inv.import.preview.colUnit',
      'inv.import.preview.colTotal',
      'inv.import.preview.colThreshold',
      'inv.import.preview.colActions',
      'inv.import.preview.removeRow',
      'inv.import.preview.confirm',
      'inv.import.preview.cancel',
      'inv.import.preview.empty',
      'inv.import.report.title',
      'inv.import.report.failed',
      'inv.import.report.created',
      'inv.import.report.updated',
      'inv.import.report.empty',
      'gate.step.inventory',
      'gate.inv.desc',
      'gate.inv.skip',
      'gate.inv.next',
    ];
    for (const key of keys) {
      expect(translations.zh[key], `zh ${key}`).toBeTruthy();
      expect(translations.en[key], `en ${key}`).toBeTruthy();
    }
  });

  test('向导步序号锚点：库存 = ⑤/(5)，完成 = ⑥/(6)（fleet ④ 与 done 之间插入）', () => {
    expect(translations.zh['gate.step.inventory']).toContain('⑤');
    expect(translations.en['gate.step.inventory']).toContain('(5)');
    expect(translations.zh['gate.done.title']).toContain('⑥');
    expect(translations.en['gate.done.title']).toContain('(6)');
  });
});
