import type { PropsWithChildren } from 'react';
import { useI18n } from '../../i18n';
import type { ConsolePage, ConsolePageDescriptor } from '../../console-pages';

export type { ConsolePage };

interface ConsoleLayoutProps {
  page: ConsolePage;
  onNavigate: (page: ConsolePage) => void;
  // 导航项列表（PHASE2-CONSOLE-ASSEMBLY）：App.tsx 按 TenantConfig.enabledModules 过滤后传入——
  // 本组件不再自行 import 全量 CONSOLE_PAGES，未启用模块的页面结构上不出现在导航里（非灰置禁用）。
  pages: ConsolePageDescriptor[];
}

export function ConsoleLayout({
  children,
  page,
  onNavigate,
  pages,
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
