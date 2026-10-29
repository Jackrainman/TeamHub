import { lazy, type ReactElement } from 'react';
import {
  Activity,
  MessageSquare,
  BookOpen,
  Bot,
  Boxes,
  Calendar,
  CalendarDays,
  Compass,
  FileStack,
  Home,
  LayoutGrid,
  ReceiptText,
  Settings,
} from 'lucide-react';
import type { AppSettings, IdentityMode, ModuleId, SessionIdentity } from '@teamhub/hub-contracts';
import { isModuleEnabled } from '@teamhub/hub-contracts';
import type { HubApiClient } from './api/client';
import type { OverviewSnapshot } from './features/system/api';
import type { TranslationKey } from './i18n';

// 注册表只持有页面加载器；导航和模块过滤不能提前下载业务页面。
const OverviewPage = lazy(() => import('./features/overview/OverviewPage').then(m => ({ default: m.OverviewPage })));
const TeamFeedPage = lazy(() => import('./features/workbench/TeamFeedPage').then(m => ({ default: m.TeamFeedPage })));
const WorkbenchPage = lazy(() => import('./features/workbench/WorkbenchPage').then(m => ({ default: m.WorkbenchPage })));
const SchedulePage = lazy(() => import('./features/schedule/SchedulePage').then(m => ({ default: m.SchedulePage })));
const ResourcesPage = lazy(() => import('./features/resources/ResourcesPage').then(m => ({ default: m.ResourcesPage })));
const ProjectPage = lazy(() => import('./features/project/ProjectPage').then(m => ({ default: m.ProjectPage })));
const KbSearchPage = lazy(() => import('./features/kb/KbSearchPage').then(m => ({ default: m.KbSearchPage })));
const ArchivePage = lazy(() => import('./features/archive/ArchivePage').then(m => ({ default: m.ArchivePage })));
const InvPage = lazy(() => import('./features/inv/InvPage').then(m => ({ default: m.InvPage })));
const ReimbursePage = lazy(() => import('./features/reimburse/ReimbursePage').then(m => ({ default: m.ReimbursePage })));
const DirectionPage = lazy(() => import('./features/direction/DirectionPage').then(m => ({ default: m.DirectionPage })));
const TimelineEditorPage = lazy(() => import('./features/timeline/TimelineEditorPage').then(m => ({ default: m.TimelineEditorPage })));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage').then(m => ({ default: m.SettingsPage })));

/**
 * 页面注册表：加一页只改 `CONSOLE_PAGES` 这一个数组（目标 registry 见
 * docs/design/software-architecture.md）。
 *
 * `moduleId` + `filterConsolePages()` 按 `AppSettings.enabledModules` 过滤——未启用模块的页面
 * 结构上不出现在导航/直达渲染里（§3.4-A「未启用即不渲染」，非灰置禁用）。App.tsx 在 setup 闸
 * 读到服务端 app_settings 后把快照传入，本文件只提供过滤机制、不持有配置默认值。
 */

export type ConsolePage =
  | 'workbench'
  | 'feed'
  | 'overview'
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
 * 导航分组（NAV-REGROUP，2026-09-06 拍板）：不按使用频率分层，改按**性质**分两类——
 *   home = 工作台（单独置顶，无分组标题；风格预览已降级收进设置页外观区——
 *          风格选型是设置项不占导航，见 settings/StylePreviewSection）
 *   board = 战队看板类：对准战队运转的事（总览 / 项目 / 排班在场 / 学习方向 / 时间线）
 *   tool = 小工具类：拿来即用的工具（报账 / 知识库 / 档案 / 库存 / fleet / 设置）
 */
export type ConsoleSection = 'home' | 'board' | 'tool';

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
  // 供 ConsolePageDescriptor.onRefresh 通用消费（页面自声明刷新能力，App 不写按页特例）。
  refetch: () => void;
}

/** 页面渲染所需的共享上下文，由 App.tsx 按当前 apiClient/路由态组装。 */
export interface PageRenderCtx {
  apiClient: HubApiClient;
  source: string;
  /** SQLite app_settings 中的当前项目事实，禁止页面自行默认或从业务列表猜测。 */
  projectId: string;
  availablePages?: ConsolePage[];
  onNavigate: (page: ConsolePage) => void;
  overview: OverviewView;
  identity: PageIdentityCtx;
}

