import { factTime } from '../week/format';
import type {
  MemberPublic,
  TaskAcceptanceState,
  TaskWithMeta,
} from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { memberOptionLabel } from '../../../shared/lib/identity-utils';
import { formatDay } from './constants';

export function TaskFacts({
  task,
  members,
  acceptance,
}: {
  task: TaskWithMeta;
  members: MemberPublic[];
  acceptance: TaskAcceptanceState;
}) {
  const { t } = useI18n();
  const ownerName = task.ownerId ? memberOptionLabel(members, task.ownerId) : null;
  const previousOwnerNames = task.previousOwnerIds.map((id) => memberOptionLabel(members, id));
  const rejected =
    task.status !== 'done' && task.reviewNote != null && task.reviewedBy != null;

  return (
    <dl className="task-detail__facts">
      {ownerName ? (
        <div className="task-detail__fact">
          <dt>{t('pool.fact.owner')}</dt>
          <dd>{ownerName}</dd>
        </div>
      ) : null}
      {previousOwnerNames.length > 0 ? (
        <div className="task-detail__fact">
          <dt>{t('pool.fact.previousOwners')}</dt>
          <dd>{previousOwnerNames.join('、')}</dd>
        </div>
      ) : null}
      {task.claimedAt ? (
        <div className="task-detail__fact">
          <dt>{t('pool.fact.claimed')}</dt>
          <dd>{formatDay(task.claimedAt)}</dd>
        </div>
      ) : null}
      {task.assignReason ? (
        <div className="task-detail__fact">
          <dt>{t('pool.fact.assigned')}</dt>
          <dd>
            {t('pool.fact.assignedBy', {
              name: task.assignedBy?.displayName ?? '—',
              reason: task.assignReason,
            })}
          </dd>
        </div>
      ) : null}
      {task.partnerMemberId ? (
        <div className="task-detail__fact">
          <dt>{t('pool.fact.partner')}</dt>
          <dd>{memberOptionLabel(members, task.partnerMemberId)}</dd>
        </div>
      ) : null}
      {task.crossClaimConfirmedBy ? (
        <div className="task-detail__fact">
          <dt>{t('pool.fact.confirmed')}</dt>
          <dd>{task.crossClaimConfirmedBy.displayName}</dd>
        </div>
      ) : null}
      {task.status === 'done' && task.completedBy ? (
        <div className="task-detail__fact">
          <dt>{t('pool.fact.completed')}</dt>
          <dd>{task.completedBy.displayName} {task.transitions?.filter(tr => tr.to === 'done').at(-1)?.at && factTime(task.transitions.filter(tr => tr.to === 'done').at(-1)!.at)}</dd>
        </div>
      ) : null}
      {acceptance === 'accepted' && task.reviewedBy ? (
        <div className="task-detail__fact">
          <dt>{t('pool.fact.reviewed')}</dt>
          <dd>
            {task.reviewedBy.displayName} {task.reviewedAt && factTime(task.reviewedAt)}
            {task.reviewNote ? ` · ${task.reviewNote}` : ''}
          </dd>
        </div>
      ) : null}
      {rejected ? (
        <div className="task-detail__fact task-detail__fact--warn">
          <dt>{t('pool.fact.rejected')}</dt>
          <dd>
            {t('pool.fact.rejectedBy', {
              name: task.reviewedBy?.displayName ?? '—',
              note: task.reviewNote ?? '',
            })}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
