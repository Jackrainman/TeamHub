import type { ReactElement } from 'react';
import {
  Activity,
  BookOpen,
  Bot,
  Boxes,
  Calendar,
  CalendarDays,
  Compass,
  FileStack,
  Home,
  LayoutGrid,
  ListChecks,
  ReceiptText,
  Settings,
} from 'lucide-react';
import type { AppSettings, IdentityMode, ModuleId, SessionIdentity } from '@teamhub/hub-contracts';
import { isModuleEnabled } from '@teamhub/hub-contracts';
import type { HubApiClient } from './api/client';
import type { OverviewSnapshot } from './features/system/api';
import type { TranslationKey } from './i18n';
import { OverviewPage } from './features/overview/OverviewPage';
import { WorkbenchPage } from './features/workbench/WorkbenchPage';
import { SchedulePage } from './features/schedule/SchedulePage';
import { ResourcesPage } from './features/resources/ResourcesPage';
import { ProjectPage } from './features/project/ProjectPage';
import { KbSearchPage } from './features/kb/KbSearchPage';
import { ArchivePage } from './features/archive/ArchivePage';
import { InvPage } from './features/inv/InvPage';
import { ReimbursePage } from './features/reimburse';
import { DirectionPage } from './features/direction/DirectionPage';
import { TimelineEditorPage } from './features/timeline/TimelineEditorPage';
import { MyViewPage } from './features/myview/MyViewPage';
import { SettingsPage } from './features/settings/SettingsPage';

/**
 * 页面注册表（HUB-MODULARIZATION 第2步，装配外壳）。
 *
 * 把原 App.tsx 的 if-else 渲染分支 + ConsoleLayout 的 ConsolePage 联合类型 + navItems 静态数组 +
 * TITLE_KEY（存量 4 处同改点；目标 registry 见 docs/design/software-architecture.md）
 * 收成本文件一处定义：加一页只改 `CONSOLE_PAGES` 这一个数组。
 *
 * 装配契约对照：本文件是 hub-console 对 `ModuleDescriptor.pages`（`@teamhub/hub-contracts` 的
 * assembly.ts，只接口不实现）的具体化——contracts 层的 `pages`/`lazyComponent` 留了型参占位给宿主收紧，
 * 这里收紧成 console 实际用到的 React 组件引用 + 渲染上下文类型。
 *
 * **本步接线（PHASE2-CONSOLE-ASSEMBLY，D-081 已知延后项①收口）**：`CONSOLE_PAGES` 仍是全量静态
 * 注册表（13 页）；新增 `moduleId` 字段 + `filterConsolePages()` 纯函数按 `AppSettings.enabledModules`
 * 过滤——未启用模块的页面结构上不出现在导航/直达渲染里（§3.4-A"未启用即不渲染"，非灰置禁用）。
 * App.tsx 在 setup 闸读到服务端 app_settings 后把快照传入，本文件只提供过滤机制、
 * 不持有配置默认值。"HubApiClient 切片"仍留在 risks——client 全量按域切片改动面大，
 * 属于本步该留的安全边界。
 *
 * 原 ConsoleLayout 的「无 page 时该项灰禁用 + tooltipKey」占位机制（曾用于库存/BOM"开发中"）当前
 * 零处使用（六页均已实现），本次收口时一并去掉——按设计文档自己的方向（§3.4-A"未启用即不渲染"），
 * 未来模块禁用应是「不挂/不渲染」而非「灰置显示」，旧占位机制已过时，非本次删掉的功能回退。
 */

export type ConsolePage =
  | 'workbench'
  | 'overview'
  | 'myview'
  | 'project'
  | 'schedule'
  | 'knowledge'
  | 'archive'
  | 'inv'
  | 'reimburse'
  | 'fleet'
  | 'direction'
  | 'timeline'
  | 'settings';

