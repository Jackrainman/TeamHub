import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import {
  CreateResourceResponseSchema,
  CreateResourcesBatchResponseSchema,
  UpdateResourceResponseSchema,
} from '@teamhub/hub-contracts';
import { InMemoryGovStore } from './support/inmemory-gov-store.js';

// R3 车管理（D-072 §3.2/§3.3）：建车（displayCode 派生、禁手写）/ 改状态（维修/退役 = 状态迁移、非物删）
// + 持久化（建/退役的车落盘 resources.json，重启仍在）。镜像 POST /api/resource-sessions 的 safeParse→400/201。

describe('R3 车管理路由：建车 / 改状态（无物删）', () => {
  test('POST /api/resources → 201；displayCode 由 deriveDisplayCode 派生 = 26R2（禁手写）', async () => {
    const store = new InMemoryGovStore();
    const before = (await store.listResources()).length;
    const app = buildTestHubServer({ store });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/resources',
        payload: {
          projectId: 'prj-robots',
          name: '第二台 R2 比赛车',
          kind: 'robot',
          robotTarget: 'R2',
          season: '26',
          // version 省略 → 默认 1 → 不显 -vN
        },
      });
      expect(res.statusCode).toBe(201);
      const body = CreateResourceResponseSchema.parse(res.json());
      // displayCode 由 server 派生（请求里不给）= 26R2
      expect(body.resource.displayCode).toBe('26R2');
      expect(body.resource.id).toMatch(/^res-new-/);
      // server clamp：建车一律 available / statusReason=null / statusSource=console
      expect(body.resource.status).toBe('available');
      expect(body.resource.statusReason).toBeNull();
      expect(body.resource.statusSource).toBe('console');
      // 落库
      expect((await store.listResources()).length).toBe(before + 1);
      // I0：无成员维度
      expect(body.resource).not.toHaveProperty('memberId');
    } finally {
      await app.close();
    }
  });

  test('POST /api/resources：version=2 → displayCode 显 -v2（26R1-v2）', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/resources',
        payload: {
          projectId: 'prj-robots',
          name: 'R1 第二代整车',
          kind: 'robot',
          robotTarget: 'R1',
          season: '26',
          version: 2,
        },
      });
      expect(res.statusCode).toBe(201);
      const body = CreateResourceResponseSchema.parse(res.json());
      expect(body.resource.displayCode).toBe('26R1-v2');
    } finally {
      await app.close();
    }
  });

  test('POST /api/resources：不给 season → displayCode 为 undefined（读视图回退 name）', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/resources',
        payload: {
          projectId: 'prj-robots',
          name: '测试台',
          kind: 'testRig',
          robotTarget: 'shared',
        },
      });
      expect(res.statusCode).toBe(201);
      const body = CreateResourceResponseSchema.parse(res.json());
      expect(body.resource.displayCode).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  test('POST /api/resources：缺必填字段 → 400（safeParse 拒）', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/resources',
        payload: {
          projectId: 'prj-robots',
          // 缺 name / kind / robotTarget
        },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('PATCH /api/resources/:id/status → repair（带 statusReason）生效；statusSource clamp console', async () => {
    const store = new InMemoryGovStore();
    const app = buildTestHubServer({ store });
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/resources/res-r1/status',
        payload: { status: 'repair', statusReason: '撞坏底盘' },
      });
      expect(res.statusCode).toBe(200);
      const body = UpdateResourceResponseSchema.parse(res.json());
      expect(body.resource.id).toBe('res-r1');
      expect(body.resource.status).toBe('repair');
      expect(body.resource.statusReason).toBe('撞坏底盘');
      expect(body.resource.statusSource).toBe('console');
      // 落库
      const live = (await store.listResources()).find((r) => r.id === 'res-r1');
      expect(live?.status).toBe('repair');
    } finally {
      await app.close();
    }
  });

  test('PATCH /api/resources/:id/status → retired（退役 = 状态迁移，整车仍在列表，无物删）', async () => {
    const store = new InMemoryGovStore();
    const before = (await store.listResources()).length;
    const app = buildTestHubServer({ store });
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/resources/res-r2/status',
        payload: { status: 'retired' },
      });
      expect(res.statusCode).toBe(200);
      const body = UpdateResourceResponseSchema.parse(res.json());
      expect(body.resource.status).toBe('retired');
      // 退役不物理删除：整车仍在列表（数量不减），仍可被 ResourceSession 引用
      const after = await store.listResources();
      expect(after.length).toBe(before);
      expect(after.some((r) => r.id === 'res-r2')).toBe(true);
    } finally {
      await app.close();
    }
  });

  test('PATCH /api/resources/:id/status：statusReason 省略 → 不动既有 reason', async () => {
    const store = new InMemoryGovStore();
    const app = buildTestHubServer({ store });
    try {
      // 先设一个 reason
      await app.inject({
        method: 'PATCH',
        url: '/api/resources/res-r1/status',
        payload: { status: 'repair', statusReason: '撞坏底盘' },
      });
      // 再迁移状态但不给 statusReason → 保留旧 reason
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/resources/res-r1/status',
        payload: { status: 'disassembling' },
      });
      expect(res.statusCode).toBe(200);
      const body = UpdateResourceResponseSchema.parse(res.json());
      expect(body.resource.status).toBe('disassembling');
      expect(body.resource.statusReason).toBe('撞坏底盘'); // 未传 → 保留旧值
    } finally {
      await app.close();
    }
  });

  test('PATCH /api/resources/:id/status：显式 null → 清空 statusReason', async () => {
    const store = new InMemoryGovStore();
    const app = buildTestHubServer({ store });
    try {
      await app.inject({
        method: 'PATCH',
        url: '/api/resources/res-r1/status',
        payload: { status: 'repair', statusReason: '撞坏底盘' },
      });
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/resources/res-r1/status',
        payload: { status: 'available', statusReason: null },
      });
      expect(res.statusCode).toBe(200);
      const body = UpdateResourceResponseSchema.parse(res.json());
      expect(body.resource.statusReason).toBeNull();
    } finally {
      await app.close();
    }
  });

  test('PATCH /api/resources/:id/status：未知 id → 404', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/resources/res-nope/status',
        payload: { status: 'repair' },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  test('PATCH /api/resources/:id/status：非法 status → 400', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/resources/res-r1/status',
        payload: { status: 'totally-bogus' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  // 无 DELETE 物删路由：退役走 PATCH status→retired（整车留展示，ResourceSession 仍引用 resourceId）。
  test('DELETE /api/resources/:id → 404（无物删路由）', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/resources/res-r1',
      });
      expect(res.statusCode).toBe(404); // 路由不存在
    } finally {
      await app.close();
    }
  });
});

