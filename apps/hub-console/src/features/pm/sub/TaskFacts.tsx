import { factTime } from '../week/format';
import type { MemberPublic, TaskAcceptanceState, TaskWithMeta } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { memberOptionLabel } from '../../../shared/lib/identity-utils';
import { formatDay } from './constants';

export function TaskFacts({ task, members, acceptance }: {
  task: TaskWithMeta; members: MemberPublic[]; acceptance: TaskAcceptanceState;
}) {
  const { t } = useI18n();
  const ownerName = task.ownerId ? memberOptionLabel(members, task.ownerId) : null;
  const rejected = task.status !== 'done' && task.reviewNote != null
    && task.activity?.some(event => event.kind === 'rejected');
  return <dl className="task-detail__facts">
    {ownerName ? <div className="task-detail__fact"><dt>{t('pool.fact.owner')}</dt><dd>{ownerName}</dd></div> : null}
    {task.claimedAt ? <div className="task-detail__fact"><dt>{t('pool.fact.claimed')}</dt><dd>{formatDay(task.claimedAt)}</dd></div> : null}
    {task.plannedStart || task.plannedEnd ? <div className="task-detail__fact"><dt>{t('calendar.drawer.range')}</dt><dd>{task.plannedStart ?? '—'} → {task.plannedEnd ?? '—'}</dd></div> : null}
    {task.status === 'done' && task.completedBy ? <div className="task-detail__fact"><dt>{t('pool.fact.completed')}</dt><dd>{task.completedBy.displayName} {task.completedAt && factTime(task.completedAt)}</dd></div> : null}
    {acceptance === 'accepted' && task.reviewedBy ? <div className="task-detail__fact"><dt>{t('pool.fact.reviewed')}</dt><dd>{task.reviewedBy.displayName} {task.reviewedAt && factTime(task.reviewedAt)}{task.reviewNote ? ` · ${task.reviewNote}` : ''}</dd></div> : null}
    {rejected ? <div className="task-detail__fact task-detail__fact--warn"><dt>{t('pool.fact.rejected')}</dt><dd>{task.reviewNote}</dd></div> : null}
  </dl>;
}
