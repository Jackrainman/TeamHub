import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Plus, Inbox } from 'lucide-react';
import { selectWeekTasks, shiftWeek, type WeekScope, type WeekView } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../../api/client';
import type { PageIdentityCtx } from '../../../console-pages';
import { useI18n } from '../../../i18n';
import { SideDrawer } from '../../../components/SideDrawer';
import { useMembers } from '../../identity/hooks';
import { useCurrentWeek, useDepGraph, useGroups, useTasks, useWeekActions } from '../hooks';
import { TaskDetailDrawer } from '../TaskDetailDrawer';
import { SelfReportForm } from './SelfReportForm';
import { WeekTaskCard } from './WeekTaskCard';

export function WeekWorkspace({ client, source, projectId, identity, aside }: {
  client: HubApiClient; source: string; projectId: string; identity: PageIdentityCtx; aside?: ReactNode;
}) {
  const { t } = useI18n();
  const localWeek = useCurrentWeek();
  const tasksQuery = useTasks(client, source);
  const currentWeek = tasksQuery.data?.currentWeek ?? localWeek;
  const [chosenWeek, setChosenWeek] = useState<string | null>(null);
  const week = chosenWeek ?? currentWeek;
  const historical = week !== currentWeek;
  const [view, setView] = useState<WeekView>('active');
  const [scope, setScope] = useState<WeekScope>('mine');
  const [createOpen, setCreateOpen] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const groupsQuery = useGroups(client, source);
  const membersQuery = useMembers(client, source);
  const graphQuery = useDepGraph(client, source);
  const tasks = tasksQuery.data?.tasks ?? [];
  const groups = groupsQuery.data?.groups ?? [];
  const members = membersQuery.data?.members ?? [];
  const memberId = identity.session?.memberId ?? null;
  const canWrite = identity.canWrite && !!memberId;
  const actions = useWeekActions(client, () => { setCreateOpen(false); setView('active'); setScope('mine'); setChosenWeek(null); });
  const visible = selectWeekTasks(tasks, week, view, scope, memberId);
  const selected = tasks.find(task => task.id === taskId);
  const busy = actions.claim.isPending || actions.link.isPending || actions.status.isPending;

  return <div className="week-workspace">
    <header className="week-header">
      <div><p className="week-eyebrow">{t('week.eyebrow')}</p><h1>{t(historical ? 'week.archive' : 'week.title')}</h1></div>
      <div className="week-header__controls">
        <div className="week-switch" aria-label={t('week.switch')}>
          <button className="btn btn--ghost" aria-label={t('week.previous')} onClick={() => { setChosenWeek(shiftWeek(week, -1)); setTaskId(null); setCreateOpen(false); }}><ChevronLeft size={18} /></button>
          <strong>{week}</strong>
          <button className="btn btn--ghost" aria-label={t('week.next')} disabled={!historical} onClick={() => { const next = shiftWeek(week, 1); setChosenWeek(next === currentWeek ? null : next); setTaskId(null); }}><ChevronRight size={18} /></button>
        </div>
        {historical && <button className="btn btn--secondary" onClick={() => { setChosenWeek(null); setTaskId(null); }}>{t('week.current')}</button>}
        <button className="btn btn--primary" disabled={!canWrite || historical} onClick={() => setCreateOpen(true)}><Plus size={16} />{t('week.selfReport')}</button>
      </div>
    </header>
    <div className={`week-layout${aside ? '' : ' week-layout--single'}`}>
      <section className="week-main" aria-label={t('week.tasks')}>
        <div className="week-toolbar">
          <div className="week-tabs" role="tablist" aria-label={t('week.views')}>
            {(['active', 'pool', 'completed'] as const).map(tab => <button key={tab} role="tab" aria-selected={tab === view} className={tab === view ? 'is-active' : ''} onClick={() => { setView(tab); setTaskId(null); }}>{t(`week.view.${tab}`)}</button>)}
          </div>
          {view !== 'pool' && <div className="week-scope" aria-label={t('week.scope')}>
            {(['mine', 'team'] as const).map(value => <button className="btn btn--ghost btn--sm" key={value} aria-pressed={scope === value} onClick={() => { setScope(value); setTaskId(null); }}>{t(`week.scope.${value}`)}</button>)}
          </div>}
        </div>
        <p className="week-note">{t(view === 'pool' ? 'week.poolHint' : historical ? 'week.historyHint' : 'week.currentHint')}</p>
        {!memberId && <p className="week-note">{t('week.loginHint')}</p>}
        {tasksQuery.isLoading ? <p role="status">{t('workbench.myWeek.loading')}</p> : tasksQuery.error ? <div className="empty-state" role="alert"><p>{t('workbench.myWeek.error')}</p><button className="btn btn--secondary" onClick={() => void tasksQuery.refetch()}>{t('week.retry')}</button></div> : visible.length === 0 ? <div className="empty-state week-empty"><Inbox size={32} aria-hidden="true" /><h3>{t('week.empty')}</h3><p>{t(historical ? 'week.emptyHistory' : 'week.emptyCurrent')}</p>{view !== 'pool' && <button className="btn btn--secondary" onClick={() => setView('pool')}>{t('week.browsePool')}</button>}</div> : <div className="week-task-list">
          {visible.map(task => <WeekTaskCard key={task.id} task={task} members={members} groupName={groups.find(group => group.id === task.groupId)?.name ?? task.groupId} node={graphQuery.data?.nodes.find(node => node.id === task.id)} onOpen={() => setTaskId(task.id)}>
            <button className="btn btn--ghost btn--sm" onClick={() => setTaskId(task.id)}>{t('week.details')}</button>
            {canWrite && view === 'pool' && <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => actions.claim.mutate({ taskId: task.id, weekKey: currentWeek })}>{t('week.claim')}</button>}
            {canWrite && task.ownerId === memberId && task.status !== 'done' && view !== 'pool' && <>
              {historical ? <button className="btn btn--secondary btn--sm" disabled={busy || task.weekLinks?.some(link => link.weekKey === currentWeek)} onClick={() => actions.link.mutate({ taskId: task.id, weekKey: currentWeek })}>{t(task.weekLinks?.some(link => link.weekKey === currentWeek) ? 'week.continued' : 'week.continue')}</button> : <>
                {task.status === 'pending' && <button className="btn btn--secondary btn--sm" disabled={busy} onClick={() => actions.status.mutate({ taskId: task.id, status: 'inProgress' })}>{t('week.start')}</button>}
                <button className="btn btn--secondary btn--sm" disabled={busy} onClick={() => actions.status.mutate({ taskId: task.id, status: 'done' })}>{t('pool.action.complete')}</button>
              </>}
            </>}
          </WeekTaskCard>)}
        </div>}
      </section>
      {aside && <aside className="week-sidebar">{aside}</aside>}
    </div>
    <SideDrawer open={createOpen && !historical} onClose={() => setCreateOpen(false)} title={t('week.selfReport')}>
      {createOpen && <SelfReportForm projectId={projectId} groups={groups.filter(group => groupsQuery.data?.assignableGroupIds.includes(group.id))} defaultGroupId={identity.session?.groupId} pending={actions.create.isPending} onSubmit={input => actions.create.mutate({ weekKey: currentWeek, input })} />}
    </SideDrawer>
    <SideDrawer open={!!selected} onClose={() => setTaskId(null)} title={selected?.title ?? t('week.details')}>
      {selected && <TaskDetailDrawer key={selected.id} client={client} source={source} task={selected} groups={groups} members={members} identity={identity} readOnly={historical || view === 'pool'} />}
    </SideDrawer>
  </div>;
}
