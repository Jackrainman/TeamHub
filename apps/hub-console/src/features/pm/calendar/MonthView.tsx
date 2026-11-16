// Grid lines map directly to inclusive day columns, so spanning bars need no percentage math;
// column gaps remain inside each span and adjacent bars never overlap one another's edges.
import { useMemo } from 'react';
import type { Project } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { buildMonthGrid, layoutWeekBars } from './calendar-month';
import { dateKeyOf } from './model';
import { ProjectBar } from './ProjectBar';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export function MonthView({ year, month, projects, today, onOpen }: {
  year: number;
  month: number;
  projects: Project[];
  today: string;
  onOpen: (project: Project) => void;
}): JSX.Element {
  const { t } = useI18n();
  const grid = useMemo(() => buildMonthGrid(year, month, today), [year, month, today]);
  const projectsById = useMemo(() => new Map(projects.map(project => [project.id, project])), [projects]);
  const noStart = projects.filter(project => !dateKeyOf(project.startsAt));
  return <section className="calendar-month-view" role="grid" aria-label={t('calendar.month.aria', { year, month })} data-today={today}>
    <div className="calendar-month-weekdays" role="row">
      {WEEKDAYS.map(weekday => <div role="columnheader" key={weekday}>{t(`calendar.weekday.${weekday}`)}</div>)}
    </div>
    {grid.weeks.map(week => {
      const layout = layoutWeekBars(projects, week.weekStart, today);
      return <div className="calendar-month-week" role="row" data-week-start={week.weekStart} key={week.weekStart}>
        <div className="calendar-month-days">
          {week.days.map(day => <div
            className="calendar-month-day"
            role="gridcell"
            data-outside={!day.inMonth}
            data-today={day.isToday}
            key={day.key}
          ><time dateTime={day.key}>{day.day}</time></div>)}
        </div>
        <div className="calendar-month-lanes">
          {layout.bars.map(bar => {
            const project = projectsById.get(bar.projectId);
            return project ? <ProjectBar
              key={`${week.weekStart}-${bar.projectId}`}
              project={project}
              bar={bar}
              today={today}
              onOpen={() => onOpen(project)}
            /> : null;
          })}
          {layout.hidden.length ? <span
            className="calendar-month-overflow"
            role="note"
            title={t('calendar.month.overflowTitle', { count: layout.hidden.length, names: layout.hidden.map(project => project.name).join(', ') })}
          >{t('calendar.month.overflow', { count: layout.hidden.length })}</span> : null}
        </div>
      </div>;
    })}
    {noStart.length ? <div className="calendar-month-unstarted">
      <span>{t('calendar.month.unstarted')}</span>
      {noStart.map(project => <button type="button" data-project-id={project.id} key={project.id} onClick={() => onOpen(project)}>{project.name}</button>)}
    </div> : null}
  </section>;
}
