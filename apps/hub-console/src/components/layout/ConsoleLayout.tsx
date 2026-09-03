import type { PropsWithChildren } from 'react';
import { useI18n } from '../../i18n';
import type { ConsolePage, ConsolePageDescriptor, ConsoleSection } from '../../console-pages';
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

  // 三层导航分组（IA-RESTRUCTURE demo）：home 置顶无标题，work/manage 带分组标题。
  const sections: { key: ConsoleSection; labelKey?: 'nav.section.work' | 'nav.section.manage' }[] = [
    { key: 'home' },
    { key: 'work', labelKey: 'nav.section.work' },
    { key: 'manage', labelKey: 'nav.section.manage' },
  ];

  return (
    <div className="console-shell">
      <aside className="console-sidebar" aria-label={t('layout.sidebar.nav')}>
        <div className="console-brand">
          <img
            className="console-logo"
            src="/logo-banner.png"
            alt="Team Hub"
            width={38}
            height={38}
          />
          <div>
            <strong>Team Hub</strong>
            <span>{t('brand.subtitle.real')}</span>
          </div>
        </div>
        <GlobalSearchBox client={client} onNavigate={onNavigate} />
        <nav className="console-nav">
          {/* 导航项由页面注册表（console-pages.tsx）派生，不再本地维护 navItems（HUB-MODULARIZATION 第2步）。 */}
          {sections.map((section) => {
            const items = pages.filter((p) => p.section === section.key);
            if (items.length === 0) return null;
            return (
              <div className="nav-group" key={section.key}>
                {section.labelKey ? (
                  <div className="nav-section">{t(section.labelKey)}</div>
                ) : null}
                {items.map((item) => {
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
