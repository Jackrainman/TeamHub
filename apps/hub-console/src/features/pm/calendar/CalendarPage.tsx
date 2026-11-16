import { useMemo, useState } from 'react';
import type { HubApiClient } from '../../../api/client';
import type { ConsolePage, PageIdentityCtx } from '../../../console-pages';
import { useI18n } from '../../../i18n';
import { EmptyState } from '../../../shared/EmptyState';
import { useQueryGuard } from '../../../shared/QueryGate';
import { MonthGrid } from './MonthGrid';
import { buildAxis, dateKeyOf, barGeometry, type CalendarMode } from './model';
import { useCalendarData, useTodayKey } from './hooks';

export function CalendarPage({ client, source, projectId, identity, onNavigate, todayOverride }: {
  client: HubApiClient;
  source: string;
  projectId: string;
  identity: PageIdentityCtx;
  onNavigate: (page: ConsolePage) => void;
  todayOverride?: string;
}): JSX.Element {
  const { t } = useI18n();
  const [mode, setMode] = useState<CalendarMode>('month');
  const today = useTodayKey(todayOverride);
  const { projectsQuery, activeSeason, filteredProjects, hiddenCount } = useCalendarData(client, source);
  const projects = useQueryGuard(projectsQuery, t('calendar.loading'), t('calendar.error'));
  const axis = useMemo(() => buildAxis(mode, today, activeSeason), [mode, today, activeSeason]);
  const outsideCount = filteredProjects.filter((project) => dateKeyOf(project.startsAt) && !barGeometry(project, axis, today)).length;
  const anyStart = filteredProjects.some((project) => dateKeyOf(project.startsAt));
  void identity;
  void onNavigate;
  return <div className="calendar-page" data-today={today}>
    <header className="calendar-toolbar">
      <div>
        <h1>{t('expected.nav.calendar')}</h1>
        <span className="calendar-legend">{t('calendar.legend')}</span>
      </div>
      <div className="calendar-mode" role="group" aria-label={t('calendar.mode.aria')}>
        {(['month', 'week'] as const).map((value) => <button type="button" key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{t(`calendar.mode.${value}`)}</button>)}
      </div>
    </header>
    {projects ? <>
      <MonthGrid axis={axis} mode={mode} projects={filteredProjects} today={today} projectId={projectId} onOpenProject={() => undefined} />
      {filteredProjects.length === 0 ? <EmptyState title={t('calendar.empty.projects.title')} desc={t('calendar.empty.projects.desc')} action={<button type="button" className="btn btn-primary" onClick={() => onNavigate('settings')}>{t('calendar.drawer.editInSettings')}</button>} /> : null}
      {filteredProjects.length > 0 && !anyStart ? <div className="state-band">{t('calendar.empty.noStarts')}</div> : null}
      {outsideCount > 0 ? <div className="state-band">{t('calendar.outOfWindow', { count: outsideCount })}</div> : null}
      {hiddenCount > 0 ? <p className="calendar-footnote">{t('calendar.hiddenProjects', { count: hiddenCount })}</p> : null}
    </> : null}
  </div>;
}
