import type { PropsWithChildren } from 'react';
import {
  Activity,
  Boxes,
  GitBranch,
  Home,
  Network,
  RadioTower,
  Settings,
  Users,
} from 'lucide-react';

export type ConsolePage = 'overview' | 'dep-graph';

interface NavItem {
  label: string;
  icon: typeof Home;
  page?: ConsolePage;
}

const navItems: NavItem[] = [
  { label: 'Overview', icon: Home, page: 'overview' },
  { label: '依赖图', icon: Network, page: 'dep-graph' },
  { label: 'Adapters', icon: RadioTower },
  { label: 'Events', icon: Activity },
  { label: 'Bridge', icon: Users },
  { label: 'Git', icon: GitBranch },
  { label: 'Artifacts', icon: Boxes },
  { label: 'Settings', icon: Settings },
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
  return (
    <div className="console-shell">
      <aside className="console-sidebar" aria-label="Console navigation">
        <div className="console-brand">
          <span className="brand-mark">TH</span>
          <div>
            <strong>Team Hub</strong>
            <span>{mode === 'mock' ? 'Mock data' : 'Hub API'}</span>
          </div>
        </div>
        <nav className="console-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.page !== undefined && item.page === page;
            return (
              <button
                className={isActive ? 'nav-item nav-item-active' : 'nav-item'}
                type="button"
                key={item.label}
                onClick={() => item.page && onNavigate(item.page)}
                disabled={item.page === undefined}
              >
                <Icon aria-hidden="true" size={17} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <main className="console-main" id="overview">
        {children}
      </main>
    </div>
  );
}