export interface ConsolePageDescriptor {
  key: ConsolePage;
  labelKey: TranslationKey;
  titleKey: TranslationKey;
  hintKey?: TranslationKey;
  icon: typeof Home;
  section: ConsoleSection;
  /** 试用标记：导航项与页头标题旁显示徽标——'beta' = 「内测中」（功能未定型），'public-beta' = 「公测中」（高频功能开放全队试用，NAV-REGROUP ③）。 */
  beta?: 'beta' | 'public-beta';
  render: (ctx: PageRenderCtx) => ReactElement | null;
  // 页面归属模块（§3.3 模块清单表逐字对照）：过滤/降级判定的唯一依据，非重复真相——
  // 加一页时这一个字段就决定它在哪些租户下出现，不须另开一张映射表。
  moduleId: ModuleId;
  // 工具条刷新按钮：页面在自己的 descriptor 里声明 onRefresh，App.tsx 只认这个字段渲不渲染按钮；
  // 未声明 = 该页无刷新按钮。
  onRefresh?: (ctx: PageRenderCtx) => void;
}

// 页面注册与模块权限的单源；主要导航顺序由 ConsoleLayout 显式组合。
export const CONSOLE_PAGES: ConsolePageDescriptor[] = [
  { key: 'feed', labelKey: 'expected.nav.feed', titleKey: 'expected.nav.feed', hintKey: 'expected.hint.feed', icon: MessageSquare, section: 'home', moduleId: 'pm-core', render: ctx => <TeamFeedPage client={ctx.apiClient} source={ctx.source} /> },
  {
    key: 'workbench',
    labelKey: 'expected.nav.workbench',
    hintKey: 'expected.hint.workbench',
    titleKey: 'toolbar.title.workbench',
    icon: Home,
    section: 'home',
    moduleId: 'pm-core',
    render: (ctx) => (
      <WorkbenchPage
        projectId={ctx.projectId}
        availablePages={ctx.availablePages}
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
    section: 'board',
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
    key: 'project',
    labelKey: 'expected.nav.project',
    hintKey: 'expected.hint.project',
    titleKey: 'expected.nav.project',
    icon: LayoutGrid,
    section: 'board',
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
    section: 'board',
    beta: 'beta',
    moduleId: 'presence-schedule',
    render: (ctx) => <SchedulePage client={ctx.apiClient} source={ctx.source} />,
  },
  {
    key: 'reimburse',
    labelKey: 'expected.nav.reimburse',
    hintKey: 'expected.hint.reimburse',
    titleKey: 'expected.nav.reimburse',
    icon: ReceiptText,
    // 报销=拿来即用的小工具，归小工具组并标「公测中」（NAV-REGROUP ③）。
    section: 'tool',
    beta: 'public-beta',
    // 报销属「库存-BOM」支柱的采购-报销-入库联动（REIMBURSE-PROC），随 ledger 模块开关。
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
    key: 'knowledge',
    labelKey: 'expected.nav.knowledge',
    hintKey: 'expected.hint.knowledge',
    titleKey: 'expected.nav.knowledge',
    icon: BookOpen,
    section: 'tool',
    beta: 'beta',
    moduleId: 'knowledge-base',
    render: (ctx) => <KbSearchPage client={ctx.apiClient} source={ctx.source} projectId={ctx.projectId} />,
  },
  {
    key: 'archive',
    labelKey: 'nav.archive',
    titleKey: 'toolbar.title.archive',
    icon: FileStack,
    section: 'tool',
    beta: 'beta',
    moduleId: 'archive',
    render: (ctx) => <ArchivePage client={ctx.apiClient} source={ctx.source} />,
  },
  {
    key: 'inv',
    labelKey: 'expected.nav.inv',
    hintKey: 'expected.hint.inv',
    titleKey: 'expected.nav.inv',
    icon: Boxes,
    section: 'tool',
    moduleId: 'ledger',
    render: (ctx) => <InvPage client={ctx.apiClient} source={ctx.source} projectId={ctx.projectId} />,
  },
  {
    key: 'fleet',
    labelKey: 'nav.fleet',
    titleKey: 'toolbar.title.fleet',
    icon: Bot,
    section: 'tool',
    moduleId: 'presence-schedule',
    // IA-RESTRUCTURE demo：接力画布提升为顶级「每日在场」，本页降为纯机器人清单（建/改状态/退役）。
    render: (ctx) => <ResourcesPage client={ctx.apiClient} source={ctx.source} />,
  },
  {
    key: 'direction',
    labelKey: 'nav.direction',
    titleKey: 'toolbar.title.direction',
    icon: Compass,
    section: 'board',
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
    section: 'board',
    moduleId: 'pm-core',
    render: (ctx) => (
      <TimelineEditorPage
        client={ctx.apiClient}
        seasonsClient={ctx.apiClient}
        source={ctx.source}
        identity={ctx.identity}
      />
    ),
  },
  {
    key: 'settings',
    labelKey: 'nav.settings',
    hintKey: 'expected.hint.settings',
    titleKey: 'toolbar.title.settings',
    icon: Settings,
    section: 'tool',
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
