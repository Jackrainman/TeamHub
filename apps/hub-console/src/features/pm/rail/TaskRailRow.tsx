import type { TaskStatus, TaskWithMeta } from '@teamhub/hub-contracts';
import type { TranslationKey } from '../../../i18n';
import { useI18n } from '../../../i18n';
import { Checkbox } from '../../../shared/ui/Checkbox';
import { STATUS_KEY } from '../sub/constants';
import { formatRailTime, railDisplayStatus } from './task-rail-model';

const STATUS_TONE: Record<TaskStatus | 'awaitingReview' | 'accepted', string> = {
  pending: 'neutral', inProgress: 'blue', blocked: 'red', done: 'neutral', shelved: 'neutral',
  awaitingReview: 'amber', accepted: 'green',
};

export function TaskRailRow({ task, groupName, now, canCheck, pending, busy, onComplete, onOpen }: {
  task: TaskWithMeta;
  groupName: string;
  now: Date;
  canCheck: boolean;
  pending: boolean;
  busy: boolean;
  onComplete: (taskId: string) => void;
  onOpen: (taskId: string) => void;
}) {
  const { t } = useI18n();
  const status = railDisplayStatus(task);
  const statusKey: TranslationKey = status === 'accepted' ? 'week.accepted' : status === 'awaitingReview' ? 'week.awaiting' : STATUS_KEY[status];
  return <li className="task-rail__row" data-status={task.status} aria-busy={busy || undefined}>
    {canCheck
      ? <Checkbox className="task-rail__check" label="" checked={false} aria-label={`${t('rail.complete')}：${task.title}`} disabled={pending} onChange={() => onComplete(task.id)} />
      : <span className="task-rail__check-spacer" aria-hidden="true" />}
    <div className="task-rail__main">
      <button type="button" className="task-rail__title" aria-haspopup="dialog" onClick={() => onOpen(task.id)}>{task.title}</button>
      <div className="task-rail__meta">
        <span className="task-rail__group" title={groupName}>{groupName}</span>
        <span className={`badge badge--${STATUS_TONE[status]} badge--xs`}>{t(statusKey)}</span>
        <time className="task-rail__time" dateTime={task.updatedAt}>{formatRailTime(task.updatedAt, now)}</time>
      </div>
    </div>
  </li>;
}
