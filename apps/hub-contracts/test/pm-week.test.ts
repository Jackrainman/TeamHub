import { describe, expect, test } from 'vitest';
import { governanceScenarioFixture, deriveTaskAcceptance, TaskSchema } from '../src/index.js';
import * as week from '../src/domains/pm/week.js';

const task = governanceScenarioFixture.tasks[0]!;
const link = { weekKey: '2026-W44', linkedAt: '2026-10-28T00:00:00.000Z', linkedBy: { id: 'a', displayName: 'A', source: 'console' as const } };
describe('weekly task facts', () => {
  test('Shanghai Monday and ISO year boundaries', () => {
    expect(week.getWeekKey('2026-10-25T15:59:59Z')).toBe('2026-W43');
    expect(week.getWeekKey('2026-10-25T16:00:00Z')).toBe('2026-W44');
    expect(week.getWeekKey('2021-01-01T00:00:00Z')).toBe('2020-W53');
    expect(week.shiftWeek('2020-W53', 1)).toBe('2021-W01');
    expect(week.isValidWeekKey('2021-W53')).toBe(false);
    expect(week.isValidWeekKey('2026-W00')).toBe(false);
    expect(week.isValidWeekKey('2026-W54')).toBe(false);
    expect(week.isValidWeekKey('2026-W1')).toBe(false);
    expect(week.isCurrentWeek('2026-W43', link.linkedAt)).toBe(false);
    expect(week.isCurrentWeek('2026-W45', link.linkedAt)).toBe(false);
  });
  test('pool is global, historical view uses latest status, mine is session only', () => {
    const tasks = [
      { ...task, id: 'mine', ownerId: 'a', status: 'blocked' as const, weekLinks: [link] },
      { ...task, id: 'other', ownerId: 'b', status: 'done' as const, weekLinks: [link] },
      { ...task, id: 'pool', ownerId: null, status: 'pending' as const },
      { ...task, id: 'shelved', ownerId: null, status: 'shelved' as const, weekLinks: [link] },
    ];
    expect(week.selectWeekTasks(tasks, '2026-W44', 'active', 'mine', 'a').map(t => t.id)).toEqual(['mine']);
    expect(week.selectWeekTasks(tasks, '2026-W44', 'completed', 'team', 'a').map(t => t.id)).toEqual(['other']);
    expect(week.selectWeekTasks(tasks, '2026-W43', 'pool', 'mine', 'a').map(t => t.id)).toEqual(['pool']);
    expect(week.selectWeekTasks(tasks, '2026-W44', 'active', 'mine', null)).toEqual([]);
  });
  test('all weekly tasks require another member acceptance; ordinary small task unchanged', () => {
    const done = { ...task, status: 'done' as const, weekLinks: [link], reviewedBy: undefined };
    expect(deriveTaskAcceptance(done, false)).toBe('awaitingReview');
    expect(deriveTaskAcceptance({ ...done, reviewedBy: link.linkedBy }, false)).toBe('accepted');
    expect(deriveTaskAcceptance({ ...done, weekLinks: [] }, false)).toBe('selfDone');
    expect(TaskSchema.shape).not.toHaveProperty('dueDate');
  });
});
