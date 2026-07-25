import { describe, expect, test } from 'vitest';
import {
  HermesInboundRequestSchema,
  HermesInboundResponseSchema,
  HermesInvQueryArgsSchema,
  HermesInvRecordArgsSchema,
  parseHermesText,
} from '../src/hermes';

describe('parseHermesText: inv-record 入库', () => {
  test('新到了5个3508', () => {
    expect(parseHermesText('新到了5个3508')).toEqual({
      command: 'inv-record',
      args: { name: '3508', action: 'add', quantity: 5 },
    });
  });

  test('入库 电容 x10 → 匹配 "入库" 前缀', () => {
    expect(parseHermesText('入库了10个电容')).toEqual({
      command: 'inv-record',
      args: { name: '电容', action: 'add', quantity: 10 },
    });
  });

  test('3508 到了5个（后缀模式）', () => {
    expect(parseHermesText('3508电机 到了5个')).toEqual({
      command: 'inv-record',
      args: { name: '3508电机', action: 'add', quantity: 5 },
    });
  });
});

describe('parseHermesText: inv-record 损耗', () => {
  test('3508烧了一个（无显式数字 → 1）', () => {
    expect(parseHermesText('3508烧了')).toEqual({
      command: 'inv-record',
      args: { name: '3508', action: 'subtract', quantity: 1 },
    });
  });

  test('报废2个电容', () => {
    expect(parseHermesText('报废2个电容')).toEqual({
      command: 'inv-record',
      args: { name: '电容', action: 'subtract', quantity: 2 },
    });
  });

  test('3508电机 坏了 3 个（后缀模式）', () => {
    expect(parseHermesText('3508电机 坏了3个')).toEqual({
      command: 'inv-record',
      args: { name: '3508电机', action: 'subtract', quantity: 3 },
    });
  });
});

describe('parseHermesText: inv-record 调拨', () => {
  test('把电容从R1拆到R2', () => {
    expect(parseHermesText('把电容从R1拆到R2')).toEqual({
      command: 'inv-record',
      args: { name: '电容', action: 'transfer', quantity: 1, from: 'R1', to: 'R2' },
    });
  });

  test('3508从R2移到共用', () => {
    expect(parseHermesText('3508从R2移到共用')).toEqual({
      command: 'inv-record',
      args: { name: '3508', action: 'transfer', quantity: 1, from: 'R2', to: '共用' },
    });
  });
});

describe('parseHermesText: inv-query', () => {
  test('3508还有几个', () => {
    expect(parseHermesText('3508还有几个')).toEqual({
      command: 'inv-query',
      args: { name: '3508' },
    });
  });

  test('电容 库存', () => {
    expect(parseHermesText('电容 库存')).toEqual({
      command: 'inv-query',
      args: { name: '电容' },
    });
  });

  test('查 3508', () => {
    expect(parseHermesText('查 3508')).toEqual({
      command: 'inv-query',
      args: { name: '3508' },
    });
  });

  test('R1上装了什么', () => {
    expect(parseHermesText('R1上装了什么')).toEqual({
      command: 'inv-query',
      args: { robot: 'R1' },
    });
  });

  test('电控组有什么件', () => {
    expect(parseHermesText('电控组有什么件')).toEqual({
      command: 'inv-query',
      args: { category: '电控' },
    });
  });
});

describe('parseHermesText: 无法匹配', () => {
  test('完全无关文本 → null', () => {
    expect(parseHermesText('今天天气不错')).toBeNull();
  });

  test('空字符串 → null', () => {
    expect(parseHermesText('')).toBeNull();
  });
});

describe('Hermes schemas', () => {
  test('HermesInboundRequestSchema: 结构化请求合法', () => {
    const r = HermesInboundRequestSchema.safeParse({
      command: 'inv-query',
      args: { name: '3508' },
    });
    expect(r.success).toBe(true);
  });

  test('HermesInboundRequestSchema: 文本请求合法', () => {
    const r = HermesInboundRequestSchema.safeParse({ text: '3508还有几个' });
    expect(r.success).toBe(true);
  });

  test('HermesInboundRequestSchema: 空对象拒绝', () => {
    expect(HermesInboundRequestSchema.safeParse({}).success).toBe(false);
  });

  test('HermesInboundResponseSchema: {ok, text} 合法', () => {
    const r = HermesInboundResponseSchema.safeParse({ ok: true, text: '结果' });
    expect(r.success).toBe(true);
  });

  test('HermesInvQueryArgsSchema: 至少一个字段', () => {
    expect(HermesInvQueryArgsSchema.safeParse({}).success).toBe(false);
    expect(HermesInvQueryArgsSchema.safeParse({ name: '3508' }).success).toBe(true);
  });

  test('HermesInvRecordArgsSchema: transfer 需要 from+to', () => {
    expect(
      HermesInvRecordArgsSchema.safeParse({
        name: '3508',
        action: 'transfer',
        quantity: 1,
      }).success,
    ).toBe(false);
    expect(
      HermesInvRecordArgsSchema.safeParse({
        name: '3508',
        action: 'transfer',
        quantity: 1,
        from: 'R1',
        to: 'R2',
      }).success,
    ).toBe(true);
  });

  test('HermesInvRecordArgsSchema: quantity 须正整数', () => {
    expect(
      HermesInvRecordArgsSchema.safeParse({
        name: '3508',
        action: 'add',
        quantity: 0,
      }).success,
    ).toBe(false);
    expect(
      HermesInvRecordArgsSchema.safeParse({
        name: '3508',
        action: 'add',
        quantity: -1,
      }).success,
    ).toBe(false);
  });
});
