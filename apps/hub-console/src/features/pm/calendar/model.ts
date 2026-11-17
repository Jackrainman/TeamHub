import type { Task } from '@teamhub/hub-contracts';

export type CalendarScope = 'personal' | 'group' | 'team';
export function filterTasksByScope(tasks: readonly Task[], scope: CalendarScope, me: string | null | undefined, myGroupId: string | null | undefined): Task[] {
  if (scope === 'personal') {
    if (!me) return [];
    return tasks.filter(task => task.ownerId === me || task.collaboratorIds.includes(me));
  }
  if (scope === 'group') {
    if (!myGroupId) return [];
    return tasks.filter(task => task.groupId === myGroupId);
  }
  return [...tasks];
}
const DAY_MS = 86_400_000;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
export function dateKeyOf(value: string | null | undefined): string | null {
  const key = value?.slice(0, 10) ?? '';
  if (!DATE_KEY.test(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? key : null;
}
export function dayNumber(key: string): number {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}
function keyFromDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}
export function addDays(key: string, amount: number): string {
  return keyFromDay(dayNumber(key) + amount);
}
export function mondayOf(key: string): string {
  const weekday = new Date(dayNumber(key) * DAY_MS).getUTCDay();
  return addDays(key, weekday === 0 ? -6 : 1 - weekday);
}
