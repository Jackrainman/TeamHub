import type { TaskWithMeta } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { formatDay, STATUS_KEY } from './constants';

export function TaskTimeline({ task }: { task: TaskWithMeta }) {
  const { t } = useI18n();
  if (!task.transitions || task.transitions.length === 0) return null;
  return (
    <div className="tl-wrap">
      <h4 className="tl-title">{t('pool.timeline.title')}</h4>
      <ol className="tl-list">
        {task.transitions.map((tr, i) => (
          <li key={i} className="tl-item">
            <span className="tl-status">
              {tr.from ? `${t(STATUS_KEY[tr.from])} → ` : ''}{t(STATUS_KEY[tr.to])}
            </span>
            <span className="tl-at">{formatDay(tr.at)}</span>
            {tr.by ? <span className="tl-by">{tr.by.displayName}</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
