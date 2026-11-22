import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { GroupSchema, MemberSchema } from '@teamhub/hub-contracts';
import { hashPin } from '../src/identity/pin.js';
import { createTestHub, login, memberId, TEST_PASSWORDS, type TestHub } from './support/build-test-hub-server.js';

let hub: TestHub | undefined;
afterEach(async () => { if (hub) await hub.close(); hub = undefined; });

const OTHER_GROUP = { id: 'grp-v1-2', name: '结构', kind: 'custom' } as const;
const OUTSIDER = { id: 'member-v1-9', name: 'outsider', groupId: OTHER_GROUP.id, pin: 'outsider-password' };

/** 现有 harness 只有单组；排期窄权限必须验证跨组，所以补一个组和一个组外成员。 */
function seedOtherGroup(target: TestHub): void {
  const group = GroupSchema.parse({ id: OTHER_GROUP.id, name: OTHER_GROUP.name, kind: OTHER_GROUP.kind });
  const member = MemberSchema.parse({
    id: OUTSIDER.id, displayName: OUTSIDER.name, role: 'member', grade: 'junior',
    groupId: group.id, updatedAt: '2026-11-17T04:00:00.000Z', pinHash: hashPin(OUTSIDER.pin),
  });
  target.database.db.tx(() => {
    target.database.db.insertRow('groups', group.id, group);
    target.database.db.insertRow('members', member.id, member);
  });
}

async function createTask(app: FastifyInstance, cookie: string, payload: Record<string, unknown>): Promise<Record<string, any>> {
  const response = await app.inject({
    method: 'POST', url: '/api/tasks', headers: { cookie },
    payload: { collaboratorIds: [], intrinsicComplexity: 'normal', ...payload },
  });
  expect(response.statusCode).toBe(201);
  return response.json().task;
}

function schedule(app: FastifyInstance, cookie: string, taskId: string, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: `/api/tasks/${taskId}/schedule`, headers: { cookie }, payload });
}

