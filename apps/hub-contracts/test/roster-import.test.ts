import { describe, expect, test } from 'vitest';
import {
  ROSTER_TEMPLATE_HEADERS,
  RosterImportReportSchema,
  buildRosterTemplateCsv,
  decodeRosterBytes,
  parseRosterCsv,
} from '../src/index.js';

/**
 * 名册导入纯层（ROSTER-IMPORT，K8 + ROSTER-CSV-3COL 公测补强刀③）单测：编码探测（UTF-8 BOM /
 * GBK 硬编码字节 / 无法识别）+ CSV 手写解析（引号字段 / 逗号转义 / 空行跳过 / 坏行报告 /
 * 大三默认验收人）。刀③：模板三列（姓名/年级/组），解析器不再产 role（组长走导入后确认页），
 * 验收人沿用年级默认派生。
 */

// contracts 测试 tsconfig types 仅 vitest/globals（无 node types）——TextEncoder 是 Node/浏览器共有全局，
// 运行期恒在，仅补最小 ambient 声明供 typecheck（同 src/roster-import.ts 对 TextDecoder 的处理）。
declare const TextEncoder: { new (): { encode(input?: string): Uint8Array } };
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

// GBK 字节样本（避免依赖 iconv）：硬编码「电控」「视觉」等的 GBK 双字节。
// 电=B5E7 控=BFD8 视=CAD3 觉=BEF5 机=BB FA 械=D0 B5（用可复算的常用字）。
function gbkBytes(): Uint8Array {
  // 表头：姓名,年级,组\r\n  行：李四,大三,电控\r\n（全 GBK 编码）
  // 逐字 GBK：姓=D0D5 名=C3FB ,=2C 年=C4EA 级=BCB6 ,=2C 组=D7E9 \r\n
  //           李=C0EE 四=CBC4 ,=2C 大=B4F3 三=C8FD ,=2C 电=B5E7 控=BFD8 \r\n
  return new Uint8Array([
    0xd0, 0xd5, 0xc3, 0xfb, 0x2c, 0xc4, 0xea, 0xbc, 0xb6, 0x2c, 0xd7, 0xe9, 0x0d, 0x0a,
    0xc0, 0xee, 0xcb, 0xc4, 0x2c, 0xb4, 0xf3, 0xc8, 0xfd, 0x2c, 0xb5, 0xe7, 0xbf, 0xd8, 0x0d,
    0x0a,
  ]);
}

describe('buildRosterTemplateCsv', () => {
  test('带 BOM + CRLF + 三列表头，仅表头行（刀③：去组长/验收人列）', () => {
    const csv = buildRosterTemplateCsv();
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(csv).toBe('﻿姓名,年级,组\r\n');
    expect(ROSTER_TEMPLATE_HEADERS).toEqual(['姓名', '年级', '组']);
  });
});

describe('decodeRosterBytes', () => {
  test('UTF-8 BOM → 剥 BOM 按 UTF-8 解', () => {
    const body = '姓名,年级\r\n王五,大四\r\n';
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8(body)]);
    const text = decodeRosterBytes(bytes);
    expect(text).not.toBeNull();
    expect(text!.charCodeAt(0)).not.toBe(0xfeff); // BOM 已剥
    expect(text).toContain('王五');
  });

  test('无 BOM 合法 UTF-8 → 直接按 UTF-8 解', () => {
    const bytes = utf8('姓名\r\n赵六\r\n');
    expect(decodeRosterBytes(bytes)).toBe('姓名\r\n赵六\r\n');
  });

  test('GBK 字节（无 BOM，UTF-8 解出替换字符）→ 回退 gbk 正确解出中文', () => {
    const text = decodeRosterBytes(gbkBytes());
    expect(text).not.toBeNull();
    expect(text).toContain('姓名');
    expect(text).toContain('李四');
    expect(text).toContain('电控');
    expect(text).not.toContain('�');
  });

  test('两种编码都失败（乱字节）→ null', () => {
    // 单个 0xFF 在 UTF-8 非法、在 GBK 也非法尾随 → 替换字符两处皆现。
    const bytes = new Uint8Array([0x41, 0xff, 0x42]);
    // 0xFF 在 GBK 是非法 lead → 替换字符 → null。
    expect(decodeRosterBytes(bytes)).toBeNull();
  });
});

