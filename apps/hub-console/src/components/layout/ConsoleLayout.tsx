import type { PropsWithChildren } from 'react';
import {
  Activity,
  Boxes,
  GitBranch,
  Home,
  RadioTower,
  Settings,
  Users,
} from 'lucide-react';

const navItems = [
  { label: 'Overview', icon: Home, active: true },
  { label: 'Adapters', icon: RadioTower },
  { label: 'Events', icon: Activity },
  { label: 'Bridge', icon: Users },
  { label: 'Git', icon: GitBranch },
  { label: 'Artifacts', icon: Boxes },
  { label: 'Settings', icon: Settings },
];

interface ConsoleLayoutProps {
  mode: 'mock' | 'real';
}

export function ConsoleLayout({
  children,
  mode,
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
            return (
              <a
                className={item.active ? 'nav-item nav-item-active' : 'nav-item'}
                href="#overview"
                key={item.label}
              >
                <Icon aria-hidden="true" size={17} />
                <span>{item.label}</span>
              </a>
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