describe('task scheduling (calendar drag)', () => {
  it('lets the author reschedule and only touches planned dates', async () => {
    hub = createTestHub();
    seedOtherGroup(hub);
    const owner = await login(hub.app, 'owner', TEST_PASSWORDS.owner);
    const created = await hub.app.inject({
      method: 'POST', url: '/api/weeks/2026-W47/tasks', headers: { cookie: owner },
      payload: {
        groupId: hub.system.listGroups()[0].id, title: '排期原样任务', rawSummary: '只改日期',
        intrinsicComplexity: 'normal', plannedStart: '2026-11-16', plannedEnd: '2026-11-18',
      },
    });
    expect(created.statusCode).toBe(201);
    const task = created.json().task;
    expect(task.revision).toBe(0);
    expect(task.weekLinks).toHaveLength(1);

    const response = await schedule(hub.app, owner, task.id, {
      plannedStart: '2026-11-20', plannedEnd: '2026-11-22', expectedRevision: 0,
    });
    expect(response.statusCode).toBe(200);
    const updated = response.json().task;
    expect(updated).toMatchObject({
      id: task.id, title: '排期原样任务', rawSummary: '只改日期',
      plannedStart: '2026-11-20', plannedEnd: '2026-11-22', revision: 1,
    });
    expect(updated.weekLinks).toEqual(task.weekLinks);
    expect(updated.activity).toHaveLength(task.activity.length + 1);
    expect(updated.activity.at(-1)).toMatchObject({
      kind: 'rescheduled', by: { id: memberId(hub, 'owner') },
      note: '2026-11-16~2026-11-18 → 2026-11-20~2026-11-22',
    });
  });

  it('lets the owner reschedule a task authored by someone else', async () => {
    hub = createTestHub();
    const admin = await login(hub.app, 'admin', TEST_PASSWORDS.admin);
    const owner = await login(hub.app, 'owner', TEST_PASSWORDS.owner);
    const task = await createTask(hub.app, admin, {
      groupId: hub.system.listGroups()[0].id, title: '负责人改期', rawSummary: 'owner 是负责人',
      ownerId: memberId(hub, 'owner'), plannedStart: '2026-11-16', plannedEnd: '2026-11-16',
    });
    const response = await schedule(hub.app, owner, task.id, {
      plannedStart: '2026-11-18', plannedEnd: '2026-11-19', expectedRevision: task.revision,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().task.plannedStart).toBe('2026-11-18');
  });

  it('lets a same-group member reschedule but rejects a cross-group member', async () => {
    hub = createTestHub();
    seedOtherGroup(hub);
    const owner = await login(hub.app, 'owner', TEST_PASSWORDS.owner);
    const reviewer = await login(hub.app, 'reviewer', TEST_PASSWORDS.reviewer);
    const outsider = await login(hub.app, OUTSIDER.name, OUTSIDER.pin);
    const task = await createTask(hub.app, owner, {
      groupId: hub.system.listGroups()[0].id, title: '同组可改', rawSummary: '他人任务',
      ownerId: memberId(hub, 'owner'), plannedStart: '2026-11-16', plannedEnd: '2026-11-17',
    });

    const byPeer = await schedule(hub.app, reviewer, task.id, {
      plannedStart: '2026-11-17', plannedEnd: '2026-11-18', expectedRevision: task.revision,
    });
    expect(byPeer.statusCode).toBe(200);

    const byOutsider = await schedule(hub.app, outsider, task.id, {
      plannedStart: '2026-11-19', plannedEnd: '2026-11-20', expectedRevision: byPeer.json().task.revision,
    });
    expect(byOutsider.statusCode).toBe(403);
    expect(byOutsider.json()).toMatchObject({ code: 'FORBIDDEN', detail: '只能调整本组任务的日期' });
    expect((await hub.app.inject({ method: 'GET', url: '/api/tasks', headers: { cookie: outsider } })).statusCode).toBe(200);
  });

  it('lets the PM reschedule any group', async () => {
    hub = createTestHub();
    seedOtherGroup(hub);
    const admin = await login(hub.app, 'admin', TEST_PASSWORDS.admin);
    const task = await createTask(hub.app, admin, {
      groupId: OTHER_GROUP.id, title: '外组任务', rawSummary: 'PM 可改',
      ownerId: OUTSIDER.id, plannedStart: '2026-11-16', plannedEnd: '2026-11-16',
    });
    const response = await schedule(hub.app, admin, task.id, {
      plannedStart: '2026-11-23', plannedEnd: '2026-11-24', expectedRevision: task.revision,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().task).toMatchObject({ groupId: OTHER_GROUP.id, plannedStart: '2026-11-23' });
  });

  it('rejects stale revisions, inverted ranges and unknown tasks', async () => {
    hub = createTestHub();
    const owner = await login(hub.app, 'owner', TEST_PASSWORDS.owner);
    const task = await createTask(hub.app, owner, {
      groupId: hub.system.listGroups()[0].id, title: '冲突与校验', rawSummary: '409/400/404',
      ownerId: memberId(hub, 'owner'), plannedStart: '2026-11-16', plannedEnd: '2026-11-18',
    });

    const stale = await schedule(hub.app, owner, task.id, {
      plannedStart: '2026-11-19', plannedEnd: '2026-11-20', expectedRevision: 7,
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: 'CONFLICT', detail: '任务已更新，请刷新后再提交' });

    const inverted = await schedule(hub.app, owner, task.id, {
      plannedStart: '2026-11-20', plannedEnd: '2026-11-19', expectedRevision: task.revision,
    });
    expect(inverted.statusCode).toBe(400);
    expect(inverted.body).toContain('plannedEnd');

    const missing = await schedule(hub.app, owner, 'task-v1-999', {
      plannedStart: '2026-11-20', plannedEnd: '2026-11-20', expectedRevision: 0,
    });
    expect(missing.statusCode).toBe(404);

    const unchanged = await hub.app.inject({ method: 'GET', url: '/api/tasks', headers: { cookie: owner } });
    expect(unchanged.json().tasks.find((item: { id: string }) => item.id === task.id))
      .toMatchObject({ plannedStart: '2026-11-16', plannedEnd: '2026-11-18', revision: 0 });
  });
});
