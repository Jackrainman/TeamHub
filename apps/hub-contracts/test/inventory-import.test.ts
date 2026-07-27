import { describe, expect, test } from 'vitest';
import {
  INVENTORY_TEMPLATE_HEADERS,
  InventoryImportReportSchema,
  InventoryImportRowsRequestSchema,
  InventoryPreviewResponseSchema,
  buildInventoryTemplateCsv,
  decodeCsvBytes,
  parseInventoryCsv,
} from '../src/index.js';

/**
 * 库存批量导入契约（INV-BULK-IMPORT 刀⑪）纯解析单测——结构照 roster-import.test.ts：
 * 模板（BOM + 六列表头）、解析边界（引号/空行/末行无换行/阈值可空）、坏行物理行号不中断、
 * preview/JSON 提交/报告三 schema。编码探测已抽 csv-core 两域共用，这里只钉库存侧消费点。
 */
describe('buildInventoryTemplateCsv', () => {
  test('表头 + 示例行：BOM + 六列（件号/名称/类别/单位/总数/低储阈值）+ CRLF', () => {
    const csv = buildInventoryTemplateCsv();
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('件号,名称,类别,单位,总数,低储阈值');
    expect(csv).toContain('GM6020,6020 云台电机,电机,个,6,2');
  });
});

describe('parseInventoryCsv', () => {
  test('正常行：六列全填 + 阈值留空（undefined）+ 物理行号（含表头）', () => {
    const { rows, errors } = parseInventoryCsv(
      '件号,名称,类别,单位,总数,低储阈值\n' +
        'GM6020,6020 云台电机,motor,个,6,2\n' +
        'M4 螺母,M4 螺母,mechanical,个,100,\n',
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      partNumber: 'GM6020',
      name: '6020 云台电机',
      category: 'motor',
      unit: '个',
      totalQuantity: 6,
      lowStockThreshold: 2,
      line: 2,
    });
    expect(rows[1]).toMatchObject({ partNumber: 'M4 螺母', totalQuantity: 100, line: 3 });
    expect(rows[1].lowStockThreshold).toBeUndefined(); // 阈值可空
  });

  test('坏行各档（缺件号/缺名称/总数非数/负数/阈值非数）带物理行号进 errors、不中断整批', () => {
    const { rows, errors } = parseInventoryCsv(
      '件号,名称,类别,单位,总数,低储阈值\n' +
        ',无名件,motor,个,1,\n' + // 行2：缺件号
        'C620,,esc,个,2,\n' + // 行3：缺名称
        'M3508,3508 电机,motor,个,abc,\n' + // 行4：总数非数
        'M2006,2006 电机,motor,个,-1,\n' + // 行5：总数负数
        'GM6020,6020 电机,motor,个,6,x\n' + // 行6：阈值非数
        'M4 螺母,M4 螺母,mechanical,个,100,', // 行7：正常（末行无换行）
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].partNumber).toBe('M4 螺母');
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6]);
    expect(errors[0].reason).toContain('件号');
    expect(errors[1].reason).toContain('名称');
    expect(errors[2].reason).toContain('总数');
    expect(errors[3].reason).toContain('总数');
    expect(errors[4].reason).toContain('低储阈值');
  });

  test('类别/单位为空也报错（PartType schema min1，放行会产出非法行）', () => {
    const { rows, errors } = parseInventoryCsv(
      '件号,名称,类别,单位,总数,低储阈值\nX,某件,,个,1,\nY,某件,motor,,1,\n',
    );
    expect(rows).toEqual([]);
    expect(errors.map((e) => e.line)).toEqual([2, 3]);
    expect(errors[0].reason).toContain('类别');
    expect(errors[1].reason).toContain('单位');
  });

  test('解析边界：引号字段（内部逗号/引号转义）、空行跳过、前导 BOM 剥掉、多余列忽略', () => {
    const { rows, errors } = parseInventoryCsv(
      '﻿件号,名称,类别,单位,总数,低储阈值\r\n' +
        '"GM,6020","""6020"" 云台电机",motor,个,6,2,多余列\r\n' +
        '\r\n' + // 空行跳过
        ',,,,,\r\n', // 全空列跳过
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      partNumber: 'GM,6020',
      name: '"6020" 云台电机',
      totalQuantity: 6,
      lowStockThreshold: 2,
      line: 2,
    });
  });

  test('总数只收非负整数：小数/科学计数法外的怪写法报错；0 与阈值 0 合法', () => {
    const { rows, errors } = parseInventoryCsv(
      '件号,名称,类别,单位,总数,低储阈值\nA,甲,motor,个,1.5,\nB,乙,motor,个,0,0\n',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ partNumber: 'B', totalQuantity: 0, lowStockThreshold: 0 });
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(2);
  });
});

describe('库存导入三 schema（preview / JSON 提交 / 报告）', () => {
  const row = {
    partNumber: 'GM6020',
    name: '6020 云台电机',
    category: 'motor',
    unit: '个',
    totalQuantity: 6,
    line: 2,
  };

  test('InventoryPreviewResponseSchema：rows + failed（阈值可省）', () => {
    const preview = InventoryPreviewResponseSchema.parse({
      rows: [row],
      failed: [{ line: 3, reason: '总数无法识别' }],
    });
    expect(preview.rows[0].lowStockThreshold).toBeUndefined();
    expect(preview.failed[0].line).toBe(3);
  });

  test('InventoryImportRowsRequestSchema：坏行（负总数/空件号）拒绝', () => {
    expect(InventoryImportRowsRequestSchema.safeParse({ rows: [row] }).success).toBe(true);
    expect(
      InventoryImportRowsRequestSchema.safeParse({
        rows: [{ ...row, totalQuantity: -1 }],
      }).success,
    ).toBe(false);
    expect(
      InventoryImportRowsRequestSchema.safeParse({ rows: [{ ...row, partNumber: '' }] }).success,
    ).toBe(false);
  });

  test('InventoryImportReportSchema：三段（created/updated=件号，failed=行号+原因）', () => {
    const report = InventoryImportReportSchema.parse({
      created: ['M4 螺母'],
      updated: ['GM6020'],
      failed: [{ line: 4, reason: '名称为空' }],
    });
    expect(report.created).toEqual(['M4 螺母']);
    expect(report.failed).toHaveLength(1);
  });
});

describe('csv-core 编码探测（库存侧消费点，与名册同一来源）', () => {
  test('GBK 字节（无 BOM）解出中文表头', () => {
    // 行「GM6020,电机,motor,个,6,\r\n」的 GBK 字节（「电机」= B5 E7 BB FA、「个」= B8 F6）。
    const gbk = new Uint8Array([
      0x47, 0x4d, 0x36, 0x30, 0x32, 0x30, 0x2c, 0xb5, 0xe7, 0xbb, 0xfa, 0x2c, 0x6d, 0x6f, 0x74,
      0x6f, 0x72, 0x2c, 0xb8, 0xf6, 0x2c, 0x36, 0x2c, 0x0d, 0x0a,
    ]);
    const text = decodeCsvBytes(gbk);
    expect(text).toContain('电机');
    expect(text).toContain('个');
  });
});
