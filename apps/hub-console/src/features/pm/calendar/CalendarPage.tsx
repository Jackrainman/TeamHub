import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { HubApiClient } from '../../../api/client';
import type { ConsolePage, PageIdentityCtx } from '../../../console-pages';
import { useI18n } from '../../../i18n';
import { Button } from '../../../shared/ui/Button';
import { useQueryGuard } from '../../../shared/QueryGate';
import { MonthView } from './MonthView';
import { monthLabel } from './calendar-month';
import { CalendarDrawer, type CalendarSelection } from './CalendarDrawer';
import { CalendarEmptyHint } from './CalendarEmptyHint';
import { CalendarProjectDrawer } from './CalendarProjectDrawer';
import { CalendarScopeToggle } from './CalendarScopeToggle';
import { dateKeyOf } from './model';
import { useCalendarData, useTodayKey } from './hooks';

export function CalendarPage({ client, source, identity, onNavigate, todayOverride }: {
  client: HubApiClient;
  source: string;
  projectId: string;
  identity: PageIdentityCtx;
  onNavigate: (page: ConsolePage) => void;
  todayOverride?: string;
}): JSX.Element {
  const { t, lang } = useI18n();
  const today = useTodayKey(todayOverride);
  const [anchor, setAnchor] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }));
  const { projectsQuery, baselineQuery, activeSeason, filteredProjects, hiddenCount } = useCalendarData(client, source);
  const projects = useQueryGuard(projectsQuery, t('calendar.loading'), t('calendar.error'));
  const [selection, setSelection] = useState<CalendarSelection | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const anyStart = filteredProjects.some(project => dateKeyOf(project.startsAt));
  const emptyKind = filteredProjects.length === 0 ? 'no-projects' : !anyStart ? 'no-dates' : null;
  const lockHint = identity.canWrite ? null : t('identity.writeHint');

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
        <span className="calendar-legend">{t('calendar.legend.month')}</span>
      </div>
      <div className="calendar-controls">
        <nav className="calendar-month-nav" aria-label={t('calendar.month.label', { year: anchor.year, month: anchor.month })}>
          <button type="button" className="btn" data-action="prev" aria-label={t('calendar.month.prev')} onClick={previousMonth}>‹</button>
          <strong>{monthLabel(anchor.year, anchor.month, lang)}</strong>
          <button type="button" className="btn" data-action="next" aria-label={t('calendar.month.next')} onClick={nextMonth}>›</button>
          <button type="button" className="btn" data-action="today" aria-label={t('calendar.month.today')} onClick={() => setAnchor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) })}>{t('calendar.today')}</button>
        </nav>
        <CalendarScopeToggle />
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={16} aria-hidden="true" />}
          data-action="create-project"
          disabled={!identity.canWrite}
          title={lockHint ?? undefined}
          onClick={() => setCreateOpen(true)}
        >{t('calendar.project.create')}</Button>
      </div>
    </header>
    {projects ? <>
      {emptyKind ? <CalendarEmptyHint kind={emptyKind} count={filteredProjects.length} canWrite={identity.canWrite} lockHint={lockHint} onCreate={() => setCreateOpen(true)} /> : null}
      <MonthView year={anchor.year} month={anchor.month} projects={filteredProjects} today={today} onOpen={project => setSelection({ type: 'project', project })} />
      {!activeSeason ? <div className="state-band">{t('calendar.empty.season')}</div> : baselineQuery.isError ? <div className="state-band state-band-error">{t('calendar.error')}</div> : activeSeason && baselineQuery.data && !baselineQuery.data.baseline ? <div className="state-band">{t('calendar.empty.baseline')}</div> : null}
      {hiddenCount > 0 ? <p className="calendar-footnote">{t('calendar.hiddenProjects', { count: hiddenCount })}</p> : null}
    </> : null}
    <CalendarDrawer selection={selection} today={today} canWrite={identity.canWrite} onClose={() => setSelection(null)} onNavigateSettings={() => onNavigate('settings')} />
    <CalendarProjectDrawer client={client} open={createOpen} canWrite={identity.canWrite} onClose={() => setCreateOpen(false)} />
  </div>;
}
