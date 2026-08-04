import { describe, expect, test } from 'vitest';
import { suggestPartTypeMatch } from '../src/shared/lib/part-match';

// suggestPartTypeMatch 单测（REIMBURSE-PROC 阶段 5）——「测逻辑不测 DOM」，候选用最小形状字面量。

const PARTS = [
  { partNumber: 'GM6020', name: 'GM6020 云台电机' },
  { partNumber: 'M3508', name: 'M3508 减速电机' },
  { partNumber: 'C620', name: 'C620 电调' },
  { partNumber: 'M4-hex', name: 'M4 内六角螺丝' },
];

describe('suggestPartTypeMatch：品名 → 已有件候选', () => {
  test('件号全等排最前（品名就是件号）', () => {
    const hits = suggestPartTypeMatch('gm6020', PARTS);
    expect(hits[0].partNumber).toBe('GM6020');
  });

  test('名称互为子串命中（品名带空格修饰语）', () => {
    const hits = suggestPartTypeMatch('6020 云台电机', PARTS);
    expect(hits.map((h) => h.partNumber)).toContain('GM6020');
    expect(hits[0].partNumber).toBe('GM6020');
  });

  test('空白拆词兜底：词被件号包含即入候选', () => {
    const hits = suggestPartTypeMatch('M3508 电机 一对', PARTS);
    expect(hits[0].partNumber).toBe('M3508');
  });

  test('全不相关 → 空候选（走新建件路径）', () => {
    expect(suggestPartTypeMatch('快递纸箱', PARTS)).toEqual([]);
    expect(suggestPartTypeMatch('   ', PARTS)).toEqual([]);
  });

  test('得分降序 + 同分按件号字典序（确定性）', () => {
    const ties = [
      { partNumber: 'B-100', name: '垫片' },
      { partNumber: 'A-100', name: '垫片' },
    ];
    const hits = suggestPartTypeMatch('垫片', ties);
    expect(hits.map((h) => h.partNumber)).toEqual(['A-100', 'B-100']);
  });

  test('单字符词不参与拆词匹配（防噪声）', () => {
    const parts = [{ partNumber: 'M4-hex', name: 'M4 内六角螺丝' }];
    // 「4」单字符被件号包含，但长度 <2 不计分；名称子串「内六角螺丝」才是真正的命中。
    const hits = suggestPartTypeMatch('内六角螺丝 4', parts);
    expect(hits[0].partNumber).toBe('M4-hex');
    expect(suggestPartTypeMatch('4', parts)).toEqual([]);
  });
});
