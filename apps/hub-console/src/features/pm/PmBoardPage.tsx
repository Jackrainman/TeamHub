import { useQuery } from '@tanstack/react-query';
import { Network, Plus } from 'lucide-react';
import type { Task, TaskStatus } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useI18n, type TranslationKey } from '../../i18n';
import { MetricTile } from '../../components/MetricTile';

// 看板列固定顺序（任务流向，不按人）。反排名（C2）：看板主键是 task/status，无 memberId 维度、
// 不展示「谁完成多少」；任务自身难度让「本来简单却被卡」可见。
const COLUMN_ORDER: TaskStatus[] = [
  'pending',
  'inProgress',
  'blocked',
  'done',
  'shelved',
];

const PM_STATUS_KEY: Record<TaskStatus, TranslationKey> = {
  pending: 'pm.status.pending',
  inProgress: 'pm.status.inProgress',
  blocked: 'pm.status.blocked',
  done: 'pm.status.done',
  shelved: 'pm.status.shelved',
};

const PM_COMPLEXITY_KEY: Record<Task['intrinsicComplexity'], TranslationKey> = {
  trivial: 'pm.complexity.trivial',
  normal: 'pm.complexity.normal',
  hard: 'pm.complexity.hard',
};

export function PmBoardPage({
  client,
  source,
  onNewTask,
  onOpenInDepGraph,
}: {
  client: HubApiClient;
  source: string;
  onNewTask: () => void;
  onOpenInDepGraph?: (taskId: string) => void;
}) {
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ['tasks', source],
    queryFn: () => client.getTasks(),
  });

  if (query.isLoading) {
    return <div className="state-band" role="status" aria-live="polite">{t('pm.loading')}</div>;
  }
  if (query.error || !query.data) {
    return <div className="state-band state-band-error" role="alert">{t('pm.error')}</div>;
  }

  const tasks = query.data.tasks;

  // O(n) single-pass grouping: build a Map<TaskStatus, Task[]> once, then all
  // COLUMN_ORDER.map and Metric lookups are O(1) instead of O(n×7).
  const statusMap = new Map<TaskStatus, Task[]>();
  for (const task of tasks) {
    const list = statusMap.get(task.status) ?? [];
    list.push(task);
    statusMap.set(task.status, list);
  }
  const byStatus = (status: TaskStatus) => statusMap.get(status) ?? [];

  return (
    <div className="pm-page">
      <div className="pm-toolbar">
        <button type="button" className="btn btn--primary" onClick={onNewTask}>
          <Plus size={14} aria-hidden="true" /> {t('pm.create.open')}
        </button>
      </div>
      <section className="pm-summary" aria-label={t('pm.section.summary')}>
        <MetricTile label={t('pm.summary.total')} value={String(tasks.length)} />
        <MetricTile
          label={t('pm.summary.blocked')}
          value={String(byStatus('blocked').length)}
          accent="red"
        />
        <MetricTile
          label={t('pm.summary.done')}
          value={String(byStatus('done').length)}
          accent="green"
        />
      </section>
      {tasks.length === 0 ? (
        <div className="pm-coldstart">
          <h3>{t('pm.coldstart.title')}</h3>
          <p>{t('pm.coldstart.body')}</p>
          <button type="button" className="btn btn--primary" onClick={onNewTask}>
            {t('pm.coldstart.goCreate')}
          </button>
        </div>
      ) : (
        <div className="pm-board">
          {COLUMN_ORDER.map((status) => {
            const columnTasks = byStatus(status);
            return (
              <section className="pm-column" key={status}>
                <header className={`pm-column__head pm-col-${status}`}>
                  <span>{t(PM_STATUS_KEY[status])}</span>
                  <span className="pm-column__count">{columnTasks.length}</span>
                </header>
                <div className="pm-column__body">
                  {columnTasks.length === 0 ? (
                    <p className="pm-column__empty">{t('pm.col.empty')}</p>
                  ) : (
                    columnTasks.map((task) => (
                      <PmTaskCard
                        task={task}
                        onOpenInDepGraph={onOpenInDepGraph}
                        key={task.id}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PmTaskCard({
  task,
  onOpenInDepGraph,
}: {
  task: Task;
  onOpenInDepGraph?: (taskId: string) => void;
}) {
  const { t } = useI18n();
  // HUB-MODULARIZATION 第4步：targetLabel 优先（泛化槽），无则回退 robotTarget（robotics 垂直 fallback），
  // 两者皆缺（无机器人租户未填）则不渲染该徽章。
  const robot =
    task.targetLabel ??
    (task.robotTarget === 'shared' ? t('pm.robot.shared') : task.robotTarget);
  return (
    <article className="pm-card">
      <h3 className="pm-card__title">{task.title}</h3>
      <p className="pm-card__summary">{task.rawSummary}</p>
      <div className="pm-card__badges">
        {robot ? <span className="badge badge--blue badge--strong">{robot}</span> : null}
        <span className="badge">
          {t('pm.card.complexity')} ·{' '}
          {t(PM_COMPLEXITY_KEY[task.intrinsicComplexity])}
        </span>
      </div>
      {onOpenInDepGraph ? (
        <button
          type="button"
          className="pm-card__link"
          onClick={() => onOpenInDepGraph(task.id)}
        >
          <Network size={12} aria-hidden="true" /> {t('pm.card.openInDepGraph')}
        </button>
      ) : null}
    </article>
  );
}
