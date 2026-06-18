import type { PropsWithChildren } from 'react';
import {
  BookOpen,
  Boxes,
  Compass,
  FileStack,
  Home,
  LayoutGrid,
  Network,
  Settings,
} from 'lucide-react';
import { useI18n, type TranslationKey } from '../../i18n';

export type ConsolePage =
  | 'overview'
  | 'dep-graph'
  | 'gaps'
  | 'kb'
  | 'pm'
  | 'archive'
  | 'settings';

interface NavItem {
  labelKey: TranslationKey;
  icon: typeof Home;
  page?: ConsolePage;
  // 无 page 时该项灰禁用；tooltipKey 覆盖默认的 nav.soon 提示（如库存/BOM 标「开发中」）
  tooltipKey?: TranslationKey;
}

const navItems: NavItem[] = [
  { labelKey: 'nav.overview', icon: Home, page: 'overview' },
  { labelKey: 'nav.depGraph', icon: Network, page: 'dep-graph' },
  // 缺人方向（S2，D-069）：组级派生缺口，只到组、不指向人（A1）。
  { labelKey: 'nav.gaps', icon: Compass, page: 'gaps' },
  { labelKey: 'nav.kb', icon: BookOpen, page: 'kb' },
  { labelKey: 'nav.pm', icon: LayoutGrid, page: 'pm' },
  // 图纸提交日志 / 版本时间线（A8）：真实页面，读治理快照 artifacts。
  { labelKey: 'nav.archive', icon: FileStack, page: 'archive' },
  // 第三支柱占位：库存/BOM 开发中——无 page → 复用灰禁用机制（D-052 保留），不接后端
  { labelKey: 'nav.inv', icon: Boxes, tooltipKey: 'nav.inv.soon' },
  { labelKey: 'nav.settings', icon: Settings, page: 'settings' },
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
          {navItems.map((item) => {
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
          })}
        </nav>
      </aside>
      <main className="console-main" id="console-main">
        {children}
      </main>
    </div>
  );
}
