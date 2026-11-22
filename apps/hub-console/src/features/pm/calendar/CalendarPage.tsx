import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { Task } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../../api/client';
import type { PageIdentityCtx } from '../../../console-pages';
import { useI18n } from '../../../i18n';
import { useMembers } from '../../identity/hooks';
import { Button } from '../../../shared/ui/Button';
import { useQueryGuard } from '../../../shared/QueryGate';
import { MonthView } from './MonthView';
import { monthLabel } from './calendar-month';
import { CalendarScopeToggle, type CalendarScope } from './CalendarScopeToggle';
import { filterTasksByScope } from './model';
import { useTodayKey } from './hooks';
import { useCurrentWeek, useGroups, useTasks } from '../hooks';
import { CalendarTaskDrawer } from './CalendarTaskDrawer';
import { SideDrawer } from '../../../components/SideDrawer';
import { TaskDetailDrawer } from '../TaskDetailDrawer';

function initialCalendarScope(): CalendarScope {
  if (typeof window === 'undefined') return 'team';
  const stored = window.localStorage.getItem('teamhub.calendar.scope');
  return stored === 'personal' || stored === 'group' || stored === 'team' ? stored : 'team';
}
export function CalendarPage({ client, source, identity, todayOverride }: {
  client: HubApiClient; source: string; identity: PageIdentityCtx; todayOverride?: string;
}): JSX.Element {
  const { t, lang } = useI18n();
  const today = useTodayKey(todayOverride);
  const localWeek = useCurrentWeek();
  const [anchor, setAnchor] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }));
  const [scope, setScope] = useState<CalendarScope>(initialCalendarScope);
  const tasksQuery = useTasks(client, source);
  const groupsQuery = useGroups(client, source);
  const membersQuery = useMembers(client, 'calendar');
  const [selected, setSelected] = useState<Task | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDates, setCreateDates] = useState<{ start?: string; end?: string }>({});
  const gate = useQueryGuard(tasksQuery, t('calendar.loading'), t('calendar.error'));
  const allTasks = gate.data?.tasks ?? [];
  const tasks = filterTasksByScope(allTasks, scope, identity.session?.memberId, identity.session?.groupId);
  const scopeEmpty = scope !== 'team' && tasks.length === 0 && allTasks.length > 0;
  const lockHint = identity.canWrite ? null : t('identity.writeHint');
  const groups = groupsQuery.data?.groups ?? [];
  const members = membersQuery.data?.members ?? [];
  const currentTask = selected ? allTasks.find(task => task.id === selected.id) ?? selected : null;
  function changeScope(next: CalendarScope): void {
    setScope(next);
    window.localStorage.setItem('teamhub.calendar.scope', next);
  }
  function createOnDay(dateKey: string): void {
    setCreateDates({ start: dateKey, end: dateKey });
    setCreateOpen(true);
  }
  function createBlank(): void {
    setCreateDates({});
    setCreateOpen(true);
  }
  return <div className="calendar-page" data-today={today}>
    <header className="calendar-toolbar">
      <div className="calendar-toolbar__lead">
        <h1 className="calendar-title">{t('expected.nav.calendar')}</h1>
        <nav className="calendar-month-nav" aria-label={t('calendar.month.label', { year: anchor.year, month: anchor.month })}>
          <button type="button" className="calendar-nav-button" data-action="prev" aria-label={t('calendar.month.prev')} onClick={() => setAnchor(current => current.month === 1 ? { year: current.year - 1, month: 12 } : { ...current, month: current.month - 1 })}><ChevronLeft size={16} aria-hidden="true" /></button>
          <strong className="calendar-month-current">{monthLabel(anchor.year, anchor.month, lang)}</strong>
          <button type="button" className="calendar-nav-button" data-action="next" aria-label={t('calendar.month.next')} onClick={() => setAnchor(current => current.month === 12 ? { year: current.year + 1, month: 1 } : { ...current, month: current.month + 1 })}><ChevronRight size={16} aria-hidden="true" /></button>
        </nav>
        <button type="button" className="btn btn--ghost btn--sm calendar-today-button" data-action="today" aria-label={t('calendar.month.today')} onClick={() => setAnchor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) })}>{t('calendar.today')}</button>
      </div>
      <div className="calendar-toolbar__actions">
        <CalendarScopeToggle value={scope} onChange={changeScope} />
        <Button variant="primary" size="sm" icon={<Plus size={16} aria-hidden="true" />} data-action="create-task" disabled={!identity.canWrite || !identity.session} title={lockHint ?? undefined} onClick={createBlank}>{t('calendar.task.create')}</Button>
      </div>
    </header>
    {gate.guard ? gate.guard : gate.data ? <>
      {scopeEmpty ? <div className="calendar-scope-empty" data-empty-scope={scope}>{t(scope === 'personal' ? 'calendar.empty.scope.personal' : 'calendar.empty.scope.group')}</div>
        : <MonthView year={anchor.year} month={anchor.month} tasks={tasks} today={today} canCreate={identity.canWrite && !!identity.session}
          onOpen={setSelected} onCreateDay={createOnDay} />}
      {allTasks.length === 0 ? <div className="state-band">{t('calendar.empty.tasks')}</div> : null}
    </> : null}
    <SideDrawer placement="center" open={!!currentTask} onClose={() => setSelected(null)} title={currentTask?.title ?? t('week.details')}>
      {currentTask && <TaskDetailDrawer key={currentTask.id} client={client} source={source} task={currentTask} groups={groups} members={members} identity={identity} />}
    </SideDrawer>
    <CalendarTaskDrawer client={client} open={createOpen} week={tasksQuery.data?.currentWeek ?? localWeek} groups={groups} members={members} memberId={identity.session?.memberId ?? ''}
      defaultPlannedStart={createDates.start} defaultPlannedEnd={createDates.end} onClose={() => setCreateOpen(false)} />
  </div>;
}
