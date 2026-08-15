import { describe, expect, test } from 'vitest';
import {
  AppSettingsSchema,
  SetupConfigRequestSchema,
  SetupConfigResponseSchema,
  SetupGraduateResponseSchema,
  SetupInitRequestSchema,
  SetupInitResponseSchema,
  SetupStateResponseSchema,
  parseAppSettings,
} from '../src/index.js';

const validSettings = {
  schemaVersion: 1,
  dataMode: 'real',
  identityMode: 'identity',
  verticalId: 'robotics',
  enabledModules: ['system', 'pm-core'],
  initializedAt: '2026-07-18T09:30:00.000Z',
  updatedAt: '2026-07-18T09:30:00.000Z',
};

describe('AppSettingsSchema', () => {
  test('严格解析完整 app_settings 快照', () => {
    expect(parseAppSettings(validSettings)).toEqual(validSettings);
  });

  test('拒绝缺字段、陌生字段与陌生 schemaVersion', () => {
    const { updatedAt: _drop, ...missing } = validSettings;
    expect(() => AppSettingsSchema.parse(missing)).toThrow();
    expect(() => AppSettingsSchema.parse({ ...validSettings, extra: true })).toThrow();
    expect(() => AppSettingsSchema.parse({ ...validSettings, schemaVersion: 2 })).toThrow();
  });

  test('拒绝陌生模式、垂直包与非法时间戳', () => {
    expect(() => AppSettingsSchema.parse({ ...validSettings, dataMode: 'prod' })).toThrow();
    expect(() => AppSettingsSchema.parse({ ...validSettings, identityMode: 'oauth' })).toThrow();
    expect(() => AppSettingsSchema.parse({ ...validSettings, verticalId: 'generic' })).toThrow();
    expect(() => AppSettingsSchema.parse({ ...validSettings, updatedAt: '2026-07-18' })).toThrow();
  });

  test('enabledModules 拒绝未知或重复 ModuleId', () => {
    expect(() =>
      AppSettingsSchema.parse({ ...validSettings, enabledModules: ['system', 'unknown'] }),
    ).toThrow();
    expect(() =>
      AppSettingsSchema.parse({ ...validSettings, enabledModules: ['system', 'system'] }),
    ).toThrow();
  });
});

describe('setup 端点契约', () => {
  test('init request 只保留 dataMode + identityMode 两个选择', () => {
    const request = { dataMode: 'demo', identityMode: 'anonymous' };
    expect(SetupInitRequestSchema.parse(request)).toEqual(request);
    expect(() => SetupInitRequestSchema.parse({ ...request, verticalId: 'robotics' })).toThrow();
  });

  test.each(['empty', 'unclaimed'] as const)(
    '未初始化状态支持 databaseState=%s',
    (databaseState) => {
      expect(SetupStateResponseSchema.parse({ initialized: false, databaseState })).toEqual({
        initialized: false,
        databaseState,
      });
    },
  );

  test('已初始化状态必须返回 settings，且不能混入 databaseState', () => {
    expect(
      SetupStateResponseSchema.parse({ initialized: true, settings: validSettings }),
    ).toEqual({ initialized: true, settings: validSettings });
    expect(() => SetupStateResponseSchema.parse({ initialized: true })).toThrow();
    expect(() =>
      SetupStateResponseSchema.parse({
        initialized: true,
        settings: validSettings,
        databaseState: 'empty',
      }),
    ).toThrow();
  });

  test('未初始化状态拒绝旧 dataDirHasData 和未知 databaseState', () => {
    expect(() =>
      SetupStateResponseSchema.parse({ initialized: false, dataDirHasData: false }),
    ).toThrow();
    expect(() =>
      SetupStateResponseSchema.parse({ initialized: false, databaseState: 'claimed' }),
    ).toThrow();
  });

  test('重启回执恒为 true', () => {
    for (const schema of [
      SetupInitResponseSchema,
      SetupConfigResponseSchema,
      SetupGraduateResponseSchema,
    ]) {
      expect(() => schema.parse({ restarting: true })).not.toThrow();
      expect(() => schema.parse({ restarting: false })).toThrow();
    }
  });

  test('config request 仅允许修改身份模式', () => {
    expect(SetupConfigRequestSchema.parse({ identityMode: 'identity' })).toEqual({
      identityMode: 'identity',
    });
    expect(() =>
      SetupConfigRequestSchema.parse({ identityMode: 'identity', dataMode: 'real' }),
    ).toThrow();
  });
});
