import { deriveTaskAcceptance, type Group, type TaskWithMeta } from '@teamhub/hub-contracts';
import { CheckCircle2, Circle, Clock, Inbox, TriangleAlert } from 'lucide-react';
import { useI18n } from '../../../../i18n';
import { STATUS_KEY } from '../../sub/constants';
import { factTime } from '../format';

/** 同一筛选结果的紧凑清单投影；任务操作仍由原面板和详情承担。 */
export function TickTickTaskView({ tasks, groups, onOpen }: {
  tasks: TaskWithMeta[];
  groups: Group[];
  onOpen: (taskId: string) => void;
}) {
  const { t } = useI18n();
  return <ul className="card ticktick-list" aria-label={t('week.view.list')}>
    {tasks.map(task => {
      const acceptance = deriveTaskAcceptance(task);
      const status = task.status === 'done'
        ? t(acceptance === 'accepted' ? 'week.accepted' : 'week.awaiting')
        : t(STATUS_KEY[task.status]);
      const StatusIcon = task.status === 'done' ? (acceptance === 'accepted' ? CheckCircle2 : Clock) : task.status === 'blocked' ? TriangleAlert : task.ownerId ? Circle : Inbox;
      const groupName = groups.find(group => group.id === task.groupId)?.name ?? task.groupId;
      return <li className={`ticktick-task ticktick-task--${task.status}`} key={task.id}>
        <span className="ticktick-task__icon" aria-hidden="true"><StatusIcon size={17} /></span>
        <button className="ticktick-task__title" onClick={() => onOpen(task.id)} aria-haspopup="dialog">{task.title}</button>
        <span className="ticktick-task__group">{groupName}</span>
        <span className="ticktick-task__status">{status}</span>
        <time className="ticktick-task__time" dateTime={task.updatedAt}>{factTime(task.updatedAt)}</time>
      </li>;
    })}
  </ul>;
}
