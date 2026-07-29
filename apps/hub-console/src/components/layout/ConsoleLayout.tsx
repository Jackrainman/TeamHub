import type { PropsWithChildren } from 'react';
import { useI18n } from '../../i18n';
import type { ConsolePage, ConsolePageDescriptor } from '../../console-pages';
import type { HubApiClient } from '../../api/client';
import { GlobalSearchBox } from '../GlobalSearchBox';

export type { ConsolePage };

interface ConsoleLayoutProps {
  page: ConsolePage;
  onNavigate: (page: ConsolePage) => void;
  pages: ConsolePageDescriptor[];
  client: HubApiClient;
}

export function ConsoleLayout({
  children,
  page,
  onNavigate,
  pages,
  client,
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
        <GlobalSearchBox client={client} onNavigate={onNavigate} />
        <nav className="console-nav">
          {/* 导航项由页面注册表（console-pages.tsx）派生，不再本地维护 navItems（HUB-MODULARIZATION 第2步）。 */}
          {pages.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === page;
            return (
              <button
                className={isActive ? 'nav-item nav-item-active' : 'nav-item'}
                type="button"
                key={item.key}
                onClick={() => onNavigate(item.key)}
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