/**
 * 导航分组（IA-RESTRUCTURE demo）：三层信息架构——
 *   home = 首页工作台（萌新落地页，单独置顶，无分组标题；风格预览已降级收进设置页外观区——
 *          风格选型是设置项不占导航，见 settings/StylePreviewSection）
 *   work = 高频工作区（我的视图 / 项目 / 每日在场）
 *   manage = 低频管理杂货（运维总览 / 机器人清单 / 报销库存等）
 */
export type ConsoleSection = 'home' | 'work' | 'manage';

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

/** 总览只读视图形状：App 取好一份后透传给需要的页面复用，避免各页重复查 getOverview。 */
export interface OverviewView {
  isLoading: boolean;
  error: unknown;
  data: OverviewSnapshot | undefined;
  // AUDIT-DEBT-2026-07 §9-④ 审计债⑤：工具条刷新按钮此前硬编码 `page === 'overview'`
  // 特例——只有总览页能刷新是判断藏在 App.tsx 里，不是页面自己声明的能力。
  // 补 refetch 到 ctx，供 ConsolePageDescriptor.onRefresh 通用消费。
  refetch: () => void;
}

/** 页面渲染所需的共享上下文，由 App.tsx 按当前 apiClient/路由态组装。 */
export interface PageRenderCtx {
  apiClient: HubApiClient;
  source: string;
  /** SQLite app_settings 中的当前项目事实，禁止页面自行默认或从业务列表猜测。 */
  projectId: string;
  onNavigate: (page: ConsolePage) => void;
  overview: OverviewView;
  identity: PageIdentityCtx;
}

