import { useMemo, useState } from 'react';
import type { HubApiClient } from '../../../api/client';
import type { ConsolePage, PageIdentityCtx } from '../../../console-pages';
import { useI18n } from '../../../i18n';
import { EmptyState } from '../../../shared/EmptyState';
import { useQueryGuard } from '../../../shared/QueryGate';
import { MonthGrid } from './MonthGrid';
import { MonthView } from './MonthView';
import { monthLabel } from './calendar-month';
import { CalendarDrawer, type CalendarSelection } from './CalendarDrawer';
import { buildAxis, dateKeyOf, barGeometry, type CalendarMode } from './model';
import { useCalendarData, useTodayKey } from './hooks';

export type CalendarView = 'month' | 'timeline';
const CALENDAR_VIEW_KEY = 'teamhub.calendar.view';

function initialCalendarView(): CalendarView {
  if (typeof window === 'undefined') return 'month';
  try {
    const value = window.localStorage.getItem(CALENDAR_VIEW_KEY);
    return value === 'month' || value === 'timeline' ? value : 'month';
  } catch {
    return 'month';
  }
}

export function CalendarPage({ client, source, projectId, identity, onNavigate, todayOverride }: {
  client: HubApiClient;
  source: string;
  projectId: string;
  identity: PageIdentityCtx;
  onNavigate: (page: ConsolePage) => void;
  todayOverride?: string;
}): JSX.Element {
  const { t, lang } = useI18n();
  const [mode, setMode] = useState<CalendarMode>('month');
  const [view, setView] = useState<CalendarView>(initialCalendarView);
  const today = useTodayKey(todayOverride);
  const [anchor, setAnchor] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }));
  const { projectsQuery, baselineQuery, activeSeason, filteredProjects, hiddenCount } = useCalendarData(client, source);
  const projects = useQueryGuard(projectsQuery, t('calendar.loading'), t('calendar.error'));
  const axis = useMemo(() => view === 'timeline' ? buildAxis(mode, today, activeSeason) : null, [view, mode, today, activeSeason]);
  const [selection, setSelection] = useState<CalendarSelection | null>(null);
  const milestones = baselineQuery.data?.baseline?.milestones ?? [];
  const bands = baselineQuery.data?.baseline?.segments ?? [];
  const outsideCount = view === 'timeline' && axis
    ? filteredProjects.filter(project => dateKeyOf(project.startsAt) && !barGeometry(project, axis, today)).length
    : 0;
  const anyStart = filteredProjects.some(project => dateKeyOf(project.startsAt));

  function changeView(next: CalendarView): void {
    setView(next);
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(CALENDAR_VIEW_KEY, next); } catch { /* Storage can be unavailable in private or SSR-like contexts. */ }
  }
  function previousMonth(): void {
    setAnchor(current => current.month === 1 ? { year: current.year - 1, month: 12 } : { ...current, month: current.month - 1 });
  }
  function nextMonth(): void {
    setAnchor(current => current.month === 12 ? { year: current.year + 1, month: 1 } : { ...current, month: current.month + 1 });
  }

  return <div className="calendar-page" data-today={today}>
    <header className="calendar-toolbar">
      <div>
        <h1>{t('expected.nav.calendar')}</h1>
        <span className="calendar-legend">{t(`calendar.legend.${view}`)}</span>
      </div>
      <div className="calendar-controls">
        {view === 'month' ? <nav className="calendar-month-nav" aria-label={t('calendar.month.label', { year: anchor.year, month: anchor.month })}>
          <button type="button" className="btn" data-action="prev" aria-label={t('calendar.month.prev')} onClick={previousMonth}>‹</button>
          <strong>{monthLabel(anchor.year, anchor.month, lang)}</strong>
          <button type="button" className="btn" data-action="next" aria-label={t('calendar.month.next')} onClick={nextMonth}>›</button>
          <button type="button" className="btn" data-action="today" aria-label={t('calendar.month.today')} onClick={() => setAnchor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) })}>{t('calendar.today')}</button>
        </nav> : <div className="calendar-mode" role="group" aria-label={t('calendar.mode.aria')}>
          {(['month', 'week'] as const).map(value => <button type="button" key={value} data-mode={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{t(`calendar.mode.${value}`)}</button>)}
        </div>}
        <div className="calendar-mode" role="group" aria-label={t('calendar.view.aria')}>
          {(['month', 'timeline'] as const).map(value => <button type="button" key={value} data-view={value} aria-pressed={view === value} onClick={() => changeView(value)}>{t(`calendar.view.${value}`)}</button>)}
        </div>
      </div>
    </header>
    {projects ? <>
      {view === 'month' ? <MonthView year={anchor.year} month={anchor.month} projects={filteredProjects} today={today} onOpen={project => setSelection({ type: 'project', project })} /> : axis ? <MonthGrid axis={axis} mode={mode} projects={filteredProjects} milestones={milestones} bands={bands} today={today} projectId={projectId} onOpenProject={project => setSelection({ type: 'project', project })} onOpenMilestone={milestone => setSelection({ type: 'milestone', milestone, season: activeSeason })} /> : null}
      {!activeSeason ? <div className="state-band">{t('calendar.empty.season')}</div> : baselineQuery.isError ? <div className="state-band state-band-error">{t('calendar.error')}</div> : activeSeason && baselineQuery.data && !baselineQuery.data.baseline ? <div className="state-band">{t('calendar.empty.baseline')}</div> : null}
      {filteredProjects.length === 0 ? <EmptyState title={t('calendar.empty.projects.title')} desc={t('calendar.empty.projects.desc')} action={<button type="button" className="btn btn-primary" onClick={() => onNavigate('settings')}>{t('calendar.drawer.editInSettings')}</button>} /> : null}
      {view === 'timeline' && filteredProjects.length > 0 && !anyStart ? <div className="state-band">{t('calendar.empty.noStarts')}</div> : null}
      {view === 'timeline' && outsideCount > 0 ? <div className="state-band">{t('calendar.outOfWindow', { count: outsideCount })}</div> : null}
      {hiddenCount > 0 ? <p className="calendar-footnote">{t('calendar.hiddenProjects', { count: hiddenCount })}</p> : null}
    </> : null}
    <CalendarDrawer selection={selection} today={today} canWrite={identity.canWrite} onClose={() => setSelection(null)} onNavigateSettings={() => onNavigate('settings')} />
  </div>;
}
