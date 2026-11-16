import type { BaselineMilestonePublic, BaselineSegment, Project } from '@teamhub/hub-contracts';
import { useI18n, type Lang } from '../../../i18n';
import { bandGeometry, barGeometry, dateKeyOf, type AxisTick, type CalendarAxis, type CalendarMode } from './model';
import { TimelineBar } from './TimelineBar';
import { CalendarMilestone } from './CalendarMilestone';

export function MonthGrid({ axis, mode, projects, milestones, bands, today, projectId, onOpenProject, onOpenMilestone }: {
  axis: CalendarAxis;
  mode: CalendarMode;
  projects: Project[];
  milestones: BaselineMilestonePublic[];
  bands: BaselineSegment[];
  today: string;
  projectId: string;
  onOpenProject: (project: Project) => void;
  onOpenMilestone: (milestone: BaselineMilestonePublic) => void;
}): JSX.Element {
  const { t, lang } = useI18n();
  const ticks = axis.ticks;
  const tickCount = ticks.length;
  const todayLeft = axis.todayLeft === null ? null : axis.todayLeft * 100;
  return <div className={`calendar-grid-wrap calendar-grid-wrap--${mode}`}>
    <div className="calendar-grid" role="grid" aria-label={t('calendar.grid.aria')} data-mode={mode} data-axis-days={axis.days}>
      <div className="calendar-axis-label">{t('calendar.lane.projects')}</div>
      <div className="calendar-axis" role="row" aria-label={t('calendar.axis.aria')}>
        {ticks.map((tick) => <div className="calendar-axis-tick" key={tick.key} data-tick={mode} style={{ width: `${100 / tickCount}%` }}>
          <time dateTime={tick.key}>{formatTick(tick, mode, lang)}</time>
        </div>)}
      </div>
      <div className="calendar-lane-heading">{t('calendar.lane.projects')}</div>
      <div className="calendar-track calendar-project-track calendar-today-layer">
        <CalendarBands bands={bands} axis={axis} />
        <div className="calendar-grid-lines" aria-hidden="true">{ticks.map((tick) => <span key={tick.key} />)}</div>
        {todayLeft !== null ? <i className="calendar-today-line" style={{ left: `${todayLeft}%` }} title={t('calendar.today')}><span>{t('calendar.today')}</span></i> : null}
      </div>
      <div className="calendar-lane-heading">{t('calendar.lane.milestones')}</div>
      <div className="calendar-track calendar-milestone-track">
        <CalendarBands bands={bands} axis={axis} />
        <div className="calendar-grid-lines" aria-hidden="true">{ticks.map((tick) => <span key={tick.key} />)}</div>
        {todayLeft !== null ? <div className="calendar-today-line" style={{ left: `${todayLeft}%` }} aria-hidden="true" /> : null}
        {milestones.map((milestone) => <CalendarMilestone key={milestone.id} milestone={milestone} axis={axis} onOpen={() => onOpenMilestone(milestone)} />)}
      </div>
      {projects.map((project) => {
        const geometry = barGeometry(project, axis, today);
        const start = dateKeyOf(project.startsAt);
        return <div className="calendar-project-row calendar-lane" role="row" key={project.id} data-project-id={project.id} data-no-start={start ? 'false' : 'true'}>
          <div className="calendar-row-label">
            <button type="button" onClick={() => onOpenProject(project)} data-project-label={project.id}>{project.name}</button>
            {!start ? <span className="calendar-tag">{t('calendar.noStart')}</span> : null}
            {project.id === projectId ? <span className="calendar-tag calendar-tag--current">{t('calendar.current')}</span> : null}
          </div>
          <div className="calendar-track">
            <CalendarBands bands={bands} axis={axis} />
            <div className="calendar-grid-lines" aria-hidden="true">{ticks.map((tick) => <span key={tick.key} />)}</div>
            {todayLeft !== null ? <div className="calendar-today-line" style={{ left: `${todayLeft}%` }} aria-hidden="true" /> : null}
            {geometry ? <TimelineBar project={project} geometry={geometry} today={today} current={project.id === projectId} onOpen={() => onOpenProject(project)} /> : null}
          </div>
        </div>;
      })}
    </div>
  </div>;
}

const ENGLISH_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatTick(tick: AxisTick, mode: CalendarMode, lang: Lang): string {
  if (mode === 'week') return `${tick.month}/${tick.day}`;
  if (lang === 'en') return `${ENGLISH_MONTHS[tick.month - 1]}${tick.month === 1 ? ` ${tick.year}` : ''}`;
  return `${tick.month === 1 ? `${tick.year}年` : ''}${tick.month}月`;
}

function CalendarBands({ bands, axis }: { bands: BaselineSegment[]; axis: CalendarAxis }): JSX.Element {
  return <>{bands.map((band, index) => {
    const geometry = bandGeometry(band, axis);
    return geometry ? <span
      key={`${band.startsAt}-${band.endsAt}-${index}`}
      className="calendar-band"
      data-kind={band.kind}
      style={{ left: `${geometry.left * 100}%`, width: `${geometry.width * 100}%` }}
      title={band.label}
      aria-hidden="true"
    >{band.label}</span> : null;
  })}</>;
}
