import { lazy, type ReactElement } from 'react';
import { CalendarDays, Home, ReceiptText, Settings } from 'lucide-react';
import type { IdentityMode, SessionIdentity } from '@teamhub/hub-contracts';
import type { HubApiClient } from './api/client';
import type { TranslationKey } from './i18n';

const WorkbenchPage = lazy(() => import('./features/workbench/WorkbenchPage').then(m => ({ default: m.WorkbenchPage })));
const CalendarPage = lazy(() => import('./features/pm/calendar/CalendarPage').then(m => ({ default: m.CalendarPage })));
const ReimbursePage = lazy(() => import('./features/reimburse/ReimbursePage').then(m => ({ default: m.ReimbursePage })));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage').then(m => ({ default: m.SettingsPage })));

export type ConsolePage = 'workbench' | 'calendar' | 'reimburse' | 'settings';
export type ConsoleSection = 'home' | 'board' | 'tool';
export interface PageIdentityCtx {
  mode: IdentityMode;
  session: SessionIdentity | null;
  isLoading: boolean;
  canWrite: boolean;
}
export interface PageRenderCtx {
  apiClient: HubApiClient;
  source: string;
  onNavigate: (page: ConsolePage) => void;
  identity: PageIdentityCtx;
}
export interface ConsolePageDescriptor {
  key: ConsolePage;
  labelKey: TranslationKey;
  titleKey: TranslationKey;
  icon: typeof Home;
  section: ConsoleSection;
  beta?: 'beta' | 'public-beta';
  render: (ctx: PageRenderCtx) => ReactElement | null;
}
export const CONSOLE_PAGES: ConsolePageDescriptor[] = [
  {
    key: 'workbench', labelKey: 'expected.nav.workbench', titleKey: 'toolbar.title.workbench',
    icon: Home, section: 'home',
    render: (ctx) => <WorkbenchPage client={ctx.apiClient} source={ctx.source} identity={ctx.identity} />,
  },
  {
    key: 'calendar', labelKey: 'expected.nav.calendar', titleKey: 'expected.nav.calendar',
    icon: CalendarDays, section: 'board',
    render: (ctx) => <CalendarPage client={ctx.apiClient} source={ctx.source} identity={ctx.identity} />,
  },
  {
    key: 'reimburse', labelKey: 'expected.nav.reimburse', titleKey: 'expected.nav.reimburse',
    icon: ReceiptText, section: 'tool', beta: 'public-beta',
    render: (ctx) => <ReimbursePage client={ctx.apiClient} source={ctx.source} identity={ctx.identity} />,
  },
  {
    key: 'settings', labelKey: 'nav.settings', titleKey: 'toolbar.title.settings',
    icon: Settings, section: 'tool',
    render: (ctx) => <SettingsPage client={ctx.apiClient} source={ctx.source} identity={ctx.identity} />,
  },
];
