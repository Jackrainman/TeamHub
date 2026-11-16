import type { Project } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { colorIndexOf, type MonthBar } from './calendar-month';

export function ProjectBar({ project, bar, today, onOpen }: {
  project: Project;
  bar: MonthBar;
  today: string;
  onOpen: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const start = project.startsAt?.slice(0, 10) ?? '';
  const end = bar.openEnded ? t('calendar.ongoing') : project.endsAt?.slice(0, 10) ?? today;
  const range = `${start} → ${end}`;
  const clipped = bar.clippedStart || bar.clippedEnd ? ` · ${t('calendar.clipped')}` : '';
  return <button
    type="button"
    className="calendar-project-bar"
    style={{ gridColumn: `${bar.startCol + 1} / ${bar.endCol + 2}`, gridRow: bar.lane + 1 }}
    data-project-id={project.id}
    data-lane={bar.lane}
    data-continue-start={bar.clippedStart}
    data-continue-end={bar.clippedEnd}
    data-open-ended={bar.openEnded}
    data-cal={colorIndexOf(project.id) + 1}
    title={`${project.name} · ${range}${clipped}`}
    aria-label={`${project.name}, ${range}`}
    onClick={onOpen}
  >
    <span>{project.name}</span>
  </button>;
}
