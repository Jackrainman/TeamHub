import { useMemo } from 'react';
import type { Task } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { buildMonthGrid, layoutWeekBars } from './calendar-month';
import { dateKeyOf } from './model';
import { TaskBar } from './TaskBar';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export function MonthView({ year, month, tasks, today, onOpen }: {
  year: number; month: number; tasks: Task[]; today: string; onOpen: (task: Task) => void;
}): JSX.Element {
  const { t } = useI18n();
  const grid = useMemo(() => buildMonthGrid(year, month, today), [year, month, today]);
  const tasksById = useMemo(() => new Map(tasks.map(task => [task.id, task])), [tasks]);
  const unscheduled = tasks.filter(task => !dateKeyOf(task.plannedStart));
  return <section className="calendar-month-view" role="grid" aria-label={t('calendar.month.aria', { year, month })} data-today={today}>
    <div className="calendar-month-weekdays" role="row">{WEEKDAYS.map(weekday => <div role="columnheader" key={weekday}>{t(`calendar.weekday.${weekday}`)}</div>)}</div>
    {grid.weeks.map(week => {
      const layout = layoutWeekBars(tasks, week.weekStart, today);
      return <div className="calendar-month-week" role="row" data-week-start={week.weekStart} key={week.weekStart}>
        <div className="calendar-month-days">{week.days.map(day => <div className="calendar-month-day" role="gridcell" data-outside={!day.inMonth} data-today={day.isToday} key={day.key}><time dateTime={day.key}>{day.day}</time></div>)}</div>
        <div className="calendar-month-lanes">
          {layout.bars.map(bar => {
            const task = tasksById.get(bar.taskId);
            return task ? <TaskBar key={`${week.weekStart}-${bar.taskId}`} task={task} bar={bar} onOpen={() => onOpen(task)} /> : null;
          })}
          {layout.hidden.length ? <span className="calendar-month-overflow" role="note" title={t('calendar.month.overflowTitle', { count: layout.hidden.length, names: layout.hidden.map(task => task.title).join(', ') })}>{t('calendar.month.overflow', { count: layout.hidden.length })}</span> : null}
        </div>
      </div>;
    })}
    {unscheduled.length ? <div className="calendar-month-unstarted"><span>{t('calendar.month.unscheduled')}</span>
      {unscheduled.map(task => <button type="button" data-task-id={task.id} key={task.id} onClick={() => onOpen(task)}>{task.title}</button>)}
    </div> : null}
  </section>;
}
