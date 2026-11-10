import { lazy, Suspense, useState } from 'react';
import { Plus, Inbox, CircleHelp } from 'lucide-react';
import { selectTeamTasks, type TeamTaskStatus } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../../api/client';
import type { PageIdentityCtx } from '../../../console-pages';
import { useI18n } from '../../../i18n';
import { SideDrawer } from '../../../components/SideDrawer';
import { SegToggle } from '../../../components/SegToggle';
import { useMembers } from '../../identity/hooks';
import { useCurrentWeek, useDepGraph, useGroups, useTasks, useWeekActions } from '../hooks';
import { TaskDetailDrawer } from '../TaskDetailDrawer';
import { SelfReportForm } from './SelfReportForm';
import { WeekTaskCard } from './WeekTaskCard';

const WeekTaskTutorial = lazy(() => import('../tutorial/WeekTaskTutorial').then(module => ({ default: module.WeekTaskTutorial })));

export function WeekWorkspace({ client, source, projectId, identity }: {
  client: HubApiClient; source: string; projectId: string; identity: PageIdentityCtx;
}) {
  const { t } = useI18n();
  const localWeek = useCurrentWeek();
  const tasksQuery = useTasks(client, source);
  const currentWeek = tasksQuery.data?.currentWeek ?? localWeek;
  const [q, setQ] = useState('');
  const [groupId, setGroupId] = useState('');
  const [status, setStatus] = useState<TeamTaskStatus>('inProgress');
  const [scope, setScope] = useState<'mine' | 'team'>('mine');
  const [columns, setColumns] = useState<'2' | '3' | '4'>('3');
  const [createOpen, setCreateOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const groupsQuery = useGroups(client, source);
  const membersQuery = useMembers(client, source);
  const graphQuery = useDepGraph(client, source);
  const tasks = tasksQuery.data?.tasks ?? [];
  const groups = groupsQuery.data?.groups ?? [];
  const members = membersQuery.data?.members ?? [];
  const memberId = identity.session?.memberId ?? null;
  const effectiveScope = memberId ? scope : 'team';
  const titleKey = effectiveScope === 'mine' ? 'team.personalTitle' : 'team.title';
  const canWrite = identity.canWrite && !!memberId;
  const actions = useWeekActions(client, () => { setCreateOpen(false); setQ(''); setGroupId(''); setStatus('inProgress'); });
  const visible = selectTeamTasks(tasks, { q, groupId, status, scope: effectiveScope, sessionMemberId: memberId });
  const selected = tasks.find(task => task.id === taskId);
  const filters = ['all', 'pending', 'inProgress', 'blocked', 'awaitingReview', 'accepted', 'done', 'shelved'] as const;

  return <div className="week-workspace">
    <header className="week-header">
      <div><h1>{t(titleKey)}</h1><p className="week-note">{t(effectiveScope === 'mine' ? 'team.personalHint' : 'team.hint')}</p></div>
      <div className="team-header-actions">
        <button className="btn btn--ghost" aria-haspopup="dialog" onClick={() => setTutorialOpen(true)}><CircleHelp size={16} aria-hidden="true" />{t('taskTutorial.open')}</button>
        <button className="btn btn--primary" disabled={!canWrite} onClick={() => setCreateOpen(true)}><Plus size={16} />{t('week.selfReport')}</button>
        <SegToggle value={columns} options={(['2', '3', '4'] as const).map(value => ({ value, label: t(`team.columns.${value}`) }))} ariaLabel={t('team.columns')} onChange={setColumns} />
        {memberId && <SegToggle value={scope} options={[{ value: 'mine', label: t('team.personal') }, { value: 'team', label: t('team.all') }]} ariaLabel={t('team.scope')} className={`task-scope task-scope--${scope}`} onChange={next => { setScope(next); setTaskId(null); }} />}
      </div>
    </header>
    <div className="team-task-filters">
      <label className="gate-field">{t('team.search')}<input type="search" value={q} onChange={event => setQ(event.target.value)} /></label>
      <label className="gate-field">{t('week.group')}<select value={groupId} onChange={event => setGroupId(event.target.value)}>
        <option value="">{t('team.allGroups')}</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
      </select></label>
      <label className="gate-field">{t('team.status')}<select value={status} onChange={event => setStatus(event.target.value as TeamTaskStatus)}>
        {filters.map(value => <option key={value} value={value}>{t(`team.status.${value}`)}</option>)}
      </select></label>
    </div>
    {!memberId && <p className="week-note">{t('week.loginHint')}</p>}
    <section aria-label={t(titleKey)}>
        {tasksQuery.isLoading ? <p role="status">{t('workbench.myWeek.loading')}</p> : tasksQuery.error ? <div className="empty-state" role="alert"><p>{t('workbench.myWeek.error')}</p><button className="btn btn--secondary" onClick={() => void tasksQuery.refetch()}>{t('week.retry')}</button></div> : visible.length === 0 ? <div className="empty-state week-empty"><Inbox size={32} aria-hidden="true" /><h3>{t('team.empty')}</h3></div> : <div className={`task-grid task-grid--${columns}`}>
          {visible.map(task => <WeekTaskCard key={task.id} task={task} members={members} groupName={groups.find(group => group.id === task.groupId)?.name ?? task.groupId} node={graphQuery.data?.nodes.find(node => node.id === task.id)} onOpen={() => setTaskId(task.id)}>
            {canWrite && task.ownerId === memberId && task.status !== 'done' && task.status !== 'shelved' && <button className="btn btn--secondary btn--sm" disabled={actions.status.isPending} onClick={() => actions.status.mutate({ taskId: task.id, status: 'done' })}>{t('pool.action.complete')}</button>}
          </WeekTaskCard>)}
        </div>}
    </section>
    <SideDrawer placement="center" open={createOpen} onClose={() => setCreateOpen(false)} title={t('week.selfReport')}>
      {createOpen && <SelfReportForm projectId={projectId} groups={groups.filter(group => groupsQuery.data?.assignableGroupIds.includes(group.id))} defaultGroupId={identity.session?.groupId} members={members} memberId={memberId!} pending={actions.create.isPending} onSubmit={input => actions.create.mutate({ weekKey: currentWeek, input })} />}
    </SideDrawer>
    <SideDrawer placement="center" open={!!selected} onClose={() => setTaskId(null)} title={selected?.title ?? t('week.details')}>
      {selected && <TaskDetailDrawer key={selected.id} client={client} source={source} task={selected} groups={groups} members={members} identity={identity} />}
    </SideDrawer>
    {tutorialOpen ? <Suspense fallback={null}><WeekTaskTutorial onClose={() => setTutorialOpen(false)} /></Suspense> : null}
  </div>;
}
