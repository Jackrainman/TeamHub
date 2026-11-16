import { describe, expect, test } from 'vitest';
import { governanceScenarioFixture, type TaskWithMeta } from '@teamhub/hub-contracts';
import { filterRailTasks, formatRailTime, groupRailTasks, latestWeekKey, railDisplayStatus, railTimeBucket, shanghaiDay } from '../src/features/pm/rail/task-rail-model';

const NOW = new Date('2026-11-17T02:00:00.000Z');
const CURRENT_WEEK = '2026-W47';
const today = '2026-11-17T01:00:00.000Z';
const yesterday = '2026-11-15T01:00:00.000Z';

function task(overrides: Partial<TaskWithMeta> = {}): TaskWithMeta {
  return {
    id: 't-1', projectId: 'p-1', projectName: 'Robots', groupId: 'grp-circuit', title: 'Task',
    rawSummary: 'Summary', status: 'inProgress', statusSource: 'console', ownerId: 'm-circuitD',
    collaboratorIds: [], intrinsicComplexity: 'normal', lastProgressAt: null,
    createdAt: today, updatedAt: today, isBig: false, previousOwnerIds: [], transitions: [],
    ...overrides,
  };
}
const week = (weekKey: string) => [{ weekKey, linkedAt: today, linkedBy: { id: 'm-circuitD', displayName: 'A', source: 'console' as const } }];

describe('task rail time buckets', () => {
  test('terminal states are archived even when reviewed', () => {
    expect(railTimeBucket(task({ status: 'done', reviewedBy: { id: 'm', displayName: 'M', source: 'console' } }), NOW, CURRENT_WEEK)).toBe('archived');
    expect(railTimeBucket(task({ status: 'shelved' }), NOW, CURRENT_WEEK)).toBe('archived');
  });
  test('latest week wins and historical unfinished work rolls into today', () => {
    expect(railTimeBucket(task({ weekLinks: [...week('2026-W45'), ...week(CURRENT_WEEK)], updatedAt: yesterday, claimedAt: undefined }), NOW, CURRENT_WEEK)).toBe('week');
    expect(railTimeBucket(task({ weekLinks: week('2026-W46') }), NOW, CURRENT_WEEK)).toBe('today');
  });
  test('unscheduled work uses creation day and invalid week keys are ignored', () => {
    expect(railTimeBucket(task({ weekLinks: [] }), NOW, CURRENT_WEEK)).toBe('today');
    expect(railTimeBucket(task({ createdAt: yesterday, weekLinks: [] }), NOW, CURRENT_WEEK)).toBe('later');
    expect(railTimeBucket(task({ weekLinks: week('not-a-week') }), NOW, CURRENT_WEEK)).toBe('today');
  });
  test('current-week activity selects today, future week stays later', () => {
    expect(railTimeBucket(task({ weekLinks: week(CURRENT_WEEK), updatedAt: today, claimedAt: undefined }), NOW, CURRENT_WEEK)).toBe('today');
    expect(railTimeBucket(task({ weekLinks: week(CURRENT_WEEK), updatedAt: yesterday, claimedAt: undefined }), NOW, CURRENT_WEEK)).toBe('week');
    expect(railTimeBucket(task({ weekLinks: week('2026-W48'), updatedAt: today }), NOW, CURRENT_WEEK)).toBe('later');
  });
  test('Shanghai day boundary and latestWeekKey fallback', () => {
    expect(shanghaiDay('2026-11-15T15:59:59Z')).toBe('2026-11-15');
    expect(shanghaiDay('2026-11-15T16:00:00Z')).toBe('2026-11-16');
    expect(latestWeekKey(task({ weekLinks: [...week('2026-W45'), ...week('2026-W46')] }))).toBe('2026-W46');
    expect(latestWeekKey(task({ weekLinks: [] }))).toBeUndefined();
  });
  test('rail time uses HH:mm today and MM-DD otherwise', () => {
    expect(formatRailTime('2026-11-17T01:05:00.000Z', NOW)).toBe('09:05');
    expect(formatRailTime('2026-11-15T01:05:00.000Z', NOW)).toBe('11-15');
  });
});

describe('task rail filtering, display and grouping', () => {
  const reviewer = { id: 'm-reviewer', displayName: 'R', source: 'console' as const };
  const awaiting = task({ id: 'awaiting', status: 'done', completedAt: today });
  const accepted = task({ id: 'accepted', status: 'done', completedAt: today, reviewedBy: reviewer });
  test('scope, active and acceptance filters use the shared derivation', () => {
    const other = task({ id: 'other', ownerId: 'm-other' });
    const shelved = task({ id: 'shelved', status: 'shelved' });
    expect(filterRailTasks([task(), other], { scope: 'mine', status: 'active', sessionMemberId: 'm-circuitD' }).map(item => item.id)).toEqual(['t-1']);
    expect(filterRailTasks([task()], { scope: 'mine', status: 'all', sessionMemberId: null })).toEqual([]);
    expect(filterRailTasks([task(), awaiting, shelved], { scope: 'team', status: 'active' }).map(item => item.id)).toEqual(['t-1']);
    expect(filterRailTasks([awaiting, accepted], { scope: 'team', status: 'awaitingReview' }).map(item => item.id)).toEqual(['awaiting']);
    expect(filterRailTasks([awaiting, accepted], { scope: 'team', status: 'accepted' }).map(item => item.id)).toEqual(['accepted']);
    expect(railDisplayStatus(awaiting)).toBe('awaitingReview');
    expect(railDisplayStatus(accepted)).toBe('accepted');
    expect(railDisplayStatus(task())).toBe('inProgress');
  });
  test('all groupings have stable order, omit empty sections and sort by recency', () => {
    const old = task({ id: 'b', createdAt: yesterday, updatedAt: yesterday, weekLinks: [] });
    const recent = task({ id: 'a', createdAt: yesterday, updatedAt: today, weekLinks: [] });
    const timeSections = groupRailTasks([old, recent, awaiting], 'time', [], NOW, CURRENT_WEEK);
    expect(timeSections.map(section => section.value)).toEqual(['later', 'archived']);
    expect(timeSections[0]?.tasks.map(item => item.id)).toEqual(['a', 'b']);
    expect(groupRailTasks([old, recent], 'group', governanceScenarioFixture.groups, NOW, CURRENT_WEEK)[0]?.tasks.map(item => item.id)).toEqual(['a', 'b']);
    const statusSections = groupRailTasks([accepted, awaiting, task()], 'status', [], NOW, CURRENT_WEEK);
    expect(statusSections.map(section => section.value)).toEqual(['inProgress', 'awaitingReview', 'accepted']);
  });
});
