import { type PropsWithChildren, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '../../i18n';
import type { ConsolePage, ConsolePageDescriptor } from '../../console-pages';
import type { HubApiClient } from '../../api/client';
import { GlobalSearch as GlobalSearchBox } from '../../features/search/GlobalSearch';
import { useConsolePreferences } from '../../shared/ConsolePreferences';

export type { ConsolePage };
interface ConsoleLayoutProps {
  page: ConsolePage; onNavigate: (page: ConsolePage) => void;
  pages: ConsolePageDescriptor[]; client: HubApiClient; actions?: ReactNode;
}
// 显式导航顺序（四页成品）：任务/项目在工作区，报销/设置在小工具组。
// 只在这里决定顺序，页面本身仍以 CONSOLE_PAGES 为唯一注册源。
const PRIMARY: ConsolePage[] = ['workbench', 'project'];
const TOOLS: ConsolePage[] = ['reimburse', 'settings'];

export function ConsoleLayout({ children, page, onNavigate, pages, client, actions }: PropsWithChildren<ConsoleLayoutProps>) {
  const { t } = useI18n();
  const p = useConsolePreferences();
  const active = pages.find(item => item.key === page);
  const nav = (items: ConsolePage[]) => items.flatMap(key => {
    const item = pages.find(candidate => candidate.key === key);
    if (!item) return [];
    const Icon = item.icon;
    return [<button className={`nav-item${key === page ? ' nav-item-active' : ''}`} type="button" key={key}
      onClick={() => onNavigate(key)} aria-label={t(item.labelKey)} title={t(item.labelKey)} aria-current={key === page ? 'page' : undefined}>
      <Icon aria-hidden="true" size={18} /><span className="nav-copy"><strong>{t(item.labelKey)}</strong><small>{item.hintKey ? t(item.hintKey) : t(item.titleKey)}</small></span>
    </button>];
  });
  return <div className={`console-shell${p.expanded ? ' sidebar-expanded' : ''}`}>
    <aside className="console-sidebar" aria-label={t('layout.sidebar.nav')} onPointerMove={p.touchSidebar} onPointerDown={p.touchSidebar} onFocusCapture={p.touchSidebar} onKeyDown={p.touchSidebar}>
      <div className="console-brand">
        <div className="console-brand-mark"><img className="console-logo" src="/logo-banner.png" alt="TeamHub" width={27} height={27} /></div>
        <div className="brand-copy"><strong>TeamHub</strong><span>{t('expected.subtitle')}</span></div>
        <button className="sidebar-toggle" onClick={p.toggleSidebar} aria-expanded={p.expanded} aria-label={t(p.expanded ? 'expected.collapse' : 'expected.expand')} title={t(p.expanded ? 'expected.collapse' : 'expected.expand')}>
          {p.expanded ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>
      <nav className="console-nav">
        <div className="nav-section">{t('expected.workspace')}</div>{nav(PRIMARY)}
        <div className="nav-section nav-section--tools">{t('expected.tools')}</div>{nav(TOOLS)}
      </nav>
      <div className="sidebar-foot"><span aria-hidden="true" className="sidebar-foot-dot" /><span className="nav-copy"><strong>TeamHub</strong><small>{t('expected.facts')}</small></span></div>
    </aside>
    <div className="console-content">
      <header className="console-topbar"><div className="console-topbar-title"><strong>{active && t(active.labelKey)}</strong><span>{t('expected.facts')}</span></div><GlobalSearchBox client={client} onNavigate={onNavigate} availablePages={pages.map(item => item.key)} />{actions}</header>
      <main className="console-main" id="console-main" data-page={page}>{children}</main>
    </div>
  </div>;
}
