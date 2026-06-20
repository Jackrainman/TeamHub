import { describe, expect, test } from 'vitest';
import {
  CreateResourceRequestSchema,
  UpdateResourceStatusRequestSchema,
  deriveDisplayCode,
} from '../src/index.js';

describe('CreateResourceRequestSchema（R3 建车 / D-072 §3.2）', () => {
  const valid = {
    projectId: 'proj-1',
    name: 'R2 比赛车',
    kind: 'robot' as const,
    robotTarget: 'R2' as const,
  };

  test('最小必填（season/version 缺省）即合法', () => {
    expect(() => CreateResourceRequestSchema.parse(valid)).not.toThrow();
  });

  test('带 season/version 合法', () => {
    expect(() =>
      CreateResourceRequestSchema.parse({ ...valid, season: '26', version: 2 }),
    ).not.toThrow();
  });

  test('缺 name → 拒', () => {
    const { name, ...rest } = valid;
    expect(() => CreateResourceRequestSchema.parse(rest)).toThrow();
  });
  test('空 name → 拒', () => {
    expect(() =>
      CreateResourceRequestSchema.parse({ ...valid, name: '' }),
    ).toThrow();
  });

  test('缺 kind → 拒', () => {
    const { kind, ...rest } = valid;
    expect(() => CreateResourceRequestSchema.parse(rest)).toThrow();
  });
  test('非法 kind → 拒', () => {
    expect(() =>
      CreateResourceRequestSchema.parse({ ...valid, kind: 'spaceship' }),
    ).toThrow();
  });

  test('缺 robotTarget → 拒', () => {
    const { robotTarget, ...rest } = valid;
    expect(() => CreateResourceRequestSchema.parse(rest)).toThrow();
  });
  test('非法 robotTarget → 拒', () => {
    expect(() =>
      CreateResourceRequestSchema.parse({ ...valid, robotTarget: 'R9' }),
    ).toThrow();
  });

  test('displayCode 禁手写 → 不在请求 schema 里（strip 掉，不报错也不留）', () => {
    const parsed = CreateResourceRequestSchema.parse({
      ...valid,
      displayCode: '26R2-手写',
    });
    expect('displayCode' in parsed).toBe(false);
  });

  test('非正 version（0 / 负 / 小数）→ 拒', () => {
    for (const version of [0, -1, 1.5]) {
      expect(() =>
        CreateResourceRequestSchema.parse({ ...valid, version }),
      ).toThrow();
    }
  });
});

describe('UpdateResourceStatusRequestSchema（R3 改状态 / D-072 §3.3，退役=迁移非删除）', () => {
  test('退役 retired 合法（statusReason 可省）', () => {
    expect(() =>
      UpdateResourceStatusRequestSchema.parse({ status: 'retired' }),
    ).not.toThrow();
  });
  test('维修 repair + statusReason 合法', () => {
    expect(() =>
      UpdateResourceStatusRequestSchema.parse({
        status: 'repair',
        statusReason: '撞坏底盘',
      }),
    ).not.toThrow();
  });
  test('statusReason 显式 null（清空）合法', () => {
    expect(() =>
      UpdateResourceStatusRequestSchema.parse({
        status: 'available',
        statusReason: null,
      }),
    ).not.toThrow();
  });
  test('拆解 disassembling 合法', () => {
    expect(() =>
      UpdateResourceStatusRequestSchema.parse({ status: 'disassembling' }),
    ).not.toThrow();
  });

  test('非法 status → 拒', () => {
    expect(() =>
      UpdateResourceStatusRequestSchema.parse({ status: 'exploded' }),
    ).toThrow();
  });
  test('缺 status → 拒', () => {
    expect(() => UpdateResourceStatusRequestSchema.parse({})).toThrow();
  });
  test('空串 statusReason → 拒（min(1)）', () => {
    expect(() =>
      UpdateResourceStatusRequestSchema.parse({
        status: 'repair',
        statusReason: '',
      }),
    ).toThrow();
  });
});

describe('deriveDisplayCode 覆盖 26R2 / 26R2-v2（禁手写派生）', () => {
  test('26R2（version 默认 1，不显 -vN）', () => {
    expect(deriveDisplayCode('26', 'R2')).toBe('26R2');
    expect(deriveDisplayCode('26', 'R2', 1)).toBe('26R2');
  });
  test('26R2-v2（第二代整车显 -v2）', () => {
    expect(deriveDisplayCode('26', 'R2', 2)).toBe('26R2-v2');
  });
});
