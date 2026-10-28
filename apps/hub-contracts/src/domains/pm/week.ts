import type { Task } from './model.js';

const DAY = 86_400_000;
const WEEK = 7 * DAY;

function isoWeek(date: Date): string {
  const thursday = new Date(date);
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const year = thursday.getUTCFullYear();
  const number = Math.ceil(((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY + 1) / 7);
  return `${year}-W${String(number).padStart(2, '0')}`;
}

/** Civil dates are calculated in Shanghai; UTC arithmetic avoids host time zone and DST drift. */
export function getWeekKey(now: string | Date): string {
  const instant = new Date(now);
  if (!Number.isFinite(instant.getTime())) throw new RangeError('Invalid date');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant);
  const part = (name: string) => Number(parts.find(p => p.type === name)!.value);
  return isoWeek(new Date(Date.UTC(part('year'), part('month') - 1, part('day'))));
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

export function isCurrentWeek(key: string, now: string | Date): boolean {
  return isValidWeekKey(key) && key === getWeekKey(now);
}

export type WeekView = 'active' | 'pool' | 'completed';
export type WeekScope = 'mine' | 'team';

export function selectWeekTasks<T extends Task>(
  tasks: readonly T[], key: string, view: WeekView, scope: WeekScope, sessionMemberId: string | null,
): T[] {
  return tasks.filter(task => {
    if (task.status === 'shelved') return false;
    if (view === 'pool') return task.ownerId === null && task.status !== 'done';
    if (!task.weekLinks?.some(link => link.weekKey === key)) return false;
    if (scope === 'mine' && (!sessionMemberId || task.ownerId !== sessionMemberId)) return false;
    return view === 'completed' ? task.status === 'done' : task.status !== 'done' && task.ownerId !== null;
  });
}

export function canReviewWeekTask(task: Task, memberId: string): boolean {
  return !!task.weekLinks?.length && task.status === 'done' &&
    task.ownerId !== memberId && task.completedBy?.id !== memberId;
}