export interface ConsolePageDescriptor {
  key: ConsolePage;
  labelKey: TranslationKey;
  titleKey: TranslationKey;
  icon: typeof Home;
  section: ConsoleSection;
  /** 内测标记：导航项与页头标题旁显示「内测中」徽标（功能未定型，先小范围试用）。 */
  beta?: boolean;
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

// 顺序即导航顺序（IA-RESTRUCTURE demo 三层重排：首页 → 工作区[我的视图/项目/每日在场] → 管理[总览/机器人清单/学习方向/知识库/图纸档案/库存/报账/时间线/设置]）：
// 每日在场从机器人队 Tab 提升为顶级入口；fleet 页降为纯机器人清单（管理组）；风格预览收进设置页。
export const CONSOLE_PAGES: ConsolePageDescriptor[] = [
  {
    key: 'workbench',
    labelKey: 'nav.workbench',
    titleKey: 'toolbar.title.workbench',
    icon: Home,
    section: 'home',
    moduleId: 'pm-core',
    render: (ctx) => (
      <WorkbenchPage
        client={ctx.apiClient}
        source={ctx.source}
        identity={ctx.identity}
        onNavigate={ctx.onNavigate}
      />
    ),
  },
  {
    key: 'overview',
    labelKey: 'nav.overview',
    titleKey: 'toolbar.title.overview',
    icon: Activity,
    section: 'manage',
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
        identity={ctx.identity}
      />
    ),
  },
  {
    key: 'myview',
    labelKey: 'nav.myview',
    titleKey: 'toolbar.title.myview',
    icon: ListChecks,
    section: 'work',
    // pm-core：我的视图是任务(Task)的个人化投影，随 pm-core 模块一起开关，与 project/direction 同口径。
    moduleId: 'pm-core',
    render: (ctx) => (
      <MyViewPage
        client={ctx.apiClient}
        source={ctx.source}
        identity={ctx.identity}
        onNavigate={ctx.onNavigate}
      />
    ),
  },
  {
    key: 'project',
    labelKey: 'nav.project',
    titleKey: 'toolbar.title.project',
    icon: LayoutGrid,
    section: 'work',
    moduleId: 'pm-core',
    render: (ctx) => (
      <ProjectPage client={ctx.apiClient} source={ctx.source} identity={ctx.identity} />
    ),
  },
  {
    key: 'schedule',
    labelKey: 'nav.schedule',
    titleKey: 'toolbar.title.schedule',
    icon: CalendarDays,
    section: 'work',
    beta: true,
    moduleId: 'presence-schedule',
    render: (ctx) => <SchedulePage client={ctx.apiClient} source={ctx.source} />,
  },
  {
    key: 'knowledge',
    labelKey: 'nav.knowledge',
    titleKey: 'toolbar.title.knowledge',
    icon: BookOpen,
    section: 'manage',
    beta: true,
    moduleId: 'knowledge-base',
    render: (ctx) => <KbSearchPage client={ctx.apiClient} source={ctx.source} />,
  },
  {
    key: 'archive',
    labelKey: 'nav.archive',
    titleKey: 'toolbar.title.archive',
    icon: FileStack,
    section: 'manage',
    beta: true,
    moduleId: 'archive',
    render: (ctx) => <ArchivePage client={ctx.apiClient} source={ctx.source} />,
  },
  {
    key: 'inv',
    labelKey: 'nav.inv',
    titleKey: 'toolbar.title.inv',
    icon: Boxes,
    section: 'manage',
    moduleId: 'ledger',
    render: (ctx) => <InvPage client={ctx.apiClient} source={ctx.source} />,
  },
  {
    key: 'reimburse',
    labelKey: 'nav.reimburse',
    titleKey: 'toolbar.title.reimburse',
    icon: ReceiptText,
    section: 'manage',
    // 报账属「库存-BOM」支柱的采购-报账-入库联动（REIMBURSE-PROC），随 ledger 模块开关。
    moduleId: 'ledger',
    render: (ctx) => (
      <ReimbursePage
        client={ctx.apiClient}
        source={ctx.source}
        identity={ctx.identity}
        projectId={ctx.projectId}
      />
    ),
  },
  {
    key: 'fleet',
    labelKey: 'nav.fleet',
    titleKey: 'toolbar.title.fleet',
    icon: Bot,
    section: 'manage',
    moduleId: 'presence-schedule',
    // IA-RESTRUCTURE demo：接力画布提升为顶级「每日在场」，本页降为纯机器人清单（建/改状态/退役）。
    render: (ctx) => <ResourcesPage client={ctx.apiClient} source={ctx.source} />,
  },
  {
    key: 'direction',
    labelKey: 'nav.direction',
    titleKey: 'toolbar.title.direction',
    icon: Compass,
    section: 'manage',
    moduleId: 'pm-core',
    render: (ctx) => (
      <DirectionPage client={ctx.apiClient} source={ctx.source} identity={ctx.identity} />
    ),
  },
  {
    key: 'timeline',
    labelKey: 'nav.timeline',
    titleKey: 'toolbar.title.timeline',
    icon: Calendar,
    section: 'manage',
    moduleId: 'pm-core',
    render: (ctx) => (
      <TimelineEditorPage
        client={ctx.apiClient}
        seasonsClient={ctx.apiClient}
        source={ctx.source}
      />
    ),
  },
  {
    key: 'settings',
    labelKey: 'nav.settings',
    titleKey: 'toolbar.title.settings',
    icon: Settings,
    section: 'manage',
    moduleId: 'system',
    render: (ctx) => (
      <SettingsPage client={ctx.apiClient} source={ctx.source} identity={ctx.identity} overview={ctx.overview} />
    ),
  },
];

/**
 * 按租户 `enabledModules` 过滤页面注册表（纯函数，无副作用）——导航渲染与「路由直达降级」共用
 * 同一份判定，不在两处各写一套开关逻辑。装配点在 App.tsx，本函数只读服务端设置快照。
 */
export function filterConsolePages(
  pages: ConsolePageDescriptor[],
  tenantConfig: Pick<AppSettings, 'enabledModules'>,
): ConsolePageDescriptor[] {
  return pages.filter((page) => isModuleEnabled(tenantConfig, page.moduleId));
}
