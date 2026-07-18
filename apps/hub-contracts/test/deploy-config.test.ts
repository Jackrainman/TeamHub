import { describe, expect, test } from 'vitest';
import {
  DeployConfigSchema,
  parseDeployConfig,
  SetupInitRequestSchema,
  SetupStateResponseSchema,
  SetupInitResponseSchema,
} from '../src/index.js';

/**
 * 部署配置契约单测（SETUP-WIZARD 刀①，setup-wizard.md §2/§3）：config.json 是模式的唯一真相，
 * server 启动严格解析 → 坏 / 缺字段 / 陌生 schemaVersion 一律 fail-closed（不静默降级）。
 */

const validConfig = {
  schemaVersion: 1,
  dataMode: 'real',
  identityMode: 'identity',
  initializedAt: '2026-07-18T09:30:00.000Z',
};

describe('DeployConfigSchema', () => {
  test('合法 config 解析通过（四字段齐备）', () => {
    const parsed = parseDeployConfig(validConfig);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.dataMode).toBe('real');
    expect(parsed.identityMode).toBe('identity');
    expect(parsed.initializedAt).toBe('2026-07-18T09:30:00.000Z');
  });

  test('demo + anonymous 也合法', () => {
    expect(() =>
      parseDeployConfig({ ...validConfig, dataMode: 'demo', identityMode: 'anonymous' }),
    ).not.toThrow();
  });

  test('schemaVersion 必须字面量 1（陌生版本 fail-closed）', () => {
    expect(() => DeployConfigSchema.parse({ ...validConfig, schemaVersion: 2 })).toThrow();
    expect(() => DeployConfigSchema.parse({ ...validConfig, schemaVersion: '1' })).toThrow();
  });

  test('dataMode / identityMode 枚举外值被拒', () => {
    expect(() => DeployConfigSchema.parse({ ...validConfig, dataMode: 'prod' })).toThrow();
    expect(() =>
      DeployConfigSchema.parse({ ...validConfig, identityMode: 'oauth' }),
    ).toThrow();
  });

  test('缺字段被拒', () => {
    const { dataMode: _drop, ...missing } = validConfig;
    expect(() => DeployConfigSchema.parse(missing)).toThrow();
  });

  test('initializedAt 必须是带时区 ISO 时间戳', () => {
    expect(() =>
      DeployConfigSchema.parse({ ...validConfig, initializedAt: 'not-a-date' }),
    ).toThrow();
    expect(() =>
      DeployConfigSchema.parse({ ...validConfig, initializedAt: '2026-07-18' }),
    ).toThrow();
  });
});

describe('setup 端点契约', () => {
  test('SetupInitRequestSchema 只收 dataMode + identityMode', () => {
    const parsed = SetupInitRequestSchema.parse({
      dataMode: 'demo',
      identityMode: 'anonymous',
    });
    expect(parsed).toEqual({ dataMode: 'demo', identityMode: 'anonymous' });
  });

  test('SetupInitRequestSchema 拒非法枚举', () => {
    expect(() =>
      SetupInitRequestSchema.parse({ dataMode: 'x', identityMode: 'anonymous' }),
    ).toThrow();
  });

  test('SetupStateResponseSchema：initialized + dataDirHasData 两布尔', () => {
    const parsed = SetupStateResponseSchema.parse({
      initialized: false,
      dataDirHasData: true,
    });
    expect(parsed.initialized).toBe(false);
    expect(parsed.dataDirHasData).toBe(true);
  });

  test('SetupInitResponseSchema：restarting 恒 true', () => {
    expect(() => SetupInitResponseSchema.parse({ restarting: true })).not.toThrow();
    expect(() => SetupInitResponseSchema.parse({ restarting: false })).toThrow();
  });
});
