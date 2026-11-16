import type { BaselineMilestonePublic } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { milestoneLeft, STAGE_LABEL_KEYS, type CalendarAxis } from './model';

export function CalendarMilestone({ milestone, axis, onOpen }: {
  milestone: BaselineMilestonePublic;
  axis: CalendarAxis;
  onOpen: () => void;
}): JSX.Element | null {
  const { t } = useI18n();
  const left = milestoneLeft(milestone.plannedAt, axis);
  if (left === null) return null;
  const stage = milestone.stage ? t(STAGE_LABEL_KEYS[milestone.stage]) : null;
  const label = `${milestone.title}, ${milestone.plannedAt.slice(0, 10)}, ${t(`calendar.drawer.status.${milestone.status}`)}`;
  return <button
    type="button"
    className={`calendar-milestone calendar-milestone--${milestone.status}${milestone.kind === 'gate' ? ' calendar-milestone--gate' : ''}`}
    style={{ left: `${left * 100}%` }}
    data-milestone-id={milestone.id}
    data-kind={milestone.kind}
    data-status={milestone.status}
    aria-label={label}
    title={`${milestone.title}${stage ? ` · ${stage}` : ''} · ${milestone.plannedAt.slice(0, 10)}`}
    onClick={onOpen}
  ><span aria-hidden="true" /></button>;
}
