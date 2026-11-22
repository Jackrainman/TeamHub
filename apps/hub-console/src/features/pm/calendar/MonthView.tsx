import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';
import type { Task } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { buildMonthGrid, layoutWeekBars, statusToneOf, type MonthBar } from './calendar-month';
import {
  DRAG_THRESHOLD, dayKeyAtPoint, dragModeAt, rangeForDrag, rangeLabel, rangeOf, type DragMode,
} from './drag-schedule';
import { dateKeyOf } from './model';
import { TaskBar } from './TaskBar';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const POPOVER_WIDTH = 264;
/** 拖拽结束后短暂屏蔽 click，避免“拖完顺手开了详情/新建”。 */
const CLICK_GUARD_MS = 350;

interface OverflowPanel { tasks: Task[]; left: number; top: number; anchorKey: string }

interface DragVisual {
  task: Task; mode: DragMode; start: string; end: string; dropKey: string | null;
  ghost: { left: number; top: number; width: number; height: number };
}

interface DragSession {
  task: Task; pointerId: number; mode: DragMode;
  startX: number; startY: number; grabX: number; grabY: number;
  originStart: string; originEnd: string; anchorKey: string;
  width: number; height: number; active: boolean;
  schedule: { plannedStart: string; plannedEnd: string };
}

