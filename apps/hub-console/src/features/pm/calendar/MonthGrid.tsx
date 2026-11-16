import type { BaselineMilestonePublic, Project } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { barGeometry, dateKeyOf, type CalendarAxis, type CalendarMode } from './model';
import { ProjectBar } from './ProjectBar';
import { CalendarMilestone } from './CalendarMilestone';

export function MonthGrid({ axis, mode, projects, milestones, today, projectId, onOpenProject, onOpenMilestone }: {
  axis: CalendarAxis;
  mode: CalendarMode;
  projects: Project[];
  milestones: BaselineMilestonePublic[];
  today: string;
  projectId: string;
  onOpenProject: (project: Project) => void;
  onOpenMilestone: (milestone: BaselineMilestonePublic) => void;
}): JSX.Element {
  const { t } = useI18n();
  const ticks = axis.ticks;
  const tickCount = ticks.length;
  const todayLeft = axis.todayLeft === null ? null : axis.todayLeft * 100;
  return <div className={`calendar-grid-wrap calendar-grid-wrap--${mode}`}>
    <div className="calendar-grid" role="grid" aria-label={t('calendar.grid.aria')}>
      <div className="calendar-axis-label">{t('calendar.lane.projects')}</div>
      <div className="calendar-axis" role="row" aria-label={t('calendar.axis.aria')}>
        {ticks.map((tick) => <div className="calendar-axis-tick" key={tick.key} style={{ width: `${100 / tickCount}%` }}>
          <time dateTime={tick.key}>{tick.key.slice(5)}</time>
        </div>)}
      </div>
      <div className="calendar-lane-heading">{t('calendar.lane.projects')}</div>
      <div className="calendar-track calendar-project-track">
        <div className="calendar-grid-lines" aria-hidden="true">{ticks.map((tick) => <span key={tick.key} />)}</div>
        {todayLeft !== null ? <div className="calendar-today-line" style={{ left: `${todayLeft}%` }} title={t('calendar.today')}><span>{t('calendar.today')}</span></div> : null}
      </div>
      <div className="calendar-lane-heading">{t('calendar.lane.milestones')}</div>
      <div className="calendar-track calendar-milestone-track">
        <div className="calendar-grid-lines" aria-hidden="true">{ticks.map((tick) => <span key={tick.key} />)}</div>
        {todayLeft !== null ? <div className="calendar-today-line" style={{ left: `${todayLeft}%` }} aria-hidden="true" /> : null}
        {milestones.map((milestone) => <CalendarMilestone key={milestone.id} milestone={milestone} axis={axis} onOpen={() => onOpenMilestone(milestone)} />)}
      </div>
      {projects.map((project) => {
        const geometry = barGeometry(project, axis, today);
        const start = dateKeyOf(project.startsAt);
        return <div className="calendar-project-row" role="row" key={project.id}>
          <div className="calendar-row-label">
            <button type="button" onClick={() => onOpenProject(project)} data-project-label={project.id}>{project.name}</button>
            {!start ? <span className="calendar-tag">{t('calendar.noStart')}</span> : null}
            {project.id === projectId ? <span className="calendar-tag calendar-tag--current">{t('calendar.current')}</span> : null}
          </div>
          <div className="calendar-track">
            <div className="calendar-grid-lines" aria-hidden="true">{ticks.map((tick) => <span key={tick.key} />)}</div>
            {todayLeft !== null ? <div className="calendar-today-line" style={{ left: `${todayLeft}%` }} aria-hidden="true" /> : null}
            {geometry ? <ProjectBar project={project} geometry={geometry} today={today} onOpen={() => onOpenProject(project)} /> : null}
          </div>
        </div>;
      })}
    </div>
  </div>;
}
