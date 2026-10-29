import { factTime } from './format';
import type { ReactNode } from 'react';
import type { DepNode, MemberPublic, TaskWithMeta } from '@teamhub/hub-contracts';
import { deriveTaskAcceptance } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { STATUS_KEY } from '../sub/constants';
import { CheckCircle2, Circle, Clock, Inbox, TriangleAlert } from 'lucide-react';

export function WeekTaskCard({ task, groupName, members, node, onOpen, children, active }: {
  task: TaskWithMeta; groupName: string; members: MemberPublic[]; node?: DepNode;
  onOpen: () => void; children?: ReactNode; active?: boolean;
}) {
  const { t } = useI18n();
  const acceptance = deriveTaskAcceptance(task, task.isBig);
  const completedAt = task.transitions?.filter(tr => tr.to === 'done').at(-1)?.at;
  const owner = members.find(member => member.id === task.ownerId)?.displayName;
  const target = task.targetLabel ?? (task.robotTarget === 'shared' ? t('pm.robot.shared') : task.robotTarget);
  const StatusIcon = task.status === 'done' ? (acceptance === 'accepted' ? CheckCircle2 : Clock) : task.status === 'blocked' ? TriangleAlert : task.ownerId ? Circle : Inbox;
  return <article className={`card week-task week-task--${task.status}${active ? ' is-selected' : ''}${task.status === 'done' && acceptance !== 'accepted' ? ' is-awaiting' : ''}`}>
    <div className="week-task__heading">
      <span className="week-task__group">{groupName}</span>
      <span className="week-task__status"><StatusIcon size={14} aria-hidden="true" />{task.status === 'done' ? t(acceptance === 'accepted' ? 'week.accepted' : 'week.awaiting') : t(STATUS_KEY[task.status])}</span>
    </div>
    <button className="week-task__title" onClick={onOpen} aria-pressed={active}>{task.title}</button>
    <p className="week-task__summary">{task.rawSummary}</p>
    {(task.status === 'blocked' || node?.blockedByLabel || node?.unmetNeedLabels.length) ? <p className="week-task__block">
      <TriangleAlert size={14} aria-hidden="true" /> {t('week.waitingFor')} {node?.blockedByLabel || node?.unmetNeedLabels.join(' / ') || t('week.blockUnknown')}
    </p> : null}
    <div className="week-task__facts">
      {owner && <span>{t('week.owner')} · {owner}</span>}
      {target && <span>{target}</span>}
      {task.status === 'done' && task.completedBy && <span>{t('week.completedBy')} · {task.completedBy.displayName}{completedAt && <> · <time dateTime={completedAt}>{factTime(completedAt)}</time></>}</span>}
      {task.status === 'done' && task.reviewedBy && <span>{t('week.reviewedBy')} · {task.reviewedBy.displayName}{task.reviewedAt && <> · <time dateTime={task.reviewedAt}>{factTime(task.reviewedAt)}</time></>}</span>}
    </div>
    {children && <div className="week-task__actions">{children}</div>}
  </article>;
}
