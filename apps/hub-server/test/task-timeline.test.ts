import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import { InMemoryGovStore } from '../src/store/mock-gov-store.js';
import { FileGovStore } from '../src/store/file-gov-store.js';
import { SqliteGovStore } from '../src/store/sqlite-gov-store.js';
import {
  ClaimTaskResponseSchema,
  CompleteTaskResponseSchema,
  ReviewTaskResponseSchema,
  TransitionTaskStatusResponseSchema,
  CreateTaskResponseSchema,
  TasksResponseSchema,
} from '@teamhub/hub-contracts';
import type { ActorRef } from '@teamhub/hub-contracts';

// TASK-TIMELINE：任务状态流转历史（transitions: {from,to,at,by}[]）。四个写口都留痕：
// 认领提升（claim pending→inProgress）/ 标完成（→done）/ 打回（reject done→inProgress）/ 人工流转
// （POST /status，by 身份模式 session 注入、匿名 body 供、皆无记无 by）。accept 不改状态不追加。
// 红线：transitions 是单卡事实（I0），只回放不聚合。

const CLAIMER: ActorRef = { id: 'm-mechD', displayName: '机械D', source: 'console' };
const OWNER: ActorRef = { id: 'm-progB', displayName: '程序B', source: 'human' };
const REVIEWER: ActorRef = { id: 'm-progA', displayName: '程序A', source: 'human' };

async function createPendingTask(app: Awaited<ReturnType<typeof buildTestHubServer>>): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/tasks',
    payload: {
      projectId: 'prj-robots',
      groupId: 'grp-mech',
      title: '挂单：整理线束',
      rawSummary: '无主的活',
      ownerId: null,
      collaboratorIds: [],
      intrinsicComplexity: 'trivial',
    },
  });
  expect(res.statusCode).toBe(201);
  return CreateTaskResponseSchema.parse(res.json()).task.id;
}

describe('TASK-TIMELINE 路由：四写口追加 transitions', () => {
  test('claim：pending→inProgress 留痕，by=认领人（名册 displayName，source 钉 console）', async () => {
    const app = buildTestHubServer();
    try {
      const id = await createPendingTask(app);
      const res = await app.inject({
        method: 'POST',
        url: `/api/tasks/${id}/claim`,
        payload: { memberId: 'm-mechD' },
      });
      expect(res.statusCode).toBe(200);
      const task = ClaimTaskResponseSchema.parse(res.json()).task;
      expect(task.transitions).toEqual([
        { from: 'pending', to: 'inProgress', at: task.claimedAt, by: CLAIMER },
      ]);
    } finally {
      await app.close();
    }
  });

  test('claim 非 pending 挂单（inProgress 无主）→ 不提升、不追加 transition', async () => {
    const app = buildTestHubServer();
    try {
      // t-r1-integration fixture status=inProgress、ownerId=null
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-integration/claim',
        payload: { memberId: 'm-mechD' },
      });
      expect(res.statusCode).toBe(200);
      expect(ClaimTaskResponseSchema.parse(res.json()).task.transitions).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  test('complete：追加 →done 留名 completedBy；reject：追加 done→inProgress 留名 reviewedBy；accept 不追加', async () => {
    const app = buildTestHubServer();
    try {
      const done = CompleteTaskResponseSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: '/api/tasks/t-r1-newboard/complete',
            payload: { completedBy: OWNER },
          })
        ).json(),
      ).task;
      expect(done.transitions?.at(-1)).toEqual({
        from: 'inProgress',
        to: 'done',
        at: done.updatedAt,
        by: OWNER,
      });

      const rejected = ReviewTaskResponseSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: '/api/tasks/t-r1-newboard/review',
            payload: { outcome: 'reject', reviewedBy: REVIEWER, note: '虚焊，重焊' },
          })
        ).json(),
      ).task;
      expect(rejected.transitions?.length).toBe((done.transitions?.length ?? 0) + 1);
      expect(rejected.transitions?.at(-1)).toEqual({
        from: 'done',
        to: 'inProgress',
        at: rejected.updatedAt,
        by: REVIEWER,
      });

      // 重新完成 → accept：不改状态，不追加
      await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-newboard/complete',
        payload: { completedBy: OWNER },
      });
      const accepted = ReviewTaskResponseSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: '/api/tasks/t-r1-newboard/review',
            payload: { outcome: 'accept', reviewedBy: REVIEWER },
          })
        ).json(),
      ).task;
      expect(accepted.transitions?.at(-1)?.to).toBe('done'); // 末条仍是 complete 那条
    } finally {
      await app.close();
    }
  });

  test('POST /status：匿名 body 供 by → 留名；不供 → 追加无 by 条（不硬绑留名）', async () => {
    const app = buildTestHubServer();
    try {
      const named = TransitionTaskStatusResponseSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: '/api/tasks/t-r1-chassis/status',
            payload: { status: 'inProgress', by: OWNER },
          })
        ).json(),
      ).task;
      expect(named.transitions?.at(-1)).toEqual({
        from: 'blocked',
        to: 'inProgress',
        at: named.updatedAt,
        by: OWNER,
      });

      const anon = TransitionTaskStatusResponseSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: '/api/tasks/t-r1-chassis/status',
            payload: { status: 'blocked' },
          })
        ).json(),
      ).task;
      expect(anon.transitions?.at(-1)).toEqual({
        from: 'inProgress',
        to: 'blocked',
        at: anon.updatedAt,
      });
    } finally {
      await app.close();
    }
  });

  test('生命周期累积：claim → complete → transitions 依序两条', async () => {
    const app = buildTestHubServer();
    try {
      const id = await createPendingTask(app);
      await app.inject({ method: 'POST', url: `/api/tasks/${id}/claim`, payload: { memberId: 'm-mechD' } });
      const done = CompleteTaskResponseSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: `/api/tasks/${id}/complete`,
            payload: { completedBy: CLAIMER },
          })
        ).json(),
      ).task;
      expect(done.transitions?.map((tr) => tr.to)).toEqual(['inProgress', 'done']);
    } finally {
      await app.close();
    }
  });

  test('fixture 种了 t-r1-arm-mount 两条 transitions（demo 直接可见），经 GET /api/tasks 透出', async () => {
    const app = buildTestHubServer();
    try {
      const body = TasksResponseSchema.parse(
        (await app.inject({ method: 'GET', url: '/api/tasks' })).json(),
      );
      const seeded = body.tasks.find((t) => t.id === 't-r1-arm-mount');
      expect(seeded?.transitions?.length).toBe(2);
      expect(seeded?.transitions?.at(-1)?.to).toBe('done');
    } finally {
      await app.close();
    }
  });
});

