import type { Task, TaskWithMeta, TaskStatus } from './model.js';
import { deriveTaskAcceptance } from './model.js';

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const shanghai = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function shanghaiDateKey(now: string | Date): string {
  const instant = new Date(now);
  if (!Number.isFinite(instant.getTime())) throw new RangeError('Invalid date');
  return shanghai.format(instant);
}

function isoWeek(date: Date): string {
  const thursday = new Date(date);
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const year = thursday.getUTCFullYear();
  const number = Math.ceil(((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY + 1) / 7);
  return `${year}-W${String(number).padStart(2, '0')}`;
}

export function getWeekKey(now: string | Date): string {
  return isoWeek(new Date(`${shanghaiDateKey(now)}T00:00:00.000Z`));
}
function weekMonday(key: string): Date {
  const year = Number(key.slice(0, 4));
  const jan4 = new Date(Date.UTC(year, 0, 4));
  return new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * DAY + (Number(key.slice(6)) - 1) * WEEK);
}
export function isValidWeekKey(key: string): boolean {
  return /^[1-9]\d{3}-W\d{2}$/.test(key) && isoWeek(weekMonday(key)) === key;
}
export function shiftWeek(key: string, offset: number): string {
  if (!isValidWeekKey(key) || !Number.isInteger(offset)) throw new RangeError('Invalid week');
  return isoWeek(new Date(weekMonday(key).getTime() + offset * WEEK));
}
export function weekStartDateKey(key: string): string {
  if (!isValidWeekKey(key)) throw new RangeError('Invalid week');
  return weekMonday(key).toISOString().slice(0, 10);
}
export function weekEndDateKey(key: string): string {
  if (!isValidWeekKey(key)) throw new RangeError('Invalid week');
  return new Date(weekMonday(key).getTime() + 6 * DAY).toISOString().slice(0, 10);
}
export function isCurrentWeek(key: string, now: string | Date): boolean {
  return isValidWeekKey(key) && key === getWeekKey(now);
}
export function taskAuthorId(task: Task): string | undefined {
  return task.createdBy?.id ?? task.weekLinks?.[0]?.linkedBy.id;
}
export function canReviewWeekTask(task: Task, memberId: string): boolean {
  return Boolean(task.weekLinks?.length && task.status === 'done' && !task.reviewedBy
    && taskAuthorId(task) !== memberId && task.ownerId !== memberId
    && task.completedBy?.id !== memberId && task.reviewerIds?.includes(memberId));
}

export type TeamTaskStatus = 'all' | TaskStatus | 'awaitingReview' | 'accepted';
export function selectTeamTasks<T extends TaskWithMeta>(tasks: readonly T[], filter: {
  q: string; groupId: string; status: TeamTaskStatus;
  scope?: 'mine' | 'team'; sessionMemberId?: string | null;
}): T[] {
  const needle = filter.q.trim().toLowerCase();
  return tasks.filter((task) => {
    if (filter.scope === 'mine' && (!filter.sessionMemberId || task.ownerId !== filter.sessionMemberId)) return false;
    if (filter.groupId && task.groupId !== filter.groupId) return false;
    if (needle && ![task.id, task.title, task.rawSummary,
      ...(task.activity ?? []).flatMap((event) => [event.title ?? '', event.rawSummary ?? '']),
    ].some((text) => text.toLowerCase().includes(needle))) return false;
    if (filter.status === 'all') return true;
    if (filter.status === 'accepted' || filter.status === 'awaitingReview') return deriveTaskAcceptance(task) === filter.status;
    return task.status === filter.status;
  });
}
