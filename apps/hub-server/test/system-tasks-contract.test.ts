import { afterEach, describe, expect, it } from 'vitest';
import type { SystemTasksPort } from '../src/modules/system/public.js';
import { createTestHub, login, TEST_PASSWORDS, type TestHub } from './support/build-test-hub-server.js';
import { createTasksContractFixture } from './support/tasks-public-contract-fixture.js';

let hub: TestHub | undefined;
afterEach(async () => { if (hub) await hub.close(); hub = undefined; });

describe('system → tasks query public contract', () => {
  it('provides group occupancy and export rows consumed by system', async () => {
    const fixture = createTasksContractFixture();
    hub = fixture.hub;
    const tasks: SystemTasksPort = fixture.tasks;
    const groupId = hub.system.listGroups()[0].id;
    expect(tasks.hasTasksInGroup(groupId)).toBe(false);

    const cookie = await login(hub.app, 'owner', TEST_PASSWORDS.owner);
    const created = await hub.app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { cookie },
      payload: {
        groupId,
        title: '公开导出契约',
        rawSummary: 'system 不读 tasks 表',
        ownerId: null,
        collaboratorIds: [],
        intrinsicComplexity: 'normal',
        plannedStart: '2026-11-16',
        plannedEnd: '2026-11-22',
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const taskId = created.json().task.id;

    expect(tasks.hasTasksInGroup(groupId)).toBe(true);
    expect(tasks.hasTasksInGroup('grp-v1-missing')).toBe(false);
    expect(tasks.listForExport()).toEqual([{
      id: taskId,
      title: '公开导出契约',
      groupId,
      status: 'pending',
      plannedStart: '2026-11-16',
      plannedEnd: '2026-11-22',
      rawSummary: 'system 不读 tasks 表',
    }]);

    const adminCookie = await login(hub.app, 'admin', TEST_PASSWORDS.admin);
    const exported = await hub.app.inject({ method: 'GET', url: '/api/export/tasks', headers: { cookie: adminCookie } });
    expect(exported.statusCode).toBe(200);
    expect(exported.body).toContain(taskId);
    expect(exported.body).toContain('公开导出契约');
  });

  it('keeps group deletion conflict behavior through the public task query', async () => {
    hub = createTestHub();
    const adminCookie = await login(hub.app, 'admin', TEST_PASSWORDS.admin);
    const ownerCookie = await login(hub.app, 'owner', TEST_PASSWORDS.owner);
    const createdGroup = await hub.app.inject({
      method: 'POST', url: '/api/groups', headers: { cookie: adminCookie }, payload: { name: '任务占用组' },
    });
    const groupId = createdGroup.json().group.id;
    const createdTask = await hub.app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { cookie: ownerCookie },
      payload: {
        groupId,
        title: '阻止删组',
        rawSummary: 'hasTasksInGroup 契约',
        ownerId: null,
        collaboratorIds: [],
        intrinsicComplexity: 'normal',
      },
    });
    expect(createdTask.statusCode, createdTask.body).toBe(201);
    const deleted = await hub.app.inject({ method: 'DELETE', url: `/api/groups/${groupId}`, headers: { cookie: adminCookie } });
    expect(deleted.statusCode).toBe(409);
    expect(deleted.json()).toMatchObject({ code: 'CONFLICT', detail: '该组下还有任务' });
  });
});
