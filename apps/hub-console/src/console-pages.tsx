import type { ReactElement } from 'react';
import {
  BookOpen,
  Bot,
  Boxes,
  Compass,
  FileStack,
  Home,
  LayoutGrid,
  Settings,
} from 'lucide-react';
import type { HubApiClient } from './api/client';
import type { OverviewSnapshot } from './api/schemas/system';
import type { TranslationKey } from './i18n';
import { OverviewPage } from './features/overview/OverviewPage';
import { ProjectPage } from './features/project/ProjectPage';
import { KbSearchPage } from './features/kb/KbSearchPage';
import { ArchivePage } from './features/archive/ArchivePage';
import { InvPage } from './features/inv/InvPage';
import { FleetPage } from './features/fleet/FleetPage';
import { GapsPage } from './features/gaps/GapsPage';
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
 * **本步范围**：当前仍是六页全量静态注册（未接 TenantConfig.enabledModules 做运行期过滤/懒加载），
 * 是"页面注册表"这一半（消灭 4 处同改）；"按模块动态开关 nav + HubApiClient 切片"留在 risks，
 * 原因见 commit 说明——client 全量按域切片改动面大、本机无法编译验证，属于本步该留的安全边界。
 *
 * 原 ConsoleLayout 的「无 page 时该项灰禁用 + tooltipKey」占位机制（曾用于库存/BOM"开发中"）当前
 * 零处使用（六页均已实现），本次收口时一并去掉——按设计文档自己的方向（§3.4-A"未启用即不渲染"），
 * 未来模块禁用应是「不挂/不渲染」而非「灰置显示」，旧占位机制已过时，非本次删掉的功能回退。
 */

export type ConsolePage =
  | 'overview'
  | 'project'
  | 'knowledge'
  | 'archive'
  | 'inv'
  | 'fleet'
  | 'gaps'
  | 'settings';

/** 页面渲染所需的共享上下文，由 App.tsx 按当前 apiClient/路由态组装。 */
export interface PageRenderCtx {
  apiClient: HubApiClient;
  source: string;
  onNavigate: (page: ConsolePage) => void;
  overview: {
    isLoading: boolean;
    error: unknown;
    data: OverviewSnapshot | undefined;
  };
}

export interface ConsolePageDescriptor {
  key: ConsolePage;
  labelKey: TranslationKey;
  titleKey: TranslationKey;
  icon: typeof Home;
  render: (ctx: PageRenderCtx) => ReactElement | null;
}

// 顺序即导航顺序（IA D-077 定案，不变）：总览 → 项目 → 知识库 → 图纸档案 → 库存 → 机器人队 → 缺人方向 → 设置。
export const CONSOLE_PAGES: ConsolePageDescriptor[] = [
  {
    key: 'overview',
    labelKey: 'nav.overview',
    titleKey: 'toolbar.title.overview',
    icon: Home,
    render: (ctx) => (
      <OverviewPage
        isLoading={ctx.overview.isLoading}
        error={ctx.overview.error}
        snapshot={ctx.overview.data}
        onNavigate={ctx.onNavigate}
      />
    ),
  },
  {
    key: 'project',
    labelKey: 'nav.project',
    titleKey: 'toolbar.title.project',
    icon: LayoutGrid,
    render: (ctx) => <ProjectPage client={ctx.apiClient} source={ctx.source} />,
  },
  {
    key: 'knowledge',
    labelKey: 'nav.knowledge',
    titleKey: 'toolbar.title.knowledge',
    icon: BookOpen,
    render: (ctx) => <KbSearchPage client={ctx.apiClient} source={ctx.source} />,
  },
  {
    key: 'archive',
    labelKey: 'nav.archive',
    titleKey: 'toolbar.title.archive',
    icon: FileStack,
    render: (ctx) => <ArchivePage client={ctx.apiClient} source={ctx.source} />,
  },
  {
    key: 'inv',
    labelKey: 'nav.inv',
    titleKey: 'toolbar.title.inv',
    icon: Boxes,
    render: (ctx) => <InvPage client={ctx.apiClient} source={ctx.source} />,
  },
  {
    key: 'fleet',
    labelKey: 'nav.fleet',
    titleKey: 'toolbar.title.fleet',
    icon: Bot,
    render: (ctx) => <FleetPage client={ctx.apiClient} source={ctx.source} />,
  },
  {
    key: 'gaps',
    labelKey: 'nav.gaps',
    titleKey: 'toolbar.title.gaps',
    icon: Compass,
    render: (ctx) => <GapsPage client={ctx.apiClient} source={ctx.source} />,
  },
  {
    key: 'settings',
    labelKey: 'nav.settings',
    titleKey: 'toolbar.title.settings',
    icon: Settings,
    render: (ctx) => <SettingsPage client={ctx.apiClient} source={ctx.source} />,
  },
];
