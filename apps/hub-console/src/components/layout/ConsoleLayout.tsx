import { useState, type PropsWithChildren } from 'react';
import {
  BookOpen,
  Bot,
  Boxes,
  ChevronDown,
  Compass,
  Home,
  LayoutGrid,
  Settings,
} from 'lucide-react';
import { useI18n, type TranslationKey } from '../../i18n';

export type ConsolePage =
  | 'overview'
  | 'project'
  | 'gaps'
  | 'knowledge'
  | 'inv'
  | 'fleet'
  | 'settings';

interface NavItem {
  labelKey: TranslationKey;
  icon: typeof Home;
  page?: ConsolePage;
  // 无 page 时该项灰禁用；tooltipKey 覆盖默认的 nav.soon 提示（如库存/BOM 标「开发中」）
  tooltipKey?: TranslationKey;
}

// 侧栏分组（IA 阶段 4 / D-076）：按数据域收成主操作区 / 洞察区（可折叠）/ 设置。
interface NavGroup {
  titleKey?: TranslationKey;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  // 主操作区：四大数据域单页（无标题，常驻展开）。
  {
    items: [
      // 项目页（IA 阶段 2 / D-075）：看板(pm)+依赖图(dep-graph) 顶部视图切换合一。
      { labelKey: 'nav.project', icon: LayoutGrid, page: 'project' },
      // 知识库（IA 阶段 3 / D-075）：相似 Bug 检索 + 图纸档案 Tab 合一（沉淀知识单页）。
      { labelKey: 'nav.knowledge', icon: BookOpen, page: 'knowledge' },
      // 第三支柱：库存 / BOM。零件×机器人 矩阵 + 一句话快记 + 缺料告警。
      { labelKey: 'nav.inv', icon: Boxes, page: 'inv' },
      // 机器人队（IA 阶段 1 / D-075）：机器人管理 + 在场排班接力画布合一。I0 无人维度。
      { labelKey: 'nav.fleet', icon: Bot, page: 'fleet' },
    ],
  },
  // 洞察区：全队层面、只读、扫一眼的体检报告（总览 + 缺人方向）。可折叠。
  {
    titleKey: 'nav.group.insights',
    collapsible: true,
    defaultExpanded: true,
    items: [
      { labelKey: 'nav.overview', icon: Home, page: 'overview' },
      // 缺人方向（S2，D-069）：组级派生缺口，只到组、不指向人（A1）。
      { labelKey: 'nav.gaps', icon: Compass, page: 'gaps' },
    ],
  },
  // 设置（无标题，常驻展开）。
  {
    items: [{ labelKey: 'nav.settings', icon: Settings, page: 'settings' }],
  },
];

interface ConsoleLayoutProps {
  page: ConsolePage;
  onNavigate: (page: ConsolePage) => void;
}

export function ConsoleLayout({
  children,
  page,
  onNavigate,
}: PropsWithChildren<ConsoleLayoutProps>) {
  const { t } = useI18n();
  // 折叠状态按 titleKey 记忆；未交互时落回 defaultExpanded。
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const isOpen = (group: NavGroup) =>
    (group.titleKey ? openGroups[group.titleKey] : undefined) ??
    group.defaultExpanded ??
    true;

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = item.page !== undefined && item.page === page;
    const disabled = item.page === undefined;
    return (
      <button
        className={isActive ? 'nav-item nav-item-active' : 'nav-item'}
        type="button"
        key={item.labelKey}
        onClick={() => item.page && onNavigate(item.page)}
        disabled={disabled}
        title={disabled ? t(item.tooltipKey ?? 'nav.soon') : undefined}
        aria-current={isActive ? 'page' : undefined}
      >
        <Icon aria-hidden="true" size={17} />
        <span>{t(item.labelKey)}</span>
      </button>
    );
  };

  return (
    <div className="console-shell">
      <aside className="console-sidebar" aria-label={t('layout.sidebar.nav')}>
        <div className="console-brand">
          <span className="brand-mark">TH</span>
          <div>
            <strong>Team Hub</strong>
            <span>{t('brand.subtitle.real')}</span>
          </div>
        </div>
        <nav className="console-nav">
          {navGroups.map((group) => {
            const open = isOpen(group);
            const collapsible = Boolean(group.collapsible && group.titleKey);
            return (
              <div
                className="nav-group"
                key={group.titleKey ?? group.items[0].labelKey}
              >
                {collapsible ? (
                  <button
                    type="button"
                    className="nav-group-header"
                    aria-expanded={open}
                    onClick={() =>
                      setOpenGroups((s) => ({
                        ...s,
                        [group.titleKey!]: !open,
                      }))
                    }
                  >
                    <ChevronDown aria-hidden="true" size={14} />
                    <span>{t(group.titleKey!)}</span>
                  </button>
                ) : null}
                {!collapsible || open ? (
                  <div className="nav-group-items">
                    {group.items.map(renderNavItem)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
      </aside>
      <main className="console-main" id="console-main">
        {children}
      </main>
    </div>
  );
}
