import { describe, expect, it } from 'vitest';
import {
  ACCEPTANCE_CUTOFF, CreateTaskRequestSchema, DeliverySchema, deriveTaskAcceptance,
  getWeekKey, selectTeamTasks, shanghaiDateKey, weekEndDateKey, weekStartDateKey,
} from '../src/index.js';
import type { Task, TaskWithMeta } from '../src/index.js';

function task(patch: Partial<Task> = {}): TaskWithMeta {
  return {
    id: 'task-1', groupId: 'grp-1', title: '任务', rawSummary: '摘要', status: 'pending',
    statusSource: 'console', ownerId: 'member-1', collaboratorIds: [], intrinsicComplexity: 'normal',
    lastProgressAt: null, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
    ...patch,
  };
}
describe('v1 task contracts', () => {
  it('derives acceptance with the historical cutoff and terminal done state', () => {
    expect(ACCEPTANCE_CUTOFF).toBe('2026-11-16T00:00:00.000Z');
    expect(deriveTaskAcceptance(task({ status: 'done', completedAt: '2026-11-15T23:59:59.000Z' }))).toBe('accepted');
    expect(deriveTaskAcceptance(task({ status: 'done', completedAt: '2026-11-17T00:00:00.000Z' }))).toBe('awaitingReview');
    expect(deriveTaskAcceptance(task({ status: 'done', reviewedBy: { id: 'm2', displayName: '验收', source: 'console' } }))).toBe('accepted');
    expect(deriveTaskAcceptance(task({ status: 'inProgress' }))).toBe('notDone');
  });
  it('requires complete delivery evidence', () => {
    expect(DeliverySchema.safeParse({ summary: '', deliverable: '', paths: [] }).success).toBe(false);
    expect(DeliverySchema.parse({ summary: '完成', deliverable: '代码', paths: ['src/a.ts'] }).paths).toEqual(['src/a.ts']);
  });
  it('keeps planned dates optional while rejecting reversed ranges at the API boundary', () => {
    const base = { groupId: 'grp-1', title: '任务', rawSummary: '摘要', ownerId: null, collaboratorIds: [], intrinsicComplexity: 'normal' };
    expect(CreateTaskRequestSchema.safeParse(base).success).toBe(true);
    expect(CreateTaskRequestSchema.safeParse({ ...base, plannedStart: '2026-11-20', plannedEnd: '2026-11-19' }).success).toBe(false);
    expect(() => task({ plannedStart: '2026-11-20', plannedEnd: '2026-11-19' })).not.toThrow();
  });
  it('uses Asia/Shanghai civil weeks and inclusive week dates', () => {
    expect(shanghaiDateKey('2026-11-16T16:30:00.000Z')).toBe('2026-11-17');
    expect(getWeekKey('2026-11-17T04:00:00.000Z')).toBe('2026-W47');
    expect(weekStartDateKey('2026-W01')).toBe('2025-12-29');
    expect(weekEndDateKey('2026-W01')).toBe('2026-01-04');
  });
  it('filters personal scope only to the current member', () => {
    const mine = task({ ownerId: 'me' });
    const other = task({ id: 'task-2', ownerId: 'other', title: '别人' });
    expect(selectTeamTasks([mine, other], { q: '', groupId: '', status: 'all', scope: 'mine', sessionMemberId: 'me' })).toEqual([mine]);
    expect(selectTeamTasks([mine, other], { q: '', groupId: '', status: 'all', scope: 'mine', sessionMemberId: 'other' })).toEqual([other]);
  });
});
