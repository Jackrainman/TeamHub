import type { Task } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { colorIndexOf, type MonthBar } from './calendar-month';

export function TaskBar({ task, bar, onOpen }: {
  task: Task; bar: MonthBar; onOpen: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const start = task.plannedStart?.slice(0, 10) ?? '';
  const end = task.plannedEnd?.slice(0, 10) ?? start;
  const range = `${start} → ${end}`;
  const clipped = bar.clippedStart || bar.clippedEnd ? ` · ${t('calendar.clipped')}` : '';
  return <button type="button" className="calendar-project-bar"
    style={{ gridColumn: `${bar.startCol + 1} / ${bar.endCol + 2}`, gridRow: bar.lane + 1 }}
    data-task-id={task.id} data-lane={bar.lane}
    data-continue-start={bar.clippedStart} data-continue-end={bar.clippedEnd}
    data-cal={colorIndexOf(task.id) + 1}
    title={`${task.title} · ${range}${clipped}`} aria-label={`${task.title}, ${range}`} onClick={onOpen}>
    <span>{task.title}</span>
  </button>;
}
