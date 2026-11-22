import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';
import type { Task } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { buildMonthGrid, layoutWeekBars, statusToneOf } from './calendar-month';
import { dateKeyOf } from './model';
import { TaskBar } from './TaskBar';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const POPOVER_WIDTH = 264;

interface OverflowPanel { tasks: Task[]; left: number; top: number; anchorKey: string }

function rangeLabel(task: Task): string {
  const start = dateKeyOf(task.plannedStart);
  const end = dateKeyOf(task.plannedEnd) ?? start;
  if (!start) return '';
  return end && end !== start ? `${start.slice(5)} – ${end.slice(5)}` : start.slice(5);
}

export function MonthView({ year, month, tasks, today, canCreate, onOpen, onCreateDay }: {
  year: number; month: number; tasks: Task[]; today: string; canCreate: boolean;
  onOpen: (task: Task) => void; onCreateDay: (dateKey: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  const grid = useMemo(() => buildMonthGrid(year, month, today), [year, month, today]);
  const tasksById = useMemo(() => new Map(tasks.map(task => [task.id, task])), [tasks]);
  const unscheduled = tasks.filter(task => !dateKeyOf(task.plannedStart));
  const [overflow, setOverflow] = useState<OverflowPanel | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!overflow) return;
    popoverRef.current?.focus({ preventScroll: true });
    function close(): void { setOverflow(null); }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [overflow]);

  function openOverflow(event: ReactMouseEvent<HTMLButtonElement>, hidden: Task[], anchorKey: string): void {
    const rect = event.currentTarget.getBoundingClientRect();
    const height = Math.min(260, 44 + hidden.length * 34);
    const left = Math.max(8, Math.min(rect.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - 8));
    const top = rect.bottom + height + 8 > window.innerHeight
      ? Math.max(8, rect.top - height - 8)
      : rect.bottom + 6;
    setOverflow({ tasks: hidden, left, top, anchorKey });
  }

  return <section className="calendar-month-view" role="grid" aria-label={t('calendar.month.aria', { year, month })} data-today={today}>
    <div className="calendar-month-weekdays" role="row">{WEEKDAYS.map(weekday => <div className="calendar-month-weekday" role="columnheader" key={weekday}>{t(`calendar.weekday.${weekday}`)}</div>)}</div>
    <div className="calendar-month-weeks" role="rowgroup">
      {grid.weeks.map(week => {
        const layout = layoutWeekBars(tasks, week.weekStart, today);
        return <div className="calendar-month-week" role="row" data-week-start={week.weekStart} key={week.weekStart}>
          <div className="calendar-month-days">
            {week.days.map(day => <div className="calendar-month-day" role="gridcell" data-outside={!day.inMonth}
              data-today={day.isToday} data-weekend={day.weekend} data-date={day.key} key={day.key}>
              <button type="button" className="calendar-month-day-hit" data-action="create-on-day" data-date={day.key}
                disabled={!canCreate} title={canCreate ? t('calendar.month.createOn', { month: Number(day.key.slice(5, 7)), day: day.day }) : undefined}
                aria-label={t('calendar.month.createOn', { month: Number(day.key.slice(5, 7)), day: day.day })}
                onClick={() => onCreateDay(day.key)}>
                <time className="calendar-month-date" dateTime={day.key}>{day.day}</time>
                <span className="calendar-month-day-add" aria-hidden="true"><Plus size={13} strokeWidth={2.4} /></span>
              </button>
            </div>)}
          </div>
          <div className="calendar-month-lanes">
            {layout.bars.map(bar => {
              const task = tasksById.get(bar.taskId);
              return task ? <TaskBar key={`${week.weekStart}-${bar.taskId}`} task={task} bar={bar} onOpen={() => onOpen(task)} /> : null;
            })}
            {layout.hidden.length ? <button type="button" className="calendar-month-overflow"
              data-week-start={week.weekStart} aria-haspopup="dialog" aria-expanded={overflow?.anchorKey === week.weekStart}
              title={t('calendar.month.overflowTitle', { count: layout.hidden.length, names: layout.hidden.map(task => task.title).join(', ') })}
              onClick={event => openOverflow(event, layout.hidden, week.weekStart)}>
              {t('calendar.month.overflow', { count: layout.hidden.length })}
            </button> : null}
          </div>
        </div>;
      })}
    </div>
    {unscheduled.length ? <div className="calendar-month-unstarted">
      <span className="calendar-month-unstarted-title">{t('calendar.month.unscheduledTitle', { count: unscheduled.length })}</span>
      <div className="calendar-month-unstarted-list">
        {unscheduled.map(task => <button type="button" className="calendar-month-chip" data-task-id={task.id}
          data-status={statusToneOf(task.status)} key={task.id} title={task.title} onClick={() => onOpen(task)}>
          <span className="calendar-month-chip-dot" aria-hidden="true" />
          <span className="calendar-month-chip-label">{task.title}</span>
        </button>)}
      </div>
    </div> : null}
    {overflow ? createPortal(<>
      <div className="calendar-overflow-backdrop" aria-hidden="true" onClick={() => setOverflow(null)} />
      <div className="calendar-overflow-popover" role="dialog" tabIndex={-1} ref={popoverRef}
        aria-label={t('calendar.month.overflowHead', { count: overflow.tasks.length })}
        style={{ left: overflow.left, top: overflow.top, width: POPOVER_WIDTH }}>
        <div className="calendar-overflow-head">
          <span>{t('calendar.month.overflowHead', { count: overflow.tasks.length })}</span>
          <button type="button" className="calendar-overflow-close" aria-label={t('calendar.month.overflowClose')}
            onClick={() => setOverflow(null)}>×</button>
        </div>
        <div className="calendar-overflow-list">
          {overflow.tasks.map(task => <button type="button" className="calendar-overflow-item" data-task-id={task.id}
            data-status={statusToneOf(task.status)} key={task.id}
            onClick={() => { setOverflow(null); onOpen(task); }}>
            <span className="calendar-overflow-dot" aria-hidden="true" />
            <span className="calendar-overflow-title">{task.title}</span>
            <span className="calendar-overflow-range">{rangeLabel(task)}</span>
          </button>)}
        </div>
      </div>
    </>, document.body) : null}
  </section>;
}
