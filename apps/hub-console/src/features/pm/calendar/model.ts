import {
  STAGE_PIPELINE_STAGES,
  type MilestoneStage,
  type Project,
} from '@teamhub/hub-contracts';
import type { TranslationKey } from '../../../i18n';

export type CalendarMode = 'month' | 'week';
export type CalendarScope = 'personal' | 'group' | 'team';

export function filterProjectsByScope(
  projects: readonly Project[],
  scope: CalendarScope,
  me: string | null | undefined,
  myGroupId: string | null | undefined,
): Project[] {
  if (scope === 'personal') {
    if (!me) return [];
    return projects.filter(project => project.createdBy === me || project.memberIds?.includes(me) === true);
  }
  if (scope === 'group') {
    if (!myGroupId) return [];
    return projects.filter(project => project.groupIds.includes(myGroupId));
  }
  return [...projects];
}

export interface AxisTick {
  key: string;
  year: number;
  month: number;
  day: number;
  left: number;
  isYearStart: boolean;
}

export interface CalendarAxis {
  mode: CalendarMode;
  startKey: string;
  endKeyExclusive: string;
  startDay: number;
  days: number;
  ticks: AxisTick[];
  todayLeft: number | null;
  seasonTruncated: boolean;
}

export interface BarGeometry {
  left: number;
  width: number;
  startKey: string;
  endKey: string;
  fullStartKey: string;
  fullEndKey: string;
  days: number;
  clippedStart: boolean;
  clippedEnd: boolean;
  openEnded: boolean;
}

const DAY_MS = 86_400_000;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const shanghaiDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const STAGE_LABEL_KEYS: Record<MilestoneStage, TranslationKey> = {
  moduleDesign: 'workbench.stage.moduleDesign',
  moduleAssembly: 'workbench.stage.moduleAssembly',
  moduleTest: 'workbench.stage.moduleTest',
  integratedAssembly: 'workbench.stage.integratedAssembly',
  integratedTest: 'workbench.stage.integratedTest',
  convergence: 'workbench.stage.convergence',
};

function keyFromDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function tickOf(key: string, startDay: number, days: number): AxisTick {
  const [year, month, day] = key.split('-').map(Number);
  return {
    key,
    year,
    month,
    day,
    left: (dayNumber(key) - startDay) / days,
    isYearStart: month === 1 && day === 1,
  };
}

export function todayKey(now: Date): string {
  return shanghaiDate.format(now);
}

