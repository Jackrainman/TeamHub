import { describe, expect, test } from 'vitest';
import {
  FLEET_TEMPLATE_HEADERS,
  FleetPreviewResponseSchema,
  buildFleetTemplateCsv,
  parseFleetCsv,
} from '../src/index.js';

/**
 * 车队批量导入契约（FLEET-CSV-IMPORT）纯解析单测——结构照 inventory-import.test.ts / roster-import.test.ts：
 * 模板（BOM + 五列表头）、解析边界（编号/状态中文标签映射、可空列默认、坏行物理行号不中断）、预览 schema。
 * 编码探测已抽 csv-core 两域共用（库存侧已钉消费点），这里不重复。
 */
describe('buildFleetTemplateCsv', () => {
  test('表头 + 提示行：BOM + 五列（名称/编号/赛季码/第几代/状态）+ CRLF', () => {
    const csv = buildFleetTemplateCsv();
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('名称,编号,赛季码,第几代,状态');
    expect(csv).toContain('# 编号可选：R1/R2/共用');
  });
});

describe('parseFleetCsv', () => {
  test('正常行：五列全填 + 中文编号/状态映射 + 物理行号（含表头）', () => {
    const { rows, errors } = parseFleetCsv(
      '名称,编号,赛季码,第几代,状态\n' +
        'R1 比赛机器人,R1,27,2,能用\n' +
        '共用备件车,共用,26,1,在修\n',
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      name: 'R1 比赛机器人',
      robotTarget: 'R1',
      season: '27',
      version: 2,
      status: 'available',
      line: 2,
    });
    expect(rows[1]).toMatchObject({
      name: '共用备件车',
      robotTarget: 'shared',
      season: '26',
      version: 1,
      status: 'repair',
      line: 3,
    });
  });

  test('可空列：赛季码/第几代/状态留空 → undefined（批量端点/store 补默认）', () => {
    const { rows, errors } = parseFleetCsv('名称,编号,赛季码,第几代,状态\n裸车,R2,,,\n');
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: '裸车', robotTarget: 'R2' });
    expect(rows[0].season).toBeUndefined();
    expect(rows[0].version).toBeUndefined();
    expect(rows[0].status).toBeUndefined();
  });

  test('坏行各档（缺名称/编号非法/第几代非正整数/状态非法）带物理行号进 errors、不中断整批', () => {
    const { rows, errors } = parseFleetCsv(
      '名称,编号,赛季码,第几代,状态\n' +
        ',R1,27,1,能用\n' + // 行2：缺名称
        '某车,R3,27,1,能用\n' + // 行3：编号非法
        '某车,R1,27,0,能用\n' + // 行4：第几代 0（非正整数）
        '某车,R1,27,1.5,能用\n' + // 行5：第几代小数
        '某车,R1,27,1,爆炸\n' + // 行6：状态非法
        '好车,R2,27,1,退役', // 行7：正常（末行无换行）
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('好车');
    expect(rows[0].status).toBe('retired');
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6]);
    expect(errors[0].reason).toContain('名称');
    expect(errors[1].reason).toContain('编号');
    expect(errors[2].reason).toContain('第几代');
    expect(errors[3].reason).toContain('第几代');
    expect(errors[4].reason).toContain('状态');
  });

  test('解析边界：引号字段（内部逗号）、空行跳过、前导 BOM 剥掉、多余列忽略', () => {
    const { rows, errors } = parseFleetCsv(
      '名称,编号,赛季码,第几代,状态\r\n' +
        '"R1,主力",R1,27,2,能用,多余列\r\n' +
        '\r\n' + // 空行跳过
        ',,,,,\r\n', // 全空列跳过
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'R1,主力', robotTarget: 'R1', version: 2, line: 2 });
  });

  test('状态四档中文标签全映射（能用/在修/退役/停用）', () => {
    const { rows, errors } = parseFleetCsv(
      '名称,编号,赛季码,第几代,状态\n' +
        '甲,R1,,,能用\n' +
        '乙,R1,,,在修\n' +
        '丙,R1,,,退役\n' +
        '丁,R1,,,停用\n',
    );
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.status)).toEqual(['available', 'repair', 'retired', 'down']);
  });
});

describe('车队预览 schema（FleetPreviewResponseSchema）', () => {
  test('rows + failed（可空列省略合法）', () => {
    const preview = FleetPreviewResponseSchema.parse({
      rows: [{ name: 'R1 比赛机器人', robotTarget: 'R1', line: 2 }],
      failed: [{ line: 3, reason: '编号无法识别' }],
    });
    expect(preview.rows[0].season).toBeUndefined();
    expect(preview.failed[0].line).toBe(3);
  });

  test('坏行（空名称/非法编号/负第几代）拒绝', () => {
    expect(
      FleetPreviewResponseSchema.safeParse({
        rows: [{ name: '', robotTarget: 'R1' }],
        failed: [],
      }).success,
    ).toBe(false);
    expect(
      FleetPreviewResponseSchema.safeParse({
        rows: [{ name: '某车', robotTarget: 'R3' }],
        failed: [],
      }).success,
    ).toBe(false);
    expect(
      FleetPreviewResponseSchema.safeParse({
        rows: [{ name: '某车', robotTarget: 'R1', version: -1 }],
        failed: [],
      }).success,
    ).toBe(false);
  });
});
