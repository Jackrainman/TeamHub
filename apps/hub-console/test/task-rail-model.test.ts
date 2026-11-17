import { describe, expect, it } from 'vitest';
import type { TaskWithMeta } from '@teamhub/hub-contracts';
import { filterRailTasks, groupRailTasks, railDisplayStatus } from '../src/features/pm/rail/task-rail-model';

function task(id: string, patch: Partial<TaskWithMeta> = {}): TaskWithMeta {
  return { id, groupId: 'grp-1', title: id, rawSummary: 'fixture', status: 'pending', statusSource: 'console',
    ownerId: 'me', collaboratorIds: [], intrinsicComplexity: 'normal', lastProgressAt: null,
    createdAt: '2026-11-17T01:00:00.000Z', updatedAt: '2026-11-17T01:00:00.000Z', ...patch };
}
describe('persistent task rail', () => {
  it('filters mine, active, awaiting review and accepted', () => {
    const tasks = [task('active'), task('other', { ownerId: 'other' }),
      task('awaiting', { status: 'done', completedAt: '2026-11-17T02:00:00.000Z' }),
      task('accepted', { status: 'done', reviewedBy: { id: 'reviewer', displayName: 'reviewer', source: 'console' } })];
    expect(filterRailTasks(tasks, { scope: 'mine', status: 'active', sessionMemberId: 'me' }).map(item => item.id)).toEqual(['active']);
    expect(filterRailTasks(tasks, { scope: 'team', status: 'awaitingReview' }).map(item => item.id)).toEqual(['awaiting']);
    expect(filterRailTasks(tasks, { scope: 'team', status: 'accepted' }).map(item => item.id)).toEqual(['accepted']);
    expect(railDisplayStatus(tasks[2])).toBe('awaitingReview');
  });
  it('groups by time with an explicit now and never invents current time', () => {
    const now = new Date('2026-11-17T04:00:00.000Z');
    const sections = groupRailTasks([task('today'), task('done', { status: 'done' })], 'time', [], now, '2026-W47');
    expect(sections.map(section => [section.value, section.tasks.map(item => item.id)])).toEqual([
      ['today', ['today']], ['closed', ['done']],
    ]);
    expect(groupRailTasks([task('grouped')], 'group', [{ id: 'grp-1', name: '电路', kind: 'ec' }], now)[0].value).toBe('grp-1');
  });
});
