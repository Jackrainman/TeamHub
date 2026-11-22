import { describe, expect, it } from 'vitest';
import type { Task } from '@teamhub/hub-contracts';
import { buildMonthGrid, layoutWeekBars, statusToneOf } from '../src/features/pm/calendar/calendar-month';
import { addDays, dateKeyOf, filterTasksByScope } from '../src/features/pm/calendar/model';

function task(id: string, plannedStart?: string, plannedEnd?: string, patch: Partial<Task> = {}): Task {
  return { id, groupId: 'grp-1', title: id, rawSummary: 'calendar fixture', status: 'pending',
    ownerId: 'me', collaboratorIds: [], intrinsicComplexity: 'normal',
    createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', plannedStart, plannedEnd, ...patch };
}
describe('Task month calendar', () => {
  it('builds six civil weeks and marks only the injected Shanghai day as today', () => {
    const grid = buildMonthGrid(2026, 11, '2026-11-17');
    expect(grid.weeks).toHaveLength(6);
    expect(grid.weeks[0].days).toHaveLength(7);
    expect(grid.weeks[0].weekStart).toBe('2026-10-26');
    expect(grid.weeks.flatMap(week => week.days).filter(day => day.isToday).map(day => day.key)).toEqual(['2026-11-17']);
    expect(grid.weeks[0].days.map(day => day.weekend)).toEqual([false, false, false, false, false, true, true]);
  });
  it('clips cross-week bars and includes both start and end dates', () => {
    const across = task('across', '2026-11-20', '2026-11-23');
    const first = layoutWeekBars([across], '2026-11-16', '2026-11-17');
    const second = layoutWeekBars([across], '2026-11-23', '2026-11-17');
    expect(first.bars[0]).toMatchObject({ startCol: 4, endCol: 6, clippedStart: false, clippedEnd: true, spanDays: 3 });
    expect(second.bars[0]).toMatchObject({ startCol: 0, endCol: 0, clippedStart: true, clippedEnd: false, spanDays: 1 });
    const endDay = layoutWeekBars([task('single', '2026-11-22', '2026-11-22')], '2026-11-16', '2026-11-17');
    expect(endDay.bars[0]).toMatchObject({ startCol: 6, endCol: 6, spanDays: 1 });
  });
  it('keeps undated tasks out of bars, handles missing end as one day, and allocates lanes', () => {
    const tasks = [task('undated'), task('one-day', '2026-11-17'), task('lane-2', '2026-11-17', '2026-11-18')];
    const layout = layoutWeekBars(tasks, '2026-11-16', '2026-11-17');
    expect(layout.bars.map(bar => bar.taskId).sort()).toEqual(['lane-2', 'one-day']);
    expect(new Set(layout.bars.map(bar => bar.lane))).toEqual(new Set([0, 1]));
    expect(dateKeyOf(undefined)).toBeNull();
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  });
  it('maps bar colors to task status instead of hashing the id', () => {
    expect(statusToneOf('pending')).toBe('pending');
    expect(statusToneOf('inProgress')).toBe('inProgress');
    expect(statusToneOf('blocked')).toBe('blocked');
    expect(statusToneOf('done')).toBe('done');
    expect(statusToneOf('shelved')).toBe('shelved');
    expect(statusToneOf(undefined)).toBe('pending');
    expect(statusToneOf('unknown-status')).toBe('pending');
  });
  it('filters personal/group/team without person aggregation', () => {
    const mine = task('mine');
    const collaborated = task('collaborated', undefined, undefined, { ownerId: 'other', collaboratorIds: ['me'] });
    const other = task('other', undefined, undefined, { ownerId: 'other', groupId: 'grp-2' });
    expect(filterTasksByScope([mine, collaborated, other], 'personal', 'me', 'grp-1').map(item => item.id)).toEqual(['mine', 'collaborated']);
    expect(filterTasksByScope([mine, collaborated, other], 'group', 'me', 'grp-1').map(item => item.id)).toEqual(['mine', 'collaborated']);
    expect(filterTasksByScope([mine, collaborated, other], 'team', 'me', 'grp-1')).toHaveLength(3);
  });
});
