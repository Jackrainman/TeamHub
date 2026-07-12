import { describe, expect, test } from 'vitest';
import { parseTenantConfigEnv } from '../src/tenant-config-env.js';

/**
 * `TEAMHUB_TENANT_MODULES` 解析（AUDIT-DEBT-2026-07 §9-④ 审计债④）：main.ts 从未把 tenantConfig
 * 传给 buildHubServer，真实启动路径恒走内部缺省 ROBOTICS_TENANT_CONFIG（全 6 模块开）——
 * `tenant-config-route.test.ts` 验证的"关模块"路径此前只在测试直接构造 `TenantConfig` 时可达，
 * 真实运行从未触达。本测试覆盖纯函数解析逻辑（main.ts 本身不易单测——顶层 `main().catch()` 副作用）。
 */
describe('parseTenantConfigEnv', () => {
  test('未设（undefined）→ 返回 undefined（buildHubServer 走内部缺省 ROBOTICS_TENANT_CONFIG，现状零变化）', () => {
    expect(parseTenantConfigEnv(undefined)).toBeUndefined();
  });

  test('空串 / 纯空白 → 返回 undefined（同未设，容错空值不当作"只启用空集"）', () => {
    expect(parseTenantConfigEnv('')).toBeUndefined();
    expect(parseTenantConfigEnv('   ')).toBeUndefined();
  });

  test('合法逗号分隔子集 → 返回对应 TenantConfig（真正收窄，可配置生效）', () => {
    expect(parseTenantConfigEnv('system,pm-core,knowledge-base')).toEqual({
      enabledModules: ['system', 'pm-core', 'knowledge-base'],
    });
  });

  test('容忍多余空格 / 空片段', () => {
    expect(parseTenantConfigEnv(' system , pm-core ,, ')).toEqual({
      enabledModules: ['system', 'pm-core'],
    });
  });

  test('含未知模块 id → 抛错（fail-closed，拼错不该悄悄降级）', () => {
    expect(() => parseTenantConfigEnv('system,not-a-real-module')).toThrow(
      /not-a-real-module/,
    );
  });
});
