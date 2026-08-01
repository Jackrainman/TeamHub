import { describe, expect, test } from 'vitest';
import { buildHubServer } from '../src/server.js';
import {
  TasksResponseSchema,
  GroupsResponseSchema,
  KbSimilarResponseSchema,
  InventoryResponseSchema,
  CreatePartActionResponseSchema,
} from '@teamhub/hub-contracts';
import { ALL_MODULE_IDS } from '@teamhub/hub-contracts';
import type { TenantConfig } from '@teamhub/hub-contracts';

/**
 * 非默认 TenantConfig 装配路径（PHASE2-CONSOLE-ASSEMBLY，D-081 已知延后项⑤）：现有 432+ 测全走
 * 默认（机器人全 6 模块）装配，从未验证过「关掉一个模块」的真实行为。本文件起一个去掉
 * presence-schedule 的租户，断言：① 该模块整段路由未注册（404，非"挂了但拒绝"）；
 * ② 其余模块（pm-core/knowledge-base/ledger）路由正常；③ ledger 的 inventory 校验路径内部调
 * `store.listResources()`（server.ts registerLedgerRoutes）不因 presence-schedule 未注册而炸——
 * store 本身（InMemoryGovStore）不感知 tenantConfig，seed 与模块开关是两条独立的轴。
 */
const GAME_STUDIO_LIKE_TENANT: TenantConfig = {
  enabledModules: ALL_MODULE_IDS.filter((id) => id !== 'presence-schedule'),
};

describe('非默认 TenantConfig：关掉 presence-schedule', () => {
  test('presence-schedule 路由整段不挂：/api/resources /api/resource-sessions /api/relay 全 404', async () => {
    const app = buildHubServer({ tenantConfig: GAME_STUDIO_LIKE_TENANT });
    try {
      const getResources = await app.inject({ method: 'GET', url: '/api/resources' });
      expect(getResources.statusCode).toBe(404);

      const postResources = await app.inject({
        method: 'POST',
        url: '/api/resources',
        payload: { projectId: 'prj-robots', name: 'x', kind: 'robot' },
      });
      expect(postResources.statusCode).toBe(404);

      const getSessions = await app.inject({ method: 'GET', url: '/api/resource-sessions' });
      expect(getSessions.statusCode).toBe(404);

      const postBatch = await app.inject({
        method: 'POST',
        url: '/api/resource-sessions/batch',
        payload: { windowLabel: '今晚', sessions: [], confirmedBy: null },
      });
      expect(postBatch.statusCode).toBe(404);

      const getRelay = await app.inject({ method: 'GET', url: '/api/relay?windowLabel=今晚' });
      expect(getRelay.statusCode).toBe(404);

      const getSchedule = await app.inject({ method: 'GET', url: '/api/schedule?windowLabel=今晚' });
      expect(getSchedule.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  test('pm-core / knowledge-base 路由正常（未受影响的模块照常挂载）', async () => {
    const app = buildHubServer({ tenantConfig: GAME_STUDIO_LIKE_TENANT });
    try {
      const tasks = await app.inject({ method: 'GET', url: '/api/tasks' });
      expect(tasks.statusCode).toBe(200);
      expect(TasksResponseSchema.parse(tasks.json()).tasks.length).toBeGreaterThan(0);

      const groups = await app.inject({ method: 'GET', url: '/api/groups' });
      expect(groups.statusCode).toBe(200);
      expect(GroupsResponseSchema.parse(groups.json()).groups.length).toBeGreaterThan(0);

      const kbSimilar = await app.inject({
        method: 'GET',
        url: '/api/kb/similar?symptom=' + encodeURIComponent('3508 电机又过热了'),
      });
      expect(kbSimilar.statusCode).toBe(200);
      // 只断言路由挂载 + 响应形状合法；命中条数取决于 seed 内容与相似度阈值，不属于本测试关心的事。
      expect(Array.isArray(KbSimilarResponseSchema.parse(kbSimilar.json()).items)).toBe(true);
    } finally {
      await app.close();
    }
  });

  test('ledger 端点正常；库存整车校验路径（内部调 store.listResources()）不因 presence-schedule 未注册而炸', async () => {
    const app = buildHubServer({ tenantConfig: GAME_STUDIO_LIKE_TENANT });
    try {
      // GET /api/inventory 内部把 invStore 快照 + store.listResources() 拼成矩阵（server.ts registerLedgerRoutes）——
      // presence-schedule 路由不挂不代表 store 里没有 resources（store 本身仍是全量 seed，两条轴独立）。
      const inv = await app.inject({ method: 'GET', url: '/api/inventory' });
      expect(inv.statusCode).toBe(200);
      const invBody = InventoryResponseSchema.parse(inv.json());
      expect(invBody.ledger.length).toBeGreaterThan(0);

      // POST /api/inventory/actions 的 resourceId 合法性校验同样读 store.listResources()；
      // 挂到一个真实存在的车（res-r1，fixture 恒在）应正常 201，而非因 presence-schedule 未注册而 500/炸。
      const action = await app.inject({
        method: 'POST',
        url: '/api/inventory/actions',
        payload: {
          projectId: 'prj-robots',
          partTypeId: 'parttype-gm6020',
          trackedPartId: 'part-gm-7',
          kind: 'mount',
          quantityDelta: 1,
          fromHolder: 'idle',
          toHolder: 'res-r1',
          note: null,
        },
      });
      expect(action.statusCode).toBe(201);
      expect(CreatePartActionResponseSchema.parse(action.json()).action.kind).toBe('mount');
    } finally {
      await app.close();
    }
  });
});