export function dateKeyOf(iso: string | null | undefined): string | null {
  const key = iso?.slice(0, 10) ?? '';
  if (!DATE_KEY.test(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    ? key
    : null;
}

export function dayNumber(key: string): number {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

export function addDays(key: string, n: number): string {
  return keyFromDay(dayNumber(key) + n);
}

export function firstOfMonth(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

export function addMonths(key: string, n: number): string {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + n, day)).toISOString().slice(0, 10);
}

export function mondayOf(key: string): string {
  const weekday = new Date(dayNumber(key) * DAY_MS).getUTCDay();
  return addDays(key, weekday === 0 ? -6 : 1 - weekday);
}

export function buildAxis(
  mode: CalendarMode,
  today: string,
  season: { startsAt: string; endsAt: string | null } | null,
): CalendarAxis {
  let startKey: string;
  let endKeyExclusive: string;
  let seasonTruncated = false;

  if (mode === 'week') {
    startKey = addDays(mondayOf(today), -21);
    endKeyExclusive = addDays(startKey, 56);
  } else {
    const seasonStart = dateKeyOf(season?.startsAt);
    const seasonEnd = dateKeyOf(season?.endsAt);
    const candidateStart = seasonStart ? firstOfMonth(seasonStart) : null;
    const candidateEnd = seasonEnd ? addMonths(firstOfMonth(seasonEnd), 1) : null;
    const months = candidateStart && candidateEnd
      ? (Number(candidateEnd.slice(0, 4)) - Number(candidateStart.slice(0, 4))) * 12
        + Number(candidateEnd.slice(5, 7)) - Number(candidateStart.slice(5, 7))
      : 0;
    if (candidateStart && candidateEnd && months >= 1 && months <= 18) {
      startKey = candidateStart;
      endKeyExclusive = candidateEnd;
    } else {
      seasonTruncated = Boolean(candidateStart && candidateEnd);
      startKey = addMonths(firstOfMonth(today), -6);
      endKeyExclusive = addMonths(startKey, 12);
    }
  }

  const startDay = dayNumber(startKey);
  const days = dayNumber(endKeyExclusive) - startDay;
  const ticks: AxisTick[] = [];
  if (mode === 'month') {
    for (let key = startKey; key < endKeyExclusive; key = addMonths(key, 1)) {
      ticks.push(tickOf(key, startDay, days));
    }
  } else {
    for (let key = startKey; key < endKeyExclusive; key = addDays(key, 7)) {
      ticks.push(tickOf(key, startDay, days));
    }
  }
  const todayDay = dayNumber(today);
  return {
    mode,
    startKey,
    endKeyExclusive,
    startDay,
    days,
    ticks: ticks.filter(tick => tick.left >= 0 && tick.left < 1),
    todayLeft: todayDay >= startDay && todayDay < startDay + days
      ? (todayDay - startDay + 0.5) / days
      : null,
    seasonTruncated,
  };
}

export function barGeometry(
  project: Pick<Project, 'startsAt' | 'endsAt'>,
  axis: CalendarAxis,
  today: string,
): BarGeometry | null {
  const fullStartKey = dateKeyOf(project.startsAt);
  if (!fullStartKey) return null;
  const fullEndKey = dateKeyOf(project.endsAt) ?? today;
  if (fullEndKey < fullStartKey) {
    console.warn('[calendar] Ignored a project whose end date precedes its start date.');
    return null;
  }
  const fullStart = dayNumber(fullStartKey);
  const fullEnd = dayNumber(fullEndKey);
  const axisEnd = axis.startDay + axis.days - 1;
  if (fullEnd < axis.startDay || fullStart > axisEnd) return null;
  const start = Math.max(fullStart, axis.startDay);
  const end = Math.min(fullEnd, axisEnd);
  return {
    left: (start - axis.startDay) / axis.days,
    width: Math.min(1, (end - start + 1) / axis.days),
    startKey: keyFromDay(start),
    endKey: keyFromDay(end),
    fullStartKey,
    fullEndKey,
    days: end - start + 1,
    clippedStart: fullStart < axis.startDay,
    clippedEnd: fullEnd > axisEnd,
    openEnded: !dateKeyOf(project.endsAt),
  };
}

export function milestoneLeft(plannedAt: string, axis: CalendarAxis): number | null {
  const key = dateKeyOf(plannedAt);
  if (!key) return null;
  const day = dayNumber(key) - axis.startDay;
  return day >= 0 && day < axis.days ? (day + 0.5) / axis.days : null;
}

export function bandGeometry(
  range: { startsAt: string; endsAt: string },
  axis: CalendarAxis,
): { left: number; width: number } | null {
  const startKey = dateKeyOf(range.startsAt);
  const endKey = dateKeyOf(range.endsAt);
  if (!startKey || !endKey || endKey < startKey) return null;
  const start = dayNumber(startKey);
  const end = dayNumber(endKey);
  const axisEnd = axis.startDay + axis.days - 1;
  if (end < axis.startDay || start > axisEnd) return null;
  const clippedStart = Math.max(start, axis.startDay);
  const clippedEnd = Math.min(end, axisEnd);
  return {
    left: (clippedStart - axis.startDay) / axis.days,
    width: Math.min(1, (clippedEnd - clippedStart + 1) / axis.days),
  };
}

// Keep this assertion next to the map so a new contract stage fails typechecking until translated.
const _allStagesHaveLabels: Record<(typeof STAGE_PIPELINE_STAGES)[number], TranslationKey> = STAGE_LABEL_KEYS;
void _allStagesHaveLabels;
