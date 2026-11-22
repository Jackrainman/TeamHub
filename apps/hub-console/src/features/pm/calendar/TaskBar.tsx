import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Task } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { statusToneOf, type MonthBar } from './calendar-month';

export function TaskBar({ task, bar, schedulable, dragging, onOpen, onDragStart }: {
  task: Task; bar: MonthBar; schedulable: boolean; dragging: boolean;
  onOpen: () => void;
  onDragStart: (event: ReactPointerEvent<HTMLButtonElement>, task: Task, bar: MonthBar) => void;
}): JSX.Element {
  const { t } = useI18n();
  const start = task.plannedStart?.slice(0, 10) ?? '';
  const end = task.plannedEnd?.slice(0, 10) ?? start;
  const range = `${start} → ${end}`;
  const clipped = bar.clippedStart || bar.clippedEnd ? ` · ${t('calendar.clipped')}` : '';
  return <button type="button" className="calendar-project-bar"
    style={{ gridColumn: `${bar.startCol + 1} / ${bar.endCol + 2}`, gridRow: bar.lane + 1 }}
    data-task-id={task.id} data-lane={bar.lane} data-status={statusToneOf(task.status)}
    data-continue-start={bar.clippedStart} data-continue-end={bar.clippedEnd}
    data-schedulable={schedulable} data-dragging={dragging}
    title={`${task.title} · ${range}${clipped}${schedulable ? ` · ${t('calendar.drag.hint')}` : ''}`}
    aria-label={`${task.title}, ${range}`}
    onPointerDown={event => { if (schedulable) onDragStart(event, task, bar); }}
    onClick={onOpen}>
    <span className="calendar-project-bar__title">{task.title}</span>
  </button>;
}
