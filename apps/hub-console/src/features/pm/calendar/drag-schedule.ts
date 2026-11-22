import { addDays, dateKeyOf, dayNumber } from './model';

/** 超过这个位移才进入拖拽；否则仍按点击处理（点条开详情）。 */
export const DRAG_THRESHOLD = 4;
/** 左右边缘拉伸热区宽度（px）。 */
export const RESIZE_ZONE = 6;

export type DragMode = 'move' | 'resize-start' | 'resize-end';

export interface ScheduleRange { plannedStart: string; plannedEnd: string }

/**
 * 命中哪条边取决于指针在条内的横向偏移。
 * 被周边界裁掉的一端没有真实边缘，不能拉伸，否则会把裁剪误解成任务起点。
 */
export function dragModeAt(offsetX: number, width: number, clippedStart: boolean, clippedEnd: boolean): DragMode {
  if (!clippedStart && offsetX <= RESIZE_ZONE) return 'resize-start';
  if (!clippedEnd && width - offsetX <= RESIZE_ZONE) return 'resize-end';
  return 'move';
}

/** 整体平移：保持原时长，按锚点日期到目标日期的天数差整体挪动。 */
export function movedRange(startKey: string, endKey: string, anchorKey: string, targetKey: string): ScheduleRange {
  const delta = dayNumber(targetKey) - dayNumber(anchorKey);
  return { plannedStart: addDays(startKey, delta), plannedEnd: addDays(endKey, delta) };
}

/** 拉伸：只改被拖的那一端，越界时收缩成单日，保证 end >= start。 */
export function resizedRange(mode: Exclude<DragMode, 'move'>, startKey: string, endKey: string, targetKey: string): ScheduleRange {
  if (mode === 'resize-start') {
    return targetKey > endKey
      ? { plannedStart: endKey, plannedEnd: endKey }
      : { plannedStart: targetKey, plannedEnd: endKey };
  }
  return targetKey < startKey
    ? { plannedStart: startKey, plannedEnd: startKey }
    : { plannedStart: startKey, plannedEnd: targetKey };
}

export function rangeForDrag(mode: DragMode, startKey: string, endKey: string, anchorKey: string, targetKey: string): ScheduleRange {
  return mode === 'move' ? movedRange(startKey, endKey, anchorKey, targetKey) : resizedRange(mode, startKey, endKey, targetKey);
}

export function rangeOf(task: { plannedStart?: string | null; plannedEnd?: string | null }): ScheduleRange | null {
  const start = dateKeyOf(task.plannedStart);
  if (!start) return null;
  return { plannedStart: start, plannedEnd: dateKeyOf(task.plannedEnd) ?? start };
}

/**
 * 用几何位置反查目标日期格，而不是 elementFromPoint：拖拽中指针下方是本条任务/ghost，
 * 命中测试拿不到日期格。纵向先锁定周行，横向按 7 等分取列。
 */
export function dayKeyAtPoint(container: HTMLElement, x: number, y: number): string | null {
  const weeks = Array.from(container.querySelectorAll<HTMLElement>('.calendar-month-week'));
  if (!weeks.length) return null;
  let row = weeks[weeks.length - 1];
  for (const week of weeks) {
    const rect = week.getBoundingClientRect();
    if (y >= rect.top && y <= rect.bottom) { row = week; break; }
    if (y < rect.top) { row = week; break; }
  }
  const rect = row.getBoundingClientRect();
  if (rect.width <= 0) return null;
  const column = Math.min(6, Math.max(0, Math.floor(((x - rect.left) / rect.width) * 7)));
  const days = row.querySelectorAll<HTMLElement>('.calendar-month-day[data-date]');
  return days[column]?.dataset.date ?? null;
}

export function rangeLabel(start: string, end: string): string {
  return start === end ? start : `${start} → ${end}`;
}
