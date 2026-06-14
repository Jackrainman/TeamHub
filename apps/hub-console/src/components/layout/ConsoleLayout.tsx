import type { PropsWithChildren } from 'react';
import {
  Activity,
  Boxes,
  Database,
  GitBranch,
  Home,
  Languages,
  Network,
  RadioTower,
  Settings,
  Users,
} from 'lucide-react';
import { useI18n, type TranslationKey } from '../../i18n';

export type ConsolePage = 'overview' | 'dep-graph';
export type DataSource = 'real' | 'mock';

interface NavItem {
  labelKey: TranslationKey;
  icon: typeof Home;
  page?: ConsolePage;
}

const navItems: NavItem[] = [
  { labelKey: 'nav.overview', icon: Home, page: 'overview' },
  { labelKey: 'nav.depGraph', icon: Network, page: 'dep-graph' },
  { labelKey: 'nav.adapters', icon: RadioTower },
  { labelKey: 'nav.events', icon: Activity },
  { labelKey: 'nav.bridge', icon: Users },
  { labelKey: 'nav.git', icon: GitBranch },
  { labelKey: 'nav.artifacts', icon: Boxes },
  { labelKey: 'nav.settings', icon: Settings },
];

interface ConsoleLayoutProps {
  mode: 'mock' | 'real';
  source: DataSource;
  onToggleSource: () => void;
  page: ConsolePage;
  onNavigate: (page: ConsolePage) => void;
}

export function ConsoleLayout({
  children,
  mode,
  source,
  onToggleSource,
  page,
  onNavigate,
}: PropsWithChildren<ConsoleLayoutProps>) {
  const { t, lang, toggleLang } = useI18n();

  return (
    <div className="console-shell">
      <aside className="console-sidebar" aria-label="Console navigation">
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

        <div className="console-controls">
          <button
            className="control-toggle"
            type="button"
            onClick={toggleLang}
            title={t('control.language.title')}
            aria-label={t('control.language.title')}
          >
            <Languages aria-hidden="true" size={15} />
            <span className="control-toggle__label">{t('control.language')}</span>
            <span className="control-toggle__value">
              {lang === 'zh' ? '中文' : 'EN'}
            </span>
          </button>
          <button
            className="control-toggle"
            type="button"
            onClick={onToggleSource}
            title={t('control.source.title')}
            aria-label={t('control.source.title')}
          >
            <Database aria-hidden="true" size={15} />
            <span className="control-toggle__label">{t('control.source')}</span>
            <span
              className={`control-toggle__value control-toggle__value--${source}`}
            >
              {source === 'real' ? t('control.source.live') : t('control.source.mock')}
            </span>
          </button>
        </div>
      </aside>
      <main className="console-main" id="overview">
        {children}
      </main>
    </div>
  );
}