describe('POST /api/resources/batch（FLEET-BATCH-INIT 车队批量初始化）', () => {
  test('三台全过 → 201；displayCode 派生（27/R1/2 → 27R1-v2）、kind 默认 robot、建时 clamp available', async () => {
    const store = new InMemoryGovStore();
    const before = (await store.listResources()).length;
    const app = buildTestHubServer({ store });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/resources/batch',
        payload: {
          resources: [
            { name: 'R1 第二代', robotTarget: 'R1', season: '27', version: 2 },
            { name: 'R2 比赛车', robotTarget: 'R2', season: '27' },
            { name: '共用测试架', robotTarget: 'shared', kind: 'testRig' },
          ],
        },
      });
      expect(res.statusCode).toBe(201);
      const body = CreateResourcesBatchResponseSchema.parse(res.json());
      expect(body.resources).toHaveLength(3);
      // displayCode 服务端派生（禁手写不变）：('27','R1',2) → '27R1-v2'；version 缺省 1 → 不显 -vN
      expect(body.resources[0].displayCode).toBe('27R1-v2');
      expect(body.resources[1].displayCode).toBe('27R2');
      // 不给 season → displayCode undefined（读视图回退 name，与单建同律）
      expect(body.resources[2].displayCode).toBeUndefined();
      // kind 省略 → 默认 robot
      expect(body.resources[0].kind).toBe('robot');
      // 建时 clamp：available / statusReason=null / statusSource=console
      expect(body.resources[0].status).toBe('available');
      expect(body.resources[0].statusReason).toBeNull();
      expect(body.resources[0].statusSource).toBe('console');
      // 落库 + I0 无成员维度
      expect((await store.listResources()).length).toBe(before + 3);
      expect(body.resources[0]).not.toHaveProperty('memberId');
    } finally {
      await app.close();
    }
  });

  test('行带 status=repair（+statusReason）→ 建后补迁移落库；statusSource 钉 console（照单台迁移钉法）', async () => {
    const store = new InMemoryGovStore();
    const app = buildTestHubServer({ store });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/resources/batch',
        payload: {
          resources: [
            { name: '能用的车', robotTarget: 'R1', season: '27' },
            {
              name: '在修的车',
              robotTarget: 'R2',
              season: '27',
              status: 'repair',
              statusReason: '撞坏底盘',
            },
            { name: '退役的老车', robotTarget: 'shared', season: '25', status: 'retired' },
          ],
        },
      });
      expect(res.statusCode).toBe(201);
      const body = CreateResourcesBatchResponseSchema.parse(res.json());
      expect(body.resources[0].status).toBe('available');
      expect(body.resources[1].status).toBe('repair');
      expect(body.resources[1].statusReason).toBe('撞坏底盘');
      expect(body.resources[1].statusSource).toBe('console');
      expect(body.resources[2].status).toBe('retired');
      // 迁移落库（重启口径同 store 层，这里断言 live 读回）
      const live = await store.listResources();
      expect(live.find((r) => r.id === body.resources[1].id)?.status).toBe('repair');
      expect(live.find((r) => r.id === body.resources[2].id)?.status).toBe('retired');
    } finally {
      await app.close();
    }
  });

  test('原子性：任一行坏（第 2 台缺 robotTarget）→ 400 整批不落，resources 快照零变化；detail 带第几台', async () => {
    const store = new InMemoryGovStore();
    const app = buildTestHubServer({ store });
    try {
      const snapshotBefore = JSON.stringify(await store.listResources());
      const res = await app.inject({
        method: 'POST',
        url: '/api/resources/batch',
        payload: {
          resources: [
            { name: '好车', robotTarget: 'R1', season: '27' },
            { name: '没编号位的坏行' }, // 缺 robotTarget
            { name: '又一台好车', robotTarget: 'R2', season: '27' },
          ],
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().detail).toContain('第 2 台');
      // 一台不落——含第 1 台好车也不落（全量先验、通过才落盘）
      expect(JSON.stringify(await store.listResources())).toBe(snapshotBefore);
    } finally {
      await app.close();
    }
  });

  test('status 只收初始化四档：第 1 台 inUse → 400 整批不落', async () => {
    const store = new InMemoryGovStore();
    const before = (await store.listResources()).length;
    const app = buildTestHubServer({ store });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/resources/batch',
        payload: {
          resources: [{ name: '在用的车', robotTarget: 'R1', status: 'inUse' }],
        },
      });
      expect(res.statusCode).toBe(400);
      expect((await store.listResources()).length).toBe(before);
    } finally {
      await app.close();
    }
  });

  test('空数组 → 400（min 1，空批无意义）', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/resources/batch',
        payload: { resources: [] },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('鉴权继承写门：配 writeToken 无 Bearer → 401（与单建 POST /api/resources 同门，不新加敏感门）', async () => {
    const guarded = buildTestHubServer({ writeToken: 'secret' });
    try {
      const res = await guarded.inject({
        method: 'POST',
        url: '/api/resources/batch',
        payload: {
          resources: [{ name: 'R1 比赛车', robotTarget: 'R1', season: '27' }],
        },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await guarded.close();
    }
  });
});
