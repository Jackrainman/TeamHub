import type { ReactElement } from 'react';
import {
  BookOpen,
  Bot,
  Boxes,
  Compass,
  FileStack,
  Home,
  LayoutGrid,
  ListChecks,
  Settings,
} from 'lucide-react';
import type { IdentityMode, ModuleId, SessionIdentity, TenantConfig } from '@teamhub/hub-contracts';
import { isModuleEnabled } from '@teamhub/hub-contracts';
import type { HubApiClient } from './api/client';
import type { OverviewSnapshot } from './api/schemas/system';
import type { TranslationKey } from './i18n';
import { OverviewPage } from './features/overview/OverviewPage';
import { ProjectPage } from './features/project/ProjectPage';
import { KbSearchPage } from './features/kb/KbSearchPage';
import { ArchivePage } from './features/archive/ArchivePage';
import { InvPage } from './features/inv/InvPage';
import { FleetPage } from './features/fleet/FleetPage';
import { DirectionPage } from './features/direction/DirectionPage';
import { MyViewPage } from './features/myview/MyViewPage';
import { SettingsPage } from './features/settings/SettingsPage';

/**
 * 页面注册表（HUB-MODULARIZATION 第2步，装配外壳）。
 *
 * 把原 App.tsx 的 if-else 渲染分支 + ConsoleLayout 的 ConsolePage 联合类型 + navItems 静态数组 +
 * TITLE_KEY（4 处"加一页要改 4 处"的同改点，见 docs/design/modularization-feasibility.md §2.2⑥ / §3.4-A）
 * 收成本文件一处定义：加一页只改 `CONSOLE_PAGES` 这一个数组。
 *
 * 装配契约对照：本文件是 hub-console 对 `ModuleDescriptor.pages`（`@teamhub/hub-contracts` 的
 * assembly.ts，只接口不实现）的具体化——contracts 层的 `pages`/`lazyComponent` 留了型参占位给宿主收紧，
 * 这里收紧成 console 实际用到的 React 组件引用 + 渲染上下文类型。
 *
 * **本步接线（PHASE2-CONSOLE-ASSEMBLY，D-081 已知延后项①收口）**：`CONSOLE_PAGES` 仍是全量静态
 * 注册表（8 页，值不变）；新增 `moduleId` 字段 + `filterConsolePages()` 纯函数按 `TenantConfig.enabledModules`
 * 过滤——未启用模块的页面结构上不出现在导航/直达渲染里（§3.4-A"未启用即不渲染"，非灰置禁用）。
 * 具体 TenantConfig 由哪个常量注入是 App.tsx 的装配点（见该文件顶部 `TENANT_CONFIG`），本文件只提供
 * 过滤机制、不持有租户配置本身。"HubApiClient 切片"仍留在 risks——client 全量按域切片改动面大，
 * 属于本步该留的安全边界。
 *
 * 原 ConsoleLayout 的「无 page 时该项灰禁用 + tooltipKey」占位机制（曾用于库存/BOM"开发中"）当前
 * 零处使用（六页均已实现），本次收口时一并去掉——按设计文档自己的方向（§3.4-A"未启用即不渲染"），
 * 未来模块禁用应是「不挂/不渲染」而非「灰置显示」，旧占位机制已过时，非本次删掉的功能回退。
 */

export type ConsolePage =
  | 'overview'
  | 'myview'
  | 'project'
  | 'knowledge'
  | 'archive'
  | 'inv'
  | 'fleet'
  | 'direction'
  | 'settings';

/**
 * 身份槽（IDENTITY-LITE，I2 console 接线，product-redefine §4.2 / 审计 §9-②）：由 App.tsx 据
 * `GET /api/session` 组装。`mode==='anonymous'` 时 `session` 恒 null（今天的形态，各页不必对此
 * 分支）；`mode==='identity'` 时 `session` 为当前登录人（未登录 = null）。`canWrite` 是写门预计算：
 * 匿名模式恒 true（现状不变）、身份模式仅登录后 true——各写表单据此禁用提交 + 给「登录后可写」
 * 提示，不改读侧（读一切照常，红线 I0 例外之外不新增按人过滤的读口）。
 */
export interface PageIdentityCtx {
  mode: IdentityMode;
  session: SessionIdentity | null;
  isLoading: boolean;
  canWrite: boolean;
}

/** 页面渲染所需的共享上下文，由 App.tsx 按当前 apiClient/路由态组装。 */
export interface PageRenderCtx {
  apiClient: HubApiClient;
  source: string;
  onNavigate: (page: ConsolePage) => void;
  overview: {
    isLoading: boolean;
    error: unknown;
    data: OverviewSnapshot | undefined;
    // AUDIT-DEBT-2026-07 §9-④ 审计债⑤：工具条刷新按钮此前硬编码 `page === 'overview'`
    // 特例——只有总览页能刷新是判断藏在 App.tsx 里，不是页面自己声明的能力。
    // 补 refetch 到 ctx，供 ConsolePageDescriptor.onRefresh 通用消费。
    refetch: () => void;
  };
  identity: PageIdentityCtx;
}

