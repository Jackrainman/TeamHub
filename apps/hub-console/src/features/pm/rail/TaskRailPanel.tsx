import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { getWeekKey } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../../api/client';
import type { PageIdentityCtx } from '../../../console-pages';
import { SideDrawer } from '../../../components/SideDrawer';
import { useI18n } from '../../../i18n';
import { EmptyState } from '../../../shared/EmptyState';
import { Button } from '../../../shared/ui/Button';
import { Select } from '../../../shared/ui/Select';
import { Toolbar } from '../../../shared/ui/Toolbar';
import { useMembers } from '../../identity/hooks';
import { useCompleteTask, useGroups, useTasks } from '../hooks';
import { TaskRailRow } from './TaskRailRow';
import { filterRailTasks, groupRailTasks, type RailDensity, type RailGrouping, type RailScope, type RailStatusFilter } from './task-rail-model';

const TaskDetailDrawer = lazy(() => import('../TaskDetailDrawer').then(module => ({ default: module.TaskDetailDrawer })));

export function TaskRailPanel({ client, source, identity, active }: {
  client: HubApiClient;
  source: string;
  identity: PageIdentityCtx;
  active: boolean;
}) {
  const { t } = useI18n();
  const [scope, setScope] = useState<RailScope>('mine');
  const [status, setStatus] = useState<RailStatusFilter>('active');
  const [grouping, setGrouping] = useState<RailGrouping>('time');
  const [density, setDensity] = useState<RailDensity>('standard');
  const [taskId, setTaskId] = useState<string | null>(null);
  const tasksQuery = useTasks(client, source, active);
  const groupsQuery = useGroups(client, source, active);
  const membersQuery = useMembers(client, source, active);
  const complete = useCompleteTask(client, () => void tasksQuery.refetch());
  const tasks = useMemo(() => tasksQuery.data?.tasks ?? [], [tasksQuery.data]);
  const groups = useMemo(() => groupsQuery.data?.groups ?? [], [groupsQuery.data]);
  const members = useMemo(() => membersQuery.data?.members ?? [], [membersQuery.data]);
  const memberId = identity.session?.memberId;
  const effectiveScope = memberId ? scope : 'team';
  const now = useMemo(() => new Date(), [active]);
  const visible = useMemo(() => filterRailTasks(tasks, { scope: effectiveScope, status, sessionMemberId: memberId }), [tasks, effectiveScope, status, memberId]);
  const sections = useMemo(() => groupRailTasks(visible, grouping, groups, now, tasksQuery.data?.currentWeek ?? getWeekKey(now)), [visible, grouping, groups, now, tasksQuery.data?.currentWeek]);
  const selected = tasks.find(task => task.id === taskId);

  useEffect(() => { if (!active) setTaskId(null); }, [active]);

  const sectionTitle = (kind: RailGrouping, value: string) => kind === 'group'
    ? groups.find(group => group.id === value)?.name ?? value
    : t(kind === 'time' ? `rail.bucket.${value}` : `team.status.${value}`);

  return <div className="task-rail" data-density={density}>
    <div className="task-rail__controls">
      <Toolbar align="between">
        {memberId ? <div className="task-rail__scope" role="group" aria-label={t('rail.scope')}>
          <Button size="sm" variant={effectiveScope === 'mine' ? 'primary' : 'secondary'} aria-pressed={effectiveScope === 'mine'} onClick={() => setScope('mine')}>{t('rail.scope.mine')}</Button>
          <Button size="sm" variant={effectiveScope === 'team' ? 'primary' : 'secondary'} aria-pressed={effectiveScope === 'team'} onClick={() => setScope('team')}>{t('rail.scope.team')}</Button>
        </div> : null}
        <Select aria-label={t('rail.density')} value={density} onChange={event => setDensity(event.target.value as RailDensity)}>
          <option value="standard">{t('rail.density.standard')}</option><option value="compact">{t('rail.density.compact')}</option>
        </Select>
      </Toolbar>
      <Toolbar>
        <Select aria-label={t('rail.status')} value={status} onChange={event => setStatus(event.target.value as RailStatusFilter)}>
          <option value="active">{t('rail.status.active')}</option><option value="all">{t('team.status.all')}</option>
          {(['pending', 'inProgress', 'blocked', 'awaitingReview', 'accepted', 'done', 'shelved'] as const).map(value => <option key={value} value={value}>{t(value === 'done' ? 'rail.status.done' : `team.status.${value}`)}</option>)}
        </Select>
        <Select aria-label={t('rail.grouping')} value={grouping} onChange={event => setGrouping(event.target.value as RailGrouping)}>
          {(['time', 'group', 'status'] as const).map(value => <option key={value} value={value}>{t(`rail.grouping.${value}`)}</option>)}
        </Select>
      </Toolbar>
      <p className="task-rail__note">{t('rail.bucket.note')}</p>
      {!memberId ? <p className="task-rail__note">{t('rail.loginHint')}</p> : null}
    </div>
    {tasksQuery.isLoading ? <p className="task-rail__state" role="status">{t('rail.loading')}</p>
      : tasksQuery.error ? <div className="task-rail__state" role="alert"><p>{t('rail.loadError')}</p><Button size="sm" onClick={() => void tasksQuery.refetch()}>{t('rail.retry')}</Button></div>
        : sections.length === 0 ? <EmptyState title={t('rail.empty.title')} desc={t('rail.empty.desc')} />
          : <div className="task-rail__sections">{sections.map(section => <section key={section.key} aria-label={sectionTitle(section.kind, section.value)}>
            <h3 className="task-rail__section-title"><span>{sectionTitle(section.kind, section.value)}</span><span className="task-rail__count">{t('rail.count', { count: section.tasks.length })}</span></h3>
            <ul className="task-rail__list">{section.tasks.map(task => <TaskRailRow key={task.id} task={task} groupName={groups.find(group => group.id === task.groupId)?.name ?? task.groupId} now={now} canCheck={identity.canWrite && !!memberId && (!task.weekLinks?.length || task.ownerId === memberId) && task.status !== 'done' && task.status !== 'shelved'} pending={complete.isPending} busy={complete.isPending && complete.variables === task.id} onComplete={id => complete.mutate(id)} onOpen={setTaskId} />)}</ul>
          </section>)}</div>}
    {complete.error ? <p className="task-rail__error" role="alert">{t('rail.actionError')}</p> : null}
    <SideDrawer placement="center" open={!!selected} onClose={() => setTaskId(null)} title={selected?.title ?? t('week.details')}>
      {selected ? <Suspense fallback={<p role="status">{t('rail.loading')}</p>}><TaskDetailDrawer key={selected.id} client={client} source={source} task={selected} groups={groups} members={members} identity={identity} /></Suspense> : null}
    </SideDrawer>
  </div>;
}
