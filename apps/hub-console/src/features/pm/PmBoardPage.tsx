import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Network, Plus, PanelRightOpen } from 'lucide-react';
import type {
  MemberPublic,
  Task,
  TaskAcceptanceState,
  TaskStatus,
  TaskWithMeta,
} from '@teamhub/hub-contracts';
import { deriveTaskAcceptance } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import type { PageIdentityCtx } from '../../console-pages';
import { useI18n, type TranslationKey } from '../../i18n';
import { MetricTile } from '../../components/MetricTile';
import { SideDrawer } from '../../components/SideDrawer';
import { needsCrossClaimConfirm, needsPartner } from '../pool/pool-utils';
import { TaskDetailDrawer } from './TaskDetailDrawer';

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

// 验收态 → 徽章 tone / 文案（deriveTaskAcceptance，TASK-POST-CLAIM §5 两档制）。notDone 不显徽章
// （未标完成、无所谓验收），故此处只映射需要显示的三态。
const ACCEPTANCE_TONE: Partial<Record<TaskAcceptanceState, string>> = {
  selfDone: 'badge--green',
  awaitingReview: 'badge--amber',
  accepted: 'badge--green',
};
const ACCEPTANCE_KEY: Partial<Record<TaskAcceptanceState, TranslationKey>> = {
  selfDone: 'pool.acceptance.selfDone',
  awaitingReview: 'pool.acceptance.awaitingReview',
  accepted: 'pool.acceptance.accepted',
};

export function PmBoardPage({
  client,
  source,
  identity,
  onNewTask,
  onOpenInDepGraph,
}: {
  client: HubApiClient;
  source: string;
  // 轻身份（IDENTITY-LITE）：透传给详情抽屉做写门 + actor 注入。
  identity: PageIdentityCtx;
  onNewTask: () => void;
  onOpenInDepGraph?: (taskId: string) => void;
}) {
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ['tasks', source],
    queryFn: () => client.getTasks(),
  });
  // 徽章判定（搭档黄标 / 跨组确认）需成员组归属；详情抽屉写动作需成员 + 组名。两读侧全开、缓存共享。
  const membersQuery = useQuery({
    queryKey: ['members', 'pm-board'],
    queryFn: () => client.getMembers(),
  });
  const groupsQuery = useQuery({
    queryKey: ['groups', 'pm-board'],
    queryFn: () => client.getGroups(),
  });
  // 详情抽屉选中任务（存 id、每帧从最新 query 数据反查——写动作后 invalidate 刷新即时反映到抽屉）。
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (query.isLoading) {
    return <div className="state-band" role="status" aria-live="polite">{t('pm.loading')}</div>;
  }
  if (query.error || !query.data) {
    return <div className="state-band state-band-error" role="alert">{t('pm.error')}</div>;
  }

  const tasks = query.data.tasks;
  const members = membersQuery.data?.members ?? [];
  const groups = groupsQuery.data?.groups ?? [];

  // O(n) single-pass grouping: build a Map<TaskStatus, Task[]> once, then all
  // COLUMN_ORDER.map and Metric lookups are O(1) instead of O(n×7).
  const statusMap = new Map<TaskStatus, TaskWithMeta[]>();
  for (const task of tasks) {
    const list = statusMap.get(task.status) ?? [];
    list.push(task);
    statusMap.set(task.status, list);
  }
  const byStatus = (status: TaskStatus) => statusMap.get(status) ?? [];

  const selectedTask = selectedId
    ? tasks.find((tk) => tk.id === selectedId) ?? null
    : null;

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
                        members={members}
                        onOpenInDepGraph={onOpenInDepGraph}
                        onOpenDetail={() => setSelectedId(task.id)}
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
      <SideDrawer
        open={selectedTask != null}
        onClose={() => setSelectedId(null)}
        title={selectedTask?.title ?? ''}
      >
        {selectedTask ? (
          <TaskDetailDrawer
            client={client}
            source={source}
            task={selectedTask}
            members={members}
            groups={groups}
            identity={identity}
          />
        ) : null}
      </SideDrawer>
    </div>
  );
}

function PmTaskCard({
  task,
  members,
  onOpenInDepGraph,
  onOpenDetail,
}: {
  task: TaskWithMeta;
  members: MemberPublic[];
  onOpenInDepGraph?: (taskId: string) => void;
  onOpenDetail: () => void;
}) {
  const { t } = useI18n();
  // HUB-MODULARIZATION 第4步：targetLabel 优先（泛化槽），无则回退 robotTarget（robotics 垂直 fallback），
  // 两者皆缺（无机器人租户未填）则不渲染该徽章。
  const robot =
    task.targetLabel ??
    (task.robotTarget === 'shared' ? t('pm.robot.shared') : task.robotTarget);
  const partnerWanted = needsPartner(task, members);
  const crossWanted = needsCrossClaimConfirm(task, task.isBig, members);
  const acceptance = deriveTaskAcceptance(task, task.isBig);
  const acceptanceTone = ACCEPTANCE_TONE[acceptance];
  const acceptanceKey = ACCEPTANCE_KEY[acceptance];
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
        {task.isBig ? (
          <span className="badge badge--blue" title={t('pool.big.hint')}>
            {t('pool.badge.big')}
          </span>
        ) : null}
        {partnerWanted ? (
          <span className="badge badge--amber">{t('pool.badge.needPartner')}</span>
        ) : null}
        {crossWanted ? (
          <span className="badge badge--neutral">{t('pool.badge.needConfirm')}</span>
        ) : null}
        {acceptanceTone && acceptanceKey ? (
          <span className={`badge ${acceptanceTone}`}>{t(acceptanceKey)}</span>
        ) : null}
      </div>
      {/* 指派事实卡（D-085）：由谁指派 + 理由，只在单卡可见。 */}
      {task.assignReason ? (
        <p className="pm-card__assigned">
          {t('pool.fact.assignedBy', {
            name: task.assignedBy?.displayName ?? '—',
            reason: task.assignReason,
          })}
        </p>
      ) : null}
      <div className="pm-card__links">
        <button type="button" className="pm-card__link" onClick={onOpenDetail}>
          <PanelRightOpen size={12} aria-hidden="true" /> {t('pool.card.openDetail')}
        </button>
        {onOpenInDepGraph ? (
          <button
            type="button"
            className="pm-card__link"
            onClick={() => onOpenInDepGraph(task.id)}
          >
            <Network size={12} aria-hidden="true" /> {t('pm.card.openInDepGraph')}
          </button>
        ) : null}
      </div>
    </article>
  );
}
