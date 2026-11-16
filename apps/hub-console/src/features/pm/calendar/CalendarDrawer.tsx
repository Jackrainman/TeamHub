import type { BaselineMilestonePublic, Project, Season } from '@teamhub/hub-contracts';
import { SideDrawer } from '../../../components/SideDrawer';
import { useI18n } from '../../../i18n';
import { dateKeyOf, dayNumber, STAGE_LABEL_KEYS } from './model';

export type CalendarSelection =
  | { type: 'project'; project: Project }
  | { type: 'milestone'; milestone: BaselineMilestonePublic; season: Season | null };

export function CalendarDrawer({ selection, today, onClose, onNavigateSettings }: {
  selection: CalendarSelection | null;
  today: string;
  onClose: () => void;
  onNavigateSettings: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const title = selection?.type === 'project'
    ? selection.project.name
    : selection ? `${t('calendar.drawer.milestone')} · ${selection.milestone.title}` : '';
  return <SideDrawer open={selection !== null} onClose={onClose} title={title}>
    {selection?.type === 'project' ? <ProjectDetails project={selection.project} today={today} /> : null}
    {selection?.type === 'milestone' ? <dl className="calendar-details">
      <Detail label={t('calendar.drawer.milestone')} value={selection.milestone.title} />
      <Detail label={t('calendar.drawer.season')} value={selection.season?.name ?? '—'} />
      <Detail label={t('calendar.drawer.kind')} value={t(`calendar.drawer.kind.${selection.milestone.kind}`)} />
      <Detail label={t('calendar.drawer.plannedAt')} value={selection.milestone.plannedAt.slice(0, 10)} />
      <Detail label={t('calendar.drawer.stage')} value={selection.milestone.stage ? t(STAGE_LABEL_KEYS[selection.milestone.stage]) : '—'} />
      <Detail label={t('calendar.drawer.version')} value={selection.milestone.robotVersion ?? '—'} />
      <Detail label={t('calendar.drawer.status')} value={t(`calendar.drawer.status.${selection.milestone.status}`)} />
      {selection.milestone.note ? <Detail label={t('calendar.drawer.note')} value={selection.milestone.note} /> : null}
    </dl> : null}
    <button type="button" className="btn" onClick={onNavigateSettings}>{t('calendar.drawer.editInSettings')}</button>
  </SideDrawer>;
}

function ProjectDetails({ project, today }: { project: Project; today: string }): JSX.Element {
  const { t } = useI18n();
  const start = dateKeyOf(project.startsAt);
  const end = dateKeyOf(project.endsAt);
  const duration = start ? dayNumber(end ?? today) - dayNumber(start) + 1 : null;
  return <dl className="calendar-details">
    <Detail label={t('calendar.drawer.project')} value={project.name} />
    <Detail label={t('calendar.drawer.range')} value={`${start ?? t('calendar.noStart')} → ${end ?? t('calendar.ongoing')}`} />
    {duration !== null && duration > 0 ? <Detail label={t('calendar.drawer.duration', { days: duration })} value={`${duration}`} /> : null}
  </dl>;
}

function Detail({ label, value }: { label: string; value: string }): JSX.Element {
  return <><dt>{label}</dt><dd>{value}</dd></>;
}
