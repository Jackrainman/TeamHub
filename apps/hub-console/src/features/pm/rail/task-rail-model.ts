import { deriveTaskAcceptance, getWeekKey, resolveCompletedAt, type Group, type TaskStatus, type TaskWithMeta } from '@teamhub/hub-contracts';

export type RailTimeBucket = 'today' | 'week' | 'later' | 'closed';
export type RailScope = 'mine' | 'team';
export type RailStatusFilter = 'active' | 'all' | TaskStatus | 'awaitingReview' | 'accepted';
export type RailGrouping = 'time' | 'group' | 'status';
export type RailDensity = 'compact' | 'standard';
export type RailDisplayStatus = TaskStatus | 'awaitingReview' | 'accepted';

const shanghaiDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
});
const shanghaiTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const shanghaiMonthDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit',
});

export function shanghaiDay(instant: string | Date): string {
  return shanghaiDayFormatter.format(typeof instant === 'string' ? new Date(instant) : instant);
}

export function taskCompletedAt(task: Pick<TaskWithMeta, 'status' | 'updatedAt' | 'completedAt' | 'transitions'>): string | undefined {
  return resolveCompletedAt(task);
}

export function latestWeekKey(task: Pick<TaskWithMeta, 'weekLinks'>): string | undefined {
  return task.weekLinks
    ?.map(link => link.weekKey)
    .filter(weekKey => /^\d{4}-W\d{2}$/.test(weekKey))
    .sort()
    .at(-1);
}

export function railTimeBucket(
  task: Pick<TaskWithMeta, 'status' | 'createdAt' | 'updatedAt' | 'claimedAt' | 'weekLinks' | 'transitions'>,
  now: Date,
  currentWeekKey: string,
): RailTimeBucket {
  if (task.status === 'done' || task.status === 'shelved') return 'closed';
  const latest = latestWeekKey(task);
  if (!latest) return shanghaiDay(task.createdAt) === shanghaiDay(now) ? 'today' : 'later';
  if (latest < currentWeekKey) return 'today';
  if (latest > currentWeekKey) return 'later';
  const progressedToday = [task.claimedAt, task.updatedAt].some(value => value && shanghaiDay(value) === shanghaiDay(now));
  return progressedToday ? 'today' : 'week';
}

export function railDisplayStatus(task: Pick<TaskWithMeta, 'status' | 'reviewedBy' | 'completedAt'>): RailDisplayStatus {
  if (task.status !== 'done') return task.status;
  return deriveTaskAcceptance(task) === 'accepted' ? 'accepted' : 'awaitingReview';
}

export function filterRailTasks(
  tasks: readonly TaskWithMeta[],
  options: { scope: RailScope; status: RailStatusFilter; sessionMemberId?: string | null },
): TaskWithMeta[] {
  const scoped = options.scope === 'mine'
    ? options.sessionMemberId ? tasks.filter(task => task.ownerId === options.sessionMemberId) : []
    : [...tasks];
  return scoped.filter(task => {
    switch (options.status) {
      case 'all': return true;
      case 'active': return task.status !== 'done' && task.status !== 'shelved';
      case 'awaitingReview': return deriveTaskAcceptance(task) === 'awaitingReview';
      case 'accepted': return deriveTaskAcceptance(task) === 'accepted';
      default: return task.status === options.status;
    }
  });
}

function byRecency<T extends TaskWithMeta>(a: T, b: T): number {
  return b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
}

export interface RailSection<T> {
  key: string;
  kind: RailGrouping;
  value: string;
  tasks: T[];
}

export function groupRailTasks<T extends TaskWithMeta>(
  tasks: readonly T[],
  grouping: RailGrouping,
  groups: readonly Group[],
  now: Date,
  currentWeekKey = getWeekKey(now),
): RailSection<T>[] {
  if (grouping === 'group') {
    const orderedIds = [...groups.map(group => group.id), ...new Set(tasks.map(task => task.groupId).filter(id => !groups.some(group => group.id === id)))];
    return orderedIds.map(groupId => ({
      key: `group:${groupId}`, kind: grouping, value: groupId,
      tasks: tasks.filter(task => task.groupId === groupId).sort(byRecency),
    })).filter(section => section.tasks.length > 0);
  }
  const values = grouping === 'time'
    ? ['today', 'week', 'later', 'closed'] as const
    : ['pending', 'inProgress', 'blocked', 'awaitingReview', 'accepted', 'shelved'] as const;
  return values.map(value => ({
    key: `${grouping}:${value}`, kind: grouping, value,
    tasks: tasks.filter(task => (grouping === 'time' ? railTimeBucket(task, now, currentWeekKey) : railDisplayStatus(task)) === value).sort(byRecency),
  })).filter(section => section.tasks.length > 0);
}

export function formatRailTime(iso: string, now: Date): string {
  const date = new Date(iso);
  return shanghaiDay(date) === shanghaiDay(now)
    ? shanghaiTimeFormatter.format(date)
    : shanghaiMonthDayFormatter.format(date);
}