function rangeLabelOf(task: Task): string {
  const start = dateKeyOf(task.plannedStart);
  const end = dateKeyOf(task.plannedEnd) ?? start;
  if (!start) return '';
  return end && end !== start ? `${start.slice(5)} – ${end.slice(5)}` : start.slice(5);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function MonthView({ year, month, tasks, today, canCreate, canSchedule, onOpen, onCreateDay, onSchedule }: {
  year: number; month: number; tasks: Task[]; today: string; canCreate: boolean; canSchedule: boolean;
  onOpen: (task: Task) => void; onCreateDay: (dateKey: string) => void;
  onSchedule: (task: Task, plannedStart: string, plannedEnd: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  const grid = useMemo(() => buildMonthGrid(year, month, today), [year, month, today]);
  const tasksById = useMemo(() => new Map(tasks.map(task => [task.id, task])), [tasks]);
  const unscheduled = tasks.filter(task => !dateKeyOf(task.plannedStart));
  const [overflow, setOverflow] = useState<OverflowPanel | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const suppressClickUntil = useRef(0);
  const [drag, setDrag] = useState<DragVisual | null>(null);

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

  // 卸载时若仍在拖拽，摘掉全局监听，避免泄漏。
  useEffect(() => () => { cleanupRef.current?.(); }, []);

  function openTask(task: Task): void {
    if (Date.now() < suppressClickUntil.current) return;
    onOpen(task);
  }

  function openOverflow(event: ReactMouseEvent<HTMLButtonElement>, hidden: Task[], anchorKey: string): void {
    if (Date.now() < suppressClickUntil.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const height = Math.min(260, 44 + hidden.length * 34);
    const left = Math.max(8, Math.min(rect.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - 8));
    const top = rect.bottom + height + 8 > window.innerHeight
      ? Math.max(8, rect.top - height - 8)
      : rect.bottom + 6;
    setOverflow({ tasks: hidden, left, top, anchorKey });
  }

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>, task: Task, bar: MonthBar): void {
    if (!canSchedule || sessionRef.current) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const container = containerRef.current;
    const range = rangeOf(task);
    const rect = event.currentTarget.getBoundingClientRect();
    if (!container || !range || rect.width <= 0) return;
    const root: HTMLElement = container;
    const session: DragSession = {
      task, pointerId: event.pointerId,
      mode: dragModeAt(event.clientX - rect.left, rect.width, bar.clippedStart, bar.clippedEnd),
      startX: event.clientX, startY: event.clientY,
      grabX: event.clientX - rect.left, grabY: event.clientY - rect.top,
      originStart: range.plannedStart, originEnd: range.plannedEnd,
      anchorKey: dayKeyAtPoint(container, event.clientX, event.clientY) ?? range.plannedStart,
      width: Math.max(rect.width, 208), height: rect.height, active: false,
      schedule: range,
    };
    sessionRef.current = session;

    function removeListeners(): void {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('calendar-dragging');
    }

    function finish(commit: boolean): void {
      removeListeners();
      cleanupRef.current = null;
      sessionRef.current = null;
      setDrag(null);
      if (!session.active) return;
      suppressClickUntil.current = Date.now() + CLICK_GUARD_MS;
      const { plannedStart, plannedEnd } = session.schedule;
      if (commit && (plannedStart !== session.originStart || plannedEnd !== session.originEnd)) {
        onSchedule(session.task, plannedStart, plannedEnd);
      }
    }

    function onMove(moveEvent: PointerEvent): void {
      if (moveEvent.pointerId !== session.pointerId) return;
      if (!session.active
        && Math.hypot(moveEvent.clientX - session.startX, moveEvent.clientY - session.startY) <= DRAG_THRESHOLD) return;
      if (!session.active) {
        session.active = true;
        document.body.classList.add('calendar-dragging');
        window.getSelection()?.removeAllRanges();
      }
      moveEvent.preventDefault();
      const target = dayKeyAtPoint(root, moveEvent.clientX, moveEvent.clientY);
      if (!target) return;
      session.schedule = rangeForDrag(session.mode, session.originStart, session.originEnd, session.anchorKey, target);
      setDrag({
        task, mode: session.mode, start: session.schedule.plannedStart, end: session.schedule.plannedEnd,
        dropKey: target,
        ghost: {
          left: clamp(moveEvent.clientX - session.grabX, 0, Math.max(0, window.innerWidth - session.width)),
          top: clamp(moveEvent.clientY - session.grabY, 0, Math.max(0, window.innerHeight - session.height)),
          width: session.width, height: session.height,
        },
      });
    }
    function onUp(upEvent: PointerEvent): void {
      if (upEvent.pointerId !== session.pointerId) return;
      finish(true);
    }
    function onCancel(): void { finish(false); }
    function onKeyDown(keyEvent: KeyboardEvent): void {
      if (keyEvent.key === 'Escape') { keyEvent.preventDefault(); finish(false); }
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKeyDown);
    cleanupRef.current = removeListeners;
  }

  const draggingTaskId = drag?.task.id ?? null;

  return <section ref={containerRef} className="calendar-month-view" role="grid" aria-label={t('calendar.month.aria', { year, month })} data-today={today}>
    <div className="calendar-month-weekdays" role="row">{WEEKDAYS.map(weekday => <div className="calendar-month-weekday" role="columnheader" key={weekday}>{t(`calendar.weekday.${weekday}`)}</div>)}</div>
    <div className="calendar-month-weeks" role="rowgroup">
      {grid.weeks.map(week => {
        const layout = layoutWeekBars(tasks, week.weekStart, today);
        return <div className="calendar-month-week" role="row" data-week-start={week.weekStart} key={week.weekStart}>
          <div className="calendar-month-days">
            {week.days.map(day => <div className="calendar-month-day" role="gridcell" data-outside={!day.inMonth}
              data-today={day.isToday} data-weekend={day.weekend} data-date={day.key} key={day.key}
              data-drop-target={drag?.dropKey === day.key ? 'true' : undefined}>
              <button type="button" className="calendar-month-day-hit" data-action="create-on-day" data-date={day.key}
                disabled={!canCreate} title={canCreate ? t('calendar.month.createOn', { month: Number(day.key.slice(5, 7)), day: day.day }) : undefined}
                aria-label={t('calendar.month.createOn', { month: Number(day.key.slice(5, 7)), day: day.day })}
                onClick={() => { if (Date.now() >= suppressClickUntil.current) onCreateDay(day.key); }}>
                <time className="calendar-month-date" dateTime={day.key}>{day.day}</time>
                <span className="calendar-month-day-add" aria-hidden="true"><Plus size={13} strokeWidth={2.4} /></span>
              </button>
            </div>)}
          </div>
          <div className="calendar-month-lanes">
            {layout.bars.map(bar => {
              const task = tasksById.get(bar.taskId);
              return task ? <TaskBar key={`${week.weekStart}-${bar.taskId}`} task={task} bar={bar}
                schedulable={canSchedule} dragging={draggingTaskId === task.id}
                onDragStart={beginDrag} onOpen={() => openTask(task)} /> : null;
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
          data-status={statusToneOf(task.status)} key={task.id} title={task.title} onClick={() => openTask(task)}>
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
            onClick={() => { setOverflow(null); openTask(task); }}>
            <span className="calendar-overflow-dot" aria-hidden="true" />
            <span className="calendar-overflow-title">{task.title}</span>
            <span className="calendar-overflow-range">{rangeLabelOf(task)}</span>
          </button>)}
        </div>
      </div>
    </>, document.body) : null}
    {drag ? createPortal(<div className="calendar-drag-ghost" data-mode={drag.mode} data-task-id={drag.task.id}
      aria-hidden="true" style={{ left: drag.ghost.left, top: drag.ghost.top, width: drag.ghost.width, height: drag.ghost.height }}>
      <span className="calendar-drag-ghost__title">{drag.task.title}</span>
      <span className="calendar-drag-ghost__range">{rangeLabel(drag.start, drag.end)}</span>
    </div>, document.body) : null}
  </section>;
}
