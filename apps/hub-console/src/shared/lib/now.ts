import { getWeekKey, shanghaiDateKey } from '@teamhub/hub-contracts';

/** Components receive the current civil date/week from this Asia/Shanghai boundary. */
export function currentTaskTime(): Date { return new Date(); }
export function localDateTimeToIso(value: string): string { return new Date(value).toISOString(); }
export function currentShanghaiWeek(): string { return getWeekKey(currentTaskTime()); }
export function currentShanghaiDate(): string { return shanghaiDateKey(currentTaskTime()); }
