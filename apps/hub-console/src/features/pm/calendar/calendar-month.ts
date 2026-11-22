import type { Task } from '@teamhub/hub-contracts';
import { addDays, dateKeyOf, dayNumber, mondayOf } from './model';

export interface MonthDay { key: string; day: number; inMonth: boolean; isToday: boolean; weekend: boolean }
export interface MonthWeek { weekStart: string; weekEnd: string; days: MonthDay[] }
export interface MonthGrid { year: number; month: number; weeks: MonthWeek[] }
export interface MonthBar {
  taskId: string; lane: number; startCol: number; endCol: number;
  clippedStart: boolean; clippedEnd: boolean; spanDays: number;
}
export interface WeekLayout { weekStart: string; weekEnd: string; bars: MonthBar[]; hidden: Task[] }
export function buildMonthGrid(year: number, month: number, today: string): MonthGrid {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const firstDay = mondayOf(first);
  const weeks: MonthWeek[] = [];
  for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
    const weekStart = addDays(firstDay, weekIndex * 7);
    const days = Array.from({ length: 7 }, (_, dayIndex): MonthDay => {
      const key = addDays(weekStart, dayIndex);
      return { key, day: Number(key.slice(8, 10)),
        inMonth: Number(key.slice(5, 7)) === month && Number(key.slice(0, 4)) === year,
        isToday: key === today, weekend: dayIndex >= 5 };
    });
    weeks.push({ weekStart, weekEnd: days[6].key, days });
  }
  return { year, month, weeks };
}
export function layoutWeekBars(tasks: Task[], weekStart: string, _today: string, maxLanes = 3): WeekLayout {
  const weekEnd = addDays(weekStart, 6);
  const weekStartDay = dayNumber(weekStart);
  const weekEndDay = dayNumber(weekEnd);
  const candidates: { task: Task; bar: MonthBar }[] = [];
  for (const task of tasks) {
    const startKey = dateKeyOf(task.plannedStart);
    if (!startKey) continue;
    const endKey = dateKeyOf(task.plannedEnd) ?? startKey;
    if (endKey < startKey) continue;
    const startDay = dayNumber(startKey);
    const endDay = dayNumber(endKey);
    if (endDay < weekStartDay || startDay > weekEndDay) continue;
    const startCol = Math.max(startDay, weekStartDay) - weekStartDay;
    const endCol = Math.min(endDay, weekEndDay) - weekStartDay;
    candidates.push({ task, bar: {
      taskId: task.id, lane: 0, startCol, endCol,
      clippedStart: startDay < weekStartDay, clippedEnd: endDay > weekEndDay,
      spanDays: endCol - startCol + 1,
    } });
  }
  candidates.sort((a, b) => a.bar.startCol - b.bar.startCol
    || b.bar.endCol - a.bar.endCol || a.task.title.localeCompare(b.task.title));
  const laneEnds: number[] = [];
  for (const candidate of candidates) {
    let lane = laneEnds.findIndex(endCol => endCol < candidate.bar.startCol);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(candidate.bar.endCol); }
    else laneEnds[lane] = candidate.bar.endCol;
    candidate.bar.lane = lane;
  }
  return { weekStart, weekEnd,
    bars: candidates.filter(candidate => candidate.bar.lane < maxLanes).map(candidate => candidate.bar),
    hidden: candidates.filter(candidate => candidate.bar.lane >= maxLanes).map(candidate => candidate.task) };
}
/** 任务条颜色只承载状态语义，不再按 id 哈希随机上色。 */
export const CALENDAR_TONES = ['pending', 'inProgress', 'blocked', 'done', 'shelved'] as const;
export type CalendarTone = (typeof CALENDAR_TONES)[number];
export function statusToneOf(status: string | null | undefined): CalendarTone {
  return CALENDAR_TONES.find(tone => tone === status) ?? 'pending';
}
const ENGLISH_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function monthLabel(year: number, month: number, lang: 'zh' | 'en'): string {
  return lang === 'en' ? `${ENGLISH_MONTHS[month - 1]} ${year}` : `${year}年${month}月`;
}
