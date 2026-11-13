import { describe, expect, test } from 'vitest';
import { ALL_MODULE_IDS } from '@teamhub/hub-contracts';
import type { TenantConfig } from '@teamhub/hub-contracts';
import { CONSOLE_PAGES, filterConsolePages } from '../src/console-pages';

/**
 * 页面注册表过滤（PHASE2-CONSOLE-ASSEMBLY，D-081 已知延后项①收口）：`filterConsolePages` 是导航渲染
 * 与 App.tsx「路由直达降级」共用的唯一判定入口，纯函数单测覆盖几个租户画像，不测 DOM/RTL
 * （同本仓 theme.test.ts「测逻辑不测 DOM」风格）。
 *
 * 产品收窄为成品四页后，注册表只有 任务(workbench)/项目(project)/报销(reimburse)/设置(settings)。
 */
describe('console-pages: filterConsolePages', () => {
  const ALL_ENABLED: TenantConfig = { enabledModules: [...ALL_MODULE_IDS] };

  test('全模块启用：四页全在且顺序固定（任务 / 项目 / 报销 / 设置）', () => {
    const pages = filterConsolePages(CONSOLE_PAGES, ALL_ENABLED);
    expect(pages.map((p) => p.key)).toEqual(['workbench', 'project', 'reimburse', 'settings']);
    expect(pages).toEqual(CONSOLE_PAGES);
  });

  test('关掉 pm-core：任务 / 项目两页一起消失，报销与设置不受影响', () => {
    const tenant: TenantConfig = {
      enabledModules: ALL_MODULE_IDS.filter((id) => id !== 'pm-core'),
    };
    expect(filterConsolePages(CONSOLE_PAGES, tenant).map((p) => p.key)).toEqual([
      'reimburse',
      'settings',
    ]);
  });

  test('关掉 ledger：报销页消失，其余三页仍在（报销随库存-BOM 模块开关）', () => {
    const tenant: TenantConfig = {
      enabledModules: ALL_MODULE_IDS.filter((id) => id !== 'ledger'),
    };
    expect(filterConsolePages(CONSOLE_PAGES, tenant).map((p) => p.key)).toEqual([
      'workbench',
      'project',
      'settings',
    ]);
  });

  test('只启用 system：只剩设置页（system 模块名下唯一一页）', () => {
    const tenant: TenantConfig = { enabledModules: ['system'] };
    expect(filterConsolePages(CONSOLE_PAGES, tenant).map((p) => p.key)).toEqual(['settings']);
  });

  test('空 enabledModules：过滤后无页（不隐式兜底显示任何一页）', () => {
    const tenant: TenantConfig = { enabledModules: [] };
    expect(filterConsolePages(CONSOLE_PAGES, tenant)).toEqual([]);
  });
});

/**
 * 工具条刷新按钮归一进正常注册机制（AUDIT-DEBT-2026-07 §9-④ 审计债⑤）：App.tsx 只问
 * activePage.onRefresh 存不存在，不按 key 字面量特判。总览页停用后四页均未声明 onRefresh，
 * 因此工具条当前不渲染刷新按钮；加页时由 descriptor 的该字段决定，本测试锁定这个事实。
 */
describe('console-pages: 工具条 onRefresh 注册', () => {
  test('四页均未声明 onRefresh（总览页停用后刷新按钮不再出现在工具条）', () => {
    const withRefresh = CONSOLE_PAGES.filter((p) => typeof p.onRefresh === 'function').map(
      (p) => p.key,
    );
    expect(withRefresh).toEqual([]);
  });
});
