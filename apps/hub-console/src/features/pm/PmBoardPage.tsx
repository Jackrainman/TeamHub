import { useState } from 'react';
import { Network, Plus } from 'lucide-react';
import { selectWeekTasks } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import type { PageIdentityCtx } from '../../console-pages';
import { useI18n } from '../../i18n';
import { EmptyState } from '../../shared/EmptyState';
import { useQueryGuard } from '../../shared/QueryGate';
import { SideDrawer } from '../../components/SideDrawer';
import { useMembers } from '../identity/hooks';
import { useTasks, useGroups, useDepGraph } from './hooks';
import { TaskDetailDrawer } from './TaskDetailDrawer';
import { WeekTaskCard } from './week/WeekTaskCard';

export function PmBoardPage({ client, source, identity, onNewTask, onOpenInDepGraph }: {
  client: HubApiClient; source: string; identity: PageIdentityCtx;
  onNewTask: () => void; onOpenInDepGraph?: (id: string) => void;
}) {
  const { t } = useI18n();
  const query = useTasks(client, source);
  const groupsQuery = useGroups(client, source);
  const membersQuery = useMembers(client, source);
  const graph = useDepGraph(client, source);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const gate = useQueryGuard(query, t('pm.loading'), t('pm.error'));
  if (gate.guard) return gate.guard;
  const tasks = gate.data.tasks;
  const groups = groupsQuery.data?.groups ?? [];
  const members = membersQuery.data?.members ?? [];
  // 全局任务池使用共享筛选规则；其余任务按未完成/完成投影，不引入第二套状态机。
  const pool = selectWeekTasks(tasks, '', 'pool', 'team', null);
  const poolIds = new Set(pool.map(task => task.id));
  const columns = [
    { id: 'active', label: 'week.view.active', tasks: tasks.filter(task => task.status !== 'done' && task.status !== 'shelved' && !poolIds.has(task.id)) },
    { id: 'pool', label: 'week.view.pool', tasks: pool },
    { id: 'completed', label: 'week.view.completed', tasks: tasks.filter(task => task.status === 'done') },
  ];
  const selected = tasks.find(task => task.id === selectedId);
  return <div className="pm-page">
    <div className="domain-actions"><button className="btn btn--primary" disabled={!identity.canWrite} onClick={onNewTask}><Plus size={16} />{t('pm.create.open')}</button></div>
    <div className="project-board-grid">{columns.map(column => <section className="card project-board-column" key={column.id}>
      <h2>{t(column.label)}<span className="badge">{column.tasks.length}</span></h2>
      {column.tasks.length === 0 ? <EmptyState title={t('pm.col.empty')} /> : column.tasks.map(task => <WeekTaskCard key={task.id} task={task} groupName={groups.find(group => group.id === task.groupId)?.name ?? task.groupId} members={members} node={graph.data?.nodes.find(node => node.id === task.id)} onOpen={() => setSelectedId(task.id)}>
        <button className="btn btn--ghost btn--sm" onClick={() => setSelectedId(task.id)}>{t('pool.card.openDetail')}</button>
        {onOpenInDepGraph && <button className="btn btn--ghost btn--sm" onClick={() => onOpenInDepGraph(task.id)}><Network size={14} />{t('pm.card.openInDepGraph')}</button>}
      </WeekTaskCard>)}</section>)}
    </div>
    <SideDrawer open={!!selected} onClose={() => setSelectedId(null)} title={selected?.title ?? ''}>
      {selected && <TaskDetailDrawer client={client} source={source} task={selected} members={members} groups={groups} identity={identity} />}
    </SideDrawer>
  </div>;
}
