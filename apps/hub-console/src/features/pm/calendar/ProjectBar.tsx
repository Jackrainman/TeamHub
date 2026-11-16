import type { Project } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import type { BarGeometry } from './model';

export function ProjectBar({ project, geometry, today, current, onOpen }: {
  project: Project;
  geometry: BarGeometry;
  today: string;
  current: boolean;
  onOpen: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const end = geometry.openEnded ? t('calendar.ongoing') : project.endsAt?.slice(0, 10) ?? today;
  return <button
    type="button"
    className={`calendar-bar${geometry.openEnded ? ' calendar-bar--open' : ''}${current ? ' calendar-bar--current' : ''}`}
    style={{ left: `${geometry.left * 100}%`, width: `${geometry.width * 100}%` }}
    data-project-id={project.id}
    data-open-ended={geometry.openEnded ? 'true' : undefined}
    data-clipped={geometry.clippedStart || geometry.clippedEnd ? 'true' : undefined}
    data-clipped-start={geometry.clippedStart ? 'true' : undefined}
    data-clipped-end={geometry.clippedEnd ? 'true' : undefined}
    title={`${project.name} · ${project.startsAt?.slice(0, 10)} → ${end}${geometry.clippedStart || geometry.clippedEnd ? ` · ${t('calendar.clipped')}` : ''}`}
    aria-label={`${project.name}, ${project.startsAt?.slice(0, 10)} → ${end}`}
    onClick={onOpen}
  >
    <span className="calendar-bar-name">{project.name}</span>
  </button>;
}
