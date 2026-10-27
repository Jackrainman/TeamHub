import { describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  AssignTaskResponseSchema,
  ClaimTaskResponseSchema,
  CreateTaskResponseSchema,
  ReleaseTaskResponseSchema,
  TasksResponseSchema,
  governanceScenarioFixture,
} from '@teamhub/hub-contracts';
import type { ActorRef, GovernanceSnapshot, TaskStatus } from '@teamhub/hub-contracts';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import { InMemoryPmRepository } from './support/inmemory-pm-repository.js';
import { usernameOf } from './support/login-helpers.js';

const CIRCUIT_OWNER: ActorRef = { id: 'm-circuitD', displayName: '电路D', source: 'console' };
const EC_MEMBER: ActorRef = { id: 'm-ecB', displayName: '电控B', source: 'console' };
const MECH_LEAD: ActorRef = { id: 'm-mechC', displayName: '机械C', source: 'console' };

function withCircuitLead(): GovernanceSnapshot {
  return {
    ...governanceScenarioFixture,
    members: governanceScenarioFixture.members.map((member) =>
      member.id === 'm-ecB'
        ? { ...member, role: 'groupAdmin' as const, groupId: 'grp-circuit' }
        : member,
    ),
  };
}

function withNewboard(overrides: { status?: TaskStatus; ownerId?: string | null }): GovernanceSnapshot {
  return {
    ...governanceScenarioFixture,
    tasks: governanceScenarioFixture.tasks.map((task) =>
      task.id === 't-r1-newboard' ? { ...task, ...overrides } : task,
    ),
  };
}

async function login(app: FastifyInstance, memberId: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/session',
    payload: { username: usernameOf(memberId) },
  });
  expect(response.statusCode).toBe(200);
  const cookie = response.cookies.find((item) => item.name === 'teamhub_session');
  const header = `teamhub_session=${cookie!.value}`;
  const pin = await app.inject({
    method: 'PUT',
    url: `/api/members/${memberId}/pin`,
    headers: { cookie: header },
    payload: { pin: '1234abcd' },
  });
  expect(pin.statusCode).toBe(200);
  return header;
}

describe('D-095 身份模式退池权限', () => {
  test('当前完成人可退池：状态、当前认领字段和两条历史同笔更新', async () => {
    const store = new InMemoryPmRepository();
    const app = buildTestHubServer({ identityMode: 'identity', store });
    try {
      const cookie = await login(app, 'm-circuitD');
      const response = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-newboard/release',
        headers: { cookie },
        payload: { reason: '改由下一棒继续' },
      });
      expect(response.statusCode).toBe(200);
      const task = ReleaseTaskResponseSchema.parse(response.json()).task;
      expect(task.ownerId).toBeNull();
      expect(task.status).toBe('pending');
      expect(task.claimedAt).toBeUndefined();
      expect(task.assignReason).toBeUndefined();
      expect(task.assignedBy).toBeUndefined();
      expect(task.collaboratorIds).toEqual(['m-ecB']);
      expect(task.lastProgressAt).toBe('2026-06-10T22:00:00.000Z');
      expect(task.transitions?.at(-1)).toMatchObject({
        from: 'inProgress',
        to: 'pending',
        by: CIRCUIT_OWNER,
      });
      expect(task.ownershipEvents?.at(-1)).toMatchObject({
        kind: 'released',
        fromOwnerId: 'm-circuitD',
        toOwnerId: null,
        reason: '改由下一棒继续',
        by: CIRCUIT_OWNER,
      });
      expect((await store.getSnapshot()).tasks.find((item) => item.id === task.id)).toEqual(task);
    } finally {
      await app.close();
    }
  });

  test('本组组长可退池且理由可省略', async () => {
    const app = buildTestHubServer({
      identityMode: 'identity',
      store: new InMemoryPmRepository(withCircuitLead()),
    });
    try {
      const cookie = await login(app, 'm-ecB');
      const response = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-newboard/release',
        headers: { cookie },
        payload: {},
      });
      expect(response.statusCode).toBe(200);
      const task = ReleaseTaskResponseSchema.parse(response.json()).task;
      expect(task.ownerId).toBeNull();
      expect(task.ownershipEvents?.at(-1)).toMatchObject({
        kind: 'released',
        by: EC_MEMBER,
      });
      expect(task.ownershipEvents?.at(-1)?.reason).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  test('非本人且非本组组长 403，任务不变', async () => {
    const store = new InMemoryPmRepository();
    const app = buildTestHubServer({ identityMode: 'identity', store });
    try {
      const cookie = await login(app, 'm-ecB');
      const response = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-newboard/release',
        headers: { cookie },
        payload: {},
      });
      expect(response.statusCode).toBe(403);
      const task = (await store.getSnapshot()).tasks.find((item) => item.id === 't-r1-newboard');
      expect(task?.ownerId).toBe('m-circuitD');
      expect(task?.status).toBe('inProgress');
      expect(task?.ownershipEvents).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});

