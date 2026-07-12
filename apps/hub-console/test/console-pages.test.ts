import { describe, expect, test } from 'vitest';
import { ALL_MODULE_IDS } from '@teamhub/hub-contracts';
import type { TenantConfig } from '@teamhub/hub-contracts';
import { CONSOLE_PAGES, filterConsolePages } from '../src/console-pages';

/**
 * 页面注册表过滤（PHASE2-CONSOLE-ASSEMBLY，D-081 已知延后项①收口）：`filterConsolePages` 是导航渲染
 * 与 App.tsx「路由直达降级」共用的唯一判定入口，纯函数单测覆盖几个租户画像，不测 DOM/RTL
 * （同本仓 theme.test.ts「测逻辑不测 DOM」风格）。
 */
describe('console-pages: filterConsolePages', () => {
  const ALL_ENABLED: TenantConfig = { enabledModules: [...ALL_MODULE_IDS] };

  test('全模块启用：9 页全在（含 MY-VIEW）、顺序不变', () => {
    const pages = filterConsolePages(CONSOLE_PAGES, ALL_ENABLED);
    expect(pages.map((p) => p.key)).toEqual(CONSOLE_PAGES.map((p) => p.key));
    expect(pages.map((p) => p.key)).toEqual([
      'overview',
      'myview',
      'project',
      'knowledge',
      'archive',
      'inv',
      'fleet',
      'direction',
      'settings',
    ]);
  });

  test('关掉 presence-schedule：fleet 页消失，其余 7 页仍在', () => {
    const tenant: TenantConfig = {
      enabledModules: ALL_MODULE_IDS.filter((id) => id !== 'presence-schedule'),
    };
    const keys = filterConsolePages(CONSOLE_PAGES, tenant).map((p) => p.key);
    expect(keys).not.toContain('fleet');
    expect(keys).toEqual(CONSOLE_PAGES.map((p) => p.key).filter((k) => k !== 'fleet'));
  });

  test('关掉 pm-core：project / direction / myview 三页一起消失（MY-VIEW 是任务的个人化投影，同挂 pm-core）', () => {
    const tenant: TenantConfig = {
      enabledModules: ALL_MODULE_IDS.filter((id) => id !== 'pm-core'),
    };
    const keys = filterConsolePages(CONSOLE_PAGES, tenant).map((p) => p.key);
    expect(keys).not.toContain('project');
    expect(keys).not.toContain('direction');
    expect(keys).not.toContain('myview');
    // 其余非 pm-core 页不受影响
    expect(keys).toContain('overview');
    expect(keys).toContain('fleet');
  });

  test('只启用 system：仅 overview / settings 在（system 模块名下的两页）', () => {
    const tenant: TenantConfig = { enabledModules: ['system'] };
    expect(filterConsolePages(CONSOLE_PAGES, tenant).map((p) => p.key)).toEqual([
      'overview',
      'settings',
    ]);
  });

  test('空 enabledModules：过滤后无页（不隐式兜底显示任何一页）', () => {
    const tenant: TenantConfig = { enabledModules: [] };
    expect(filterConsolePages(CONSOLE_PAGES, tenant)).toEqual([]);
  });
});
