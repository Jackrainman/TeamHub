import { useMemo } from 'react';
import { useI18n } from '../../i18n';
import type { HubApiClient } from '../../api/client';
import { useTasks } from '../../features/pm/hooks';
import type { TaskStatus } from '@teamhub/hub-contracts';

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: '待领',
  inProgress: '进行中',
  blocked: '被卡',
  done: '完成',
  shelved: '搁置',
};

interface FeedItem {
  taskId: string;
  taskTitle: string;
  from: TaskStatus | null;
  to: TaskStatus;
  at: string;
  by?: string;
}

export function ActivityFeed({ client, source }: { client: HubApiClient; source: string }) {
  const { t } = useI18n();
  const tasksQuery = useTasks(client, source);

  const items = useMemo<FeedItem[]>(() => {
    const tasks = tasksQuery.data?.tasks ?? [];
    const all: FeedItem[] = [];
    for (const task of tasks) {
      if (!task.transitions) continue;
      for (const tr of task.transitions) {
        all.push({
          taskId: task.id,
          taskTitle: task.title,
          from: tr.from,
          to: tr.to,
          at: tr.at,
          by: tr.by?.displayName,
        });
      }
    }
    all.sort((a, b) => b.at.localeCompare(a.at));
    return all.slice(0, 15);
  }, [tasksQuery.data]);

  if (items.length === 0) return null;

  return (
    <section className="panel">
      <div className="panel-header">
        <h3>{t('overview.panel.activity')}</h3>
        <span>{t('overview.meta.activity', { n: items.length })}</span>
      </div>
      <div className="stack-list">
        {items.map((item, i) => (
          <div key={`${item.taskId}-${i}`} className="activity-row">
            <span className="activity-row__title">{item.taskTitle}</span>
            <span className="activity-row__change">
              {item.from ? `${STATUS_LABEL[item.from]} → ` : ''}{STATUS_LABEL[item.to]}
            </span>
            <span className="activity-row__meta">
              {item.by ? `${item.by} · ` : ''}{item.at.slice(0, 10)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