describe('D-095 退池前置条件与匿名 ActorRef', () => {
  test.each(['pending', 'blocked', 'done', 'shelved'] as const)('非法状态 %s → 409', async (status) => {
    const store = new InMemoryPmRepository(withNewboard({ status }));
    const app = buildTestHubServer({ store });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-newboard/release',
        payload: { releasedBy: CIRCUIT_OWNER },
      });
      expect(response.statusCode).toBe(409);
      expect((await store.getSnapshot()).tasks.find((task) => task.id === 't-r1-newboard')?.status).toBe(status);
    } finally {
      await app.close();
    }
  });

  test('无主任务 → 409；不存在 → 404；匿名缺留名 → 400', async () => {
    const noOwner = withCircuitLead();
    noOwner.tasks = noOwner.tasks.map((task) =>
      task.id === 't-r1-newboard' ? { ...task, ownerId: null } : task,
    );
    const app = buildTestHubServer({ store: new InMemoryPmRepository(noOwner) });
    try {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/tasks/t-r1-newboard/release',
            payload: { releasedBy: EC_MEMBER },
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/tasks/t-not-found/release',
            payload: { releasedBy: EC_MEMBER },
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/tasks/t-r1-newboard/release',
            payload: {},
          })
        ).statusCode,
      ).toBe(400);
    } finally {
      await app.close();
    }
  });
});

describe('D-095 认领 → 转派 → 退回 → 再认领归属历史', () => {
  test('事件完整追加，GET meta 稳定去重并排除当前完成人', async () => {
    const seed = {
      ...governanceScenarioFixture,
      members: governanceScenarioFixture.members.map((member) =>
        member.id === 'm-mechC' ? { ...member, role: 'groupAdmin' as const } : member,
      ),
    };
    const app = buildTestHubServer({ store: new InMemoryPmRepository(seed) });
    try {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: {
          projectId: 'prj-robots',
          groupId: 'grp-mech',
          title: '退池历史测试',
          rawSummary: '验证认领转派退池再认领',
          ownerId: null,
          collaboratorIds: [],
          intrinsicComplexity: 'normal',
        },
      });
      const taskId = CreateTaskResponseSchema.parse(created.json()).task.id;
      const claim = async () =>
        ClaimTaskResponseSchema.parse(
          (
            await app.inject({
              method: 'POST',
              url: `/api/tasks/${taskId}/claim`,
              payload: { memberId: 'm-mechD' },
            })
          ).json(),
        ).task;
      expect((await claim()).ownershipEvents?.map((event) => event.kind)).toEqual(['claimed']);

      const assigned = await app.inject({
        method: 'POST',
        url: `/api/tasks/${taskId}/assign`,
        payload: { ownerId: 'm-progB', reason: '转派验证', assignedBy: MECH_LEAD },
      });
      expect(assigned.statusCode).toBe(200);
      expect(AssignTaskResponseSchema.parse(assigned.json()).task.ownershipEvents?.at(-1)).toMatchObject({
        kind: 'assigned',
        fromOwnerId: 'm-mechD',
        toOwnerId: 'm-progB',
        reason: '转派验证',
      });

      const released = await app.inject({
        method: 'POST',
        url: `/api/tasks/${taskId}/release`,
        payload: { releasedBy: MECH_LEAD, reason: '退回交接' },
      });
      expect(released.statusCode).toBe(200);
      expect(ReleaseTaskResponseSchema.parse(released.json()).task.ownershipEvents?.at(-1)).toMatchObject({
        kind: 'released',
        fromOwnerId: 'm-progB',
        toOwnerId: null,
      });
      const postedMeta = TasksResponseSchema.parse(
        (await app.inject({ method: 'GET', url: '/api/tasks' })).json(),
      ).tasks.find((task) => task.id === taskId);
      expect(postedMeta?.previousOwnerIds).toEqual(['m-mechD', 'm-progB']);

      const reclaimed = await claim();
      expect(reclaimed.ownerId).toBe('m-mechD');
      expect(reclaimed.ownershipEvents?.map((event) => event.kind)).toEqual([
        'claimed',
        'assigned',
        'released',
        'claimed',
      ]);
      const finalMeta = TasksResponseSchema.parse(
        (await app.inject({ method: 'GET', url: '/api/tasks' })).json(),
      ).tasks.find((task) => task.id === taskId);
      expect(finalMeta?.previousOwnerIds).toEqual(['m-progB']);
    } finally {
      await app.close();
    }
  });
});
