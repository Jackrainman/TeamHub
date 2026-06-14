import type { PropsWithChildren } from 'react';
import {
  Activity,
  BookOpen,
  Boxes,
  GitBranch,
  Home,
  LayoutGrid,
  Network,
  RadioTower,
  Settings,
  Users,
} from 'lucide-react';
import { useI18n, type TranslationKey } from '../../i18n';

export type ConsolePage = 'overview' | 'dep-graph' | 'kb' | 'pm' | 'settings';
export type DataSource = 'real' | 'mock';

interface NavItem {
  labelKey: TranslationKey;
  icon: typeof Home;
  page?: ConsolePage;
}

const navItems: NavItem[] = [
  { labelKey: 'nav.overview', icon: Home, page: 'overview' },
  { labelKey: 'nav.depGraph', icon: Network, page: 'dep-graph' },
  { labelKey: 'nav.kb', icon: BookOpen, page: 'kb' },
  { labelKey: 'nav.pm', icon: LayoutGrid, page: 'pm' },
  { labelKey: 'nav.adapters', icon: RadioTower },
  { labelKey: 'nav.events', icon: Activity },
  { labelKey: 'nav.bridge', icon: Users },
  { labelKey: 'nav.git', icon: GitBranch },
  { labelKey: 'nav.artifacts', icon: Boxes },
  { labelKey: 'nav.settings', icon: Settings, page: 'settings' },
];

interface ConsoleLayoutProps {
  mode: 'mock' | 'real';
  page: ConsolePage;
  onNavigate: (page: ConsolePage) => void;
}

export function ConsoleLayout({
  children,
  mode,
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
            <span>
              {mode === 'mock'
                ? t('brand.subtitle.mock')
                : t('brand.subtitle.real')}
            </span>
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
                title={disabled ? t('nav.soon') : undefined}
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