export interface ConsolePageDescriptor {
  key: ConsolePage;
  labelKey: TranslationKey;
  titleKey: TranslationKey;
  icon: typeof Home;
  render: (ctx: PageRenderCtx) => ReactElement | null;
  // 页面归属模块（§3.3 模块清单表逐字对照）：过滤/降级判定的唯一依据，非重复真相——
  // 加一页时这一个字段就决定它在哪些租户下出现，不须另开一张映射表。
  moduleId: ModuleId;
  // 工具条刷新按钮（AUDIT-DEBT-2026-07 §9-④ 审计债⑤，归一进正常注册机制）：某页若需要一个
  // 手动刷新入口，在自己的 descriptor 里声明 onRefresh；App.tsx 只认这个字段渲不渲染按钮，
  // 不再写 `page === 'overview'` 这种按页 key 字面量判断的特例。未声明 = 该页无刷新按钮
  // （与改动前 8/9 页零按钮的行为一致）。
  onRefresh?: (ctx: PageRenderCtx) => void;
}

// 顺序即导航顺序（IA D-077 定案，9 页顺序不变；MY-VIEW 新增插在总览之后）：
// 总览 → 我的视图 → 项目 → 知识库 → 图纸档案 → 库存 → 机器人队 → 学习方向 → 设置。
export const CONSOLE_PAGES: ConsolePageDescriptor[] = [
  {
    key: 'overview',
    labelKey: 'nav.overview',
    titleKey: 'toolbar.title.overview',
    icon: Home,
    moduleId: 'system',
    // 唯一声明了 onRefresh 的页（改动前"只有总览有刷新按钮"的行为不变，
    // 差别是现在由本页自己声明，不是 App.tsx 按 key 字面量特判）。
    onRefresh: (ctx) => ctx.overview.refetch(),
    render: (ctx) => (
      <OverviewPage
        client={ctx.apiClient}
        source={ctx.source}
        isLoading={ctx.overview.isLoading}
        error={ctx.overview.error}
        snapshot={ctx.overview.data}
        onNavigate={ctx.onNavigate}
      />
    ),
  },
  {
    key: 'myview',
    labelKey: 'nav.myview',
    titleKey: 'toolbar.title.myview',
    icon: ListChecks,
    // pm-core：我的视图是任务(Task)的个人化投影，随 pm-core 模块一起开关，与 project/direction 同口径。
    moduleId: 'pm-core',
    render: (ctx) => (
      <MyViewPage client={ctx.apiClient} source={ctx.source} identity={ctx.identity} />
    ),
  },
  {
    key: 'project',
    labelKey: 'nav.project',
    titleKey: 'toolbar.title.project',
    icon: LayoutGrid,
    moduleId: 'pm-core',
    render: (ctx) => (
      <ProjectPage client={ctx.apiClient} source={ctx.source} identity={ctx.identity} />
    ),
  },
  {
    key: 'knowledge',
    labelKey: 'nav.knowledge',
    titleKey: 'toolbar.title.knowledge',
    icon: BookOpen,
    moduleId: 'knowledge-base',
    render: (ctx) => <KbSearchPage client={ctx.apiClient} source={ctx.source} />,
  },
  {
    key: 'archive',
    labelKey: 'nav.archive',
    titleKey: 'toolbar.title.archive',
    icon: FileStack,
    moduleId: 'archive',
    render: (ctx) => <ArchivePage client={ctx.apiClient} source={ctx.source} />,
  },
  {
    key: 'inv',
    labelKey: 'nav.inv',
    titleKey: 'toolbar.title.inv',
    icon: Boxes,
    moduleId: 'ledger',
    render: (ctx) => <InvPage client={ctx.apiClient} source={ctx.source} />,
  },
  {
    key: 'fleet',
    labelKey: 'nav.fleet',
    titleKey: 'toolbar.title.fleet',
    icon: Bot,
    moduleId: 'presence-schedule',
    render: (ctx) => <FleetPage client={ctx.apiClient} source={ctx.source} />,
  },
  {
    key: 'direction',
    labelKey: 'nav.direction',
    titleKey: 'toolbar.title.direction',
    icon: Compass,
    moduleId: 'pm-core',
    render: (ctx) => (
      <DirectionPage client={ctx.apiClient} source={ctx.source} identity={ctx.identity} />
    ),
  },
  {
    key: 'settings',
    labelKey: 'nav.settings',
    titleKey: 'toolbar.title.settings',
    icon: Settings,
    moduleId: 'system',
    render: (ctx) => <SettingsPage client={ctx.apiClient} source={ctx.source} />,
  },
];

/**
 * 按租户 `enabledModules` 过滤页面注册表（纯函数，无副作用）——导航渲染与「路由直达降级」共用
 * 同一份判定，不在两处各写一套开关逻辑。装配点（哪个 TenantConfig）在 App.tsx，本函数只做过滤。
 */
export function filterConsolePages(
  pages: ConsolePageDescriptor[],
  tenantConfig: TenantConfig,
): ConsolePageDescriptor[] {
  return pages.filter((page) => isModuleEnabled(tenantConfig, page.moduleId));
}