describe('TASK-TIMELINE store 三实现：File/Sqlite 落盘重启不丢', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = '';
  });

  test('FileGovStore：updateTaskStatus(by) 落盘 → 重启 transitions 仍在', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-timeline-'));
    const file = join(dir, 'gov.json');
    const store = await FileGovStore.create(file);

    const updated = await store.updateTaskStatus('t-r1-dataset', 'blocked', OWNER);
    expect(updated?.transitions?.at(-1)?.by?.id).toBe('m-progB');

    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expect(
      onDisk.tasks.find((x: { id: string }) => x.id === 't-r1-dataset').transitions.at(-1).to,
    ).toBe('blocked');

    const reloaded = await FileGovStore.create(file);
    const snap = await reloaded.getSnapshot();
    expect(snap.tasks.find((t) => t.id === 't-r1-dataset')?.transitions?.at(-1)?.by?.id).toBe(
      'm-progB',
    );
  });

  test('SqliteGovStore：claim(claimer) + updateTaskStatus(by) 落库读回', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-timeline-sqlite-'));
    const store = await SqliteGovStore.create(join(dir, 'gov.sqlite'));

    const posted = await store.createTask({
      projectId: 'prj-robots',
      groupId: 'grp-mech',
      title: '挂单：整理线束',
      rawSummary: '无主的活',
      ownerId: null,
      collaboratorIds: [],
      intrinsicComplexity: 'trivial',
    });
    const claimed = await store.claimTask(posted.id, 'm-mechD', '2026-06-11T00:00:00.000Z', CLAIMER);
    expect(claimed?.transitions?.at(-1)?.by?.id).toBe('m-mechD');

    await store.updateTaskStatus(posted.id, 'done', OWNER);
    const snap = await store.getSnapshot();
    const task = snap.tasks.find((t) => t.id === posted.id);
    expect(task?.transitions?.map((tr) => tr.to)).toEqual(['inProgress', 'done']);
    expect(task?.transitions?.at(-1)?.by?.id).toBe('m-progB');
  });
});