describe('parseRosterCsv', () => {
  test('基础行：年级映射 + 大三默认验收人（不再产 role）', () => {
    const csv =
      '姓名,年级,组\n' +
      '张三,大一,机械\n' + // 大一 → freshman，验收人默认 false
      '李四,大三,电控\n' + // 大三 → junior；验收人默认 true（auto）
      '王五,研究生,视觉\n'; // 研究生 → graduate；验收人默认 true（auto）
    const { rows, errors } = parseRosterCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      displayName: '张三',
      grade: 'freshman',
      groupName: '机械',
      gateReviewer: false,
      gateReviewerAuto: false,
    });
    expect(rows[1]).toMatchObject({
      displayName: '李四',
      grade: 'junior',
      gateReviewer: true,
      gateReviewerAuto: true,
    });
    expect(rows[2]).toMatchObject({
      displayName: '王五',
      grade: 'graduate',
      gateReviewer: true,
      gateReviewerAuto: true,
    });
    // 行草稿无 role 字段（刀③：导入不写 role，组长走导入后确认页）。
    expect(rows[0]).not.toHaveProperty('role');
  });

  test('旧五列 CSV 向后兼容：多余列被忽略（只读前三列）', () => {
    const csv =
      '姓名,年级,组,组长,验收人\n' +
      '李四,大三,电控,✓,否\n'; // 旧表多出的组长/验收人列忽略——验收人仍按年级默认 true
    const { rows, errors } = parseRosterCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].gateReviewer).toBe(true); // 大三默认派生，旧「否」列不再生效
    expect(rows[0].gateReviewerAuto).toBe(true);
  });

  test('引号字段：内部逗号 / 转义引号 / 引号内换行', () => {
    const csv =
      '姓名,年级,组\n' +
      '"张,三","大二","机械, 组"\n' + // 姓名/组含逗号
      '"李""四""","大三","电控"\n'; // 转义引号
    const { rows, errors } = parseRosterCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0].displayName).toBe('张,三');
    expect(rows[0].groupName).toBe('机械, 组');
    expect(rows[0].grade).toBe('sophomore');
    expect(rows[1].displayName).toBe('李"四"');
    expect(rows[1].gateReviewer).toBe(true); // 大三默认
  });

  test('空行跳过 + 坏行报告（年级非法 / 姓名空 / 组空）不中断整批', () => {
    const csv =
      '姓名,年级,组\n' +
      '\n' + // 空行跳过（不报错）
      '张三,大三,电控\n' + // 行3 正常
      '错误行,大五,机械\n' + // 行4 年级非法
      ',大三,视觉\n' + // 行5 姓名空
      '孤儿,大四,\n'; // 行6 组空
    const { rows, errors } = parseRosterCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].displayName).toBe('张三');
    // 三条坏行报告，行号是物理行（含表头）。
    expect(errors).toHaveLength(3);
    expect(errors.map((e) => e.line)).toEqual([4, 5, 6]);
    expect(errors[0].reason).toContain('年级无法识别');
    expect(errors[1].reason).toContain('姓名');
    expect(errors[2].reason).toContain('组');
  });

  test('末行无换行结尾也解析', () => {
    const csv = '姓名,年级,组\n张三,大三,电控';
    const { rows } = parseRosterCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].displayName).toBe('张三');
  });

  test('前导 BOM 字符被剥（表头行不被误当数据）', () => {
    const csv = '﻿姓名,年级,组\n张三,大三,电控';
    const { rows, errors } = parseRosterCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].displayName).toBe('张三');
  });
});

describe('RosterImportReportSchema', () => {
  test('六段名单事实字段齐全、可 parse', () => {
    const report = RosterImportReportSchema.parse({
      created: ['张三'],
      updated: ['李四'],
      failed: [{ line: 4, reason: '年级无法识别' }],
      missingFromSheet: ['老队员'],
      createdGroups: ['宣传'],
      autoReviewers: ['李四'],
    });
    expect(report.created).toEqual(['张三']);
    expect(report.failed[0].line).toBe(4);
  });
});
