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

  // 导航分组（NAV-REGROUP）：home 置顶无标题，board/tool 带分组标题。
  const sections: { key: ConsoleSection; labelKey?: 'nav.section.board' | 'nav.section.tool' }[] = [
    { key: 'home' },
    { key: 'board', labelKey: 'nav.section.board' },
    { key: 'tool', labelKey: 'nav.section.tool' },
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
                      {item.beta ? (
                        <span
                          className={
                            item.beta === 'public-beta'
                              ? 'beta-badge beta-badge--public'
                              : 'beta-badge'
                          }
                        >
                          {t(item.beta === 'public-beta' ? 'beta.badge.public' : 'beta.badge')}
                        </span>
                      ) : null}
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
