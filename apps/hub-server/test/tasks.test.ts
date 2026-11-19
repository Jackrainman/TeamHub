import { afterEach, describe, expect, it } from 'vitest';
import { buildHubServer } from '../src/server.js';
import { FixedClock } from '../src/clock.js';
import { createTestHub, login, memberId, TEST_PASSWORDS, type TestHub } from './support/build-test-hub-server.js';

let hub: TestHub | undefined;
afterEach(async () => { if (hub) await hub.close(); hub = undefined; });
describe('v1 task lifecycle', () => {
  it('logs in with PIN and persists create → complete → delivery → accept → reopen', async () => {
    hub = createTestHub();
    const cookie = await login(hub.app, 'owner', TEST_PASSWORDS.owner);
    const groupId = hub.system.listGroups()[0].id;
    const created = await hub.app.inject({ method: 'POST', url: '/api/tasks', headers: { cookie }, payload: {
      groupId, title: 'v1 交付任务', rawSummary: '验证交付与验收', ownerId: memberId(hub, 'owner'),
      collaboratorIds: [], intrinsicComplexity: 'normal', plannedStart: '2026-11-16', plannedEnd: '2026-11-22',
    } });
    expect(created.statusCode).toBe(201);
    const task = created.json().task;
    expect(task.id).toMatch(/^task-v1-/);
    expect(task.projectId).toBeUndefined();
    expect(task.plannedEnd).toBe('2026-11-22');
    const completed = await hub.app.inject({ method: 'POST', url: `/api/tasks/${task.id}/complete`, headers: { cookie }, payload: {} });
    expect(completed.statusCode).toBe(200);
    expect(completed.json().task.completedBy.displayName).toBe('owner');
    const missing = await hub.app.inject({ method: 'POST', url: `/api/tasks/${task.id}/review`, headers: { cookie }, payload: { outcome: 'accept' } });
    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toMatchObject({ code: 'DELIVERY_REQUIRED' });
    const reviewed = await hub.app.inject({ method: 'POST', url: `/api/tasks/${task.id}/review`, headers: { cookie }, payload: {
      outcome: 'accept', delivery: { summary: '完成驱动优化', deliverable: '固件与测试记录', paths: ['src/driver.c', 'tests/driver.test.c'] },
    } });
    expect(reviewed.statusCode).toBe(200);
    expect(reviewed.json().task.reviewedBy.displayName).toBe('owner');
    expect(reviewed.json().task.delivery.paths).toHaveLength(2);
    await hub.app.close();
    hub.app = buildHubServer({ database: hub.database, clock: new FixedClock(new Date('2026-11-17T04:00:00.000Z')) });
    const refreshed = await hub.app.inject({ method: 'GET', url: '/api/tasks?scope=mine', headers: { cookie } });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().tasks[0]).toMatchObject({ id: task.id, status: 'done', plannedStart: '2026-11-16', plannedEnd: '2026-11-22' });
    expect(refreshed.json().tasks[0].delivery.summary).toBe('完成驱动优化');
    const publicMembers = await hub.app.inject({ method: 'GET', url: '/api/members', headers: { cookie } });
    expect(JSON.stringify(publicMembers.body)).not.toContain('pinHash');
    expect(JSON.stringify(publicMembers.body)).not.toContain(TEST_PASSWORDS.owner);
  });

  it('supports weekly peer review, rejection and reclaim rules', async () => {
    hub = createTestHub();
    const owner = await login(hub.app, 'owner', TEST_PASSWORDS.owner);
    const reviewer = await login(hub.app, 'reviewer', TEST_PASSWORDS.reviewer);
    const groupId = hub.system.listGroups()[0].id;
    const reviewerId = memberId(hub, 'reviewer');
    const created = await hub.app.inject({ method: 'POST', url: '/api/weeks/2026-W47/tasks', headers: { cookie: owner }, payload: {
      groupId, title: '周任务', rawSummary: '同伴验收', intrinsicComplexity: 'normal', reviewerIds: [reviewerId],
    } });
    expect(created.statusCode).toBe(201);
    const id = created.json().task.id;
    expect((await hub.app.inject({ method: 'POST', url: `/api/tasks/${id}/complete`, headers: { cookie: owner }, payload: {} })).statusCode).toBe(200);
    const rejected = await hub.app.inject({ method: 'POST', url: `/api/tasks/${id}/review`, headers: { cookie: reviewer }, payload: { outcome: 'reject', note: '补测试' } });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json().task.status).toBe('inProgress');
    expect(rejected.json().task.reviewedBy).toBeUndefined();
    expect((await hub.app.inject({ method: 'POST', url: `/api/tasks/${id}/complete`, headers: { cookie: owner }, payload: {} })).statusCode).toBe(200);
    const accepted = await hub.app.inject({ method: 'POST', url: `/api/tasks/${id}/review`, headers: { cookie: reviewer }, payload: { outcome: 'accept' } });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().task.reviewedBy.id).toBe(reviewerId);
    const terminal = await hub.app.inject({ method: 'POST', url: `/api/tasks/${id}/status`, headers: { cookie: owner }, payload: { status: 'inProgress' } });
    expect(terminal.statusCode).toBe(409);
  });

  it('claims an ownerless task and enforces explicit write authentication', async () => {
    hub = createTestHub();
    const owner = await login(hub.app, 'owner', TEST_PASSWORDS.owner);
    const groupId = hub.system.listGroups()[0].id;
    const created = await hub.app.inject({ method: 'POST', url: '/api/tasks', headers: { cookie: owner }, payload: {
      groupId, title: '待认领', rawSummary: '认领路径', ownerId: null, collaboratorIds: [], intrinsicComplexity: 'normal',
    } });
    const id = created.json().task.id;
    const claimed = await hub.app.inject({ method: 'POST', url: `/api/tasks/${id}/claim`, headers: { cookie: owner }, payload: {} });
    expect(claimed.statusCode).toBe(200);
    expect(claimed.json().task.ownerId).toBe(memberId(hub, 'owner'));
    expect(claimed.json().task.status).toBe('inProgress');
    expect((await hub.app.inject({ method: 'POST', url: `/api/tasks/${id}/complete`, payload: {} })).statusCode).toBe(401);
  });
});
