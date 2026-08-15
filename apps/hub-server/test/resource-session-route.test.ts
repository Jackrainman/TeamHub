import { describe, expect, test } from 'vitest';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import {
  CreateResourceSessionResponseSchema,
  RelayBoardResponseSchema,
  RelayHandoffResponseSchema,
  SCENARIO_WINDOW_WEEKDAY,
} from '@teamhub/hub-contracts';
import { InMemoryGovStore } from './support/inmemory-gov-store.js';

// A2 接力画布「加/删一棒」后端：POST /api/resource-sessions（建一棒，R1 已存在，这里验「加」入口端到端）
// + DELETE /api/resource-sessions/:id（删一棒 + **级联删引用它的接力交接线**，避免删卡后箭头悬空）。
// 与 session/handoff 同走内存、不落盘（D-029）。验证状态码契约 + 级联干净 + 反监视红线（返回体无成员维度）。

/** 在指定 windowLabel 录入一棒，返回新 session.id（镜像 relay-route.test 的 postSession）。 */
async function postSession(
  app: ReturnType<typeof buildTestHubServer>,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/resource-sessions',
    payload: {
      projectId: 'prj-robots',
      resourceId: 'res-r1',
      windowLabel: SCENARIO_WINDOW_WEEKDAY,
      orderInWindow: 1,
      holderGroupId: 'grp-mech',
      holderTaskId: null,
      invitedMemberIds: [],
      note: null,
      confirmedBy: { id: 'm-progA', displayName: '程序A', source: 'console' },
      ...overrides,
    },
  });
  expect(res.statusCode).toBe(201);
  return CreateResourceSessionResponseSchema.parse(res.json()).session.id;
}

/** 在两棒之间拉一条接力交接线，返回 handoff.id。 */
async function postHandoff(
  app: ReturnType<typeof buildTestHubServer>,
  from: string,
  to: string,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/relay-handoffs',
    payload: {
      projectId: 'prj-robots',
      windowLabel: SCENARIO_WINDOW_WEEKDAY,
      fromSessionId: from,
      toSessionId: to,
      confirmedBy: null,
    },
  });
  expect(res.statusCode).toBe(201);
  return RelayHandoffResponseSchema.parse(res.json()).handoff.id;
}

describe('A2 加一棒（POST /api/resource-sessions）→ GET /api/relay 出现新卡', () => {
  test('POST 建一棒 → 201；server 钉 source=human；GET /api/relay 含该站', async () => {
    const store = new InMemoryGovStore();
    const app = buildTestHubServer({ store });
    try {
      const id = await postSession(app, { orderInWindow: 2 });
      expect(id).toMatch(/^sess-new-/);

      const get = await app.inject({
        method: 'GET',
        url: '/api/relay?windowLabel=' + encodeURIComponent(SCENARIO_WINDOW_WEEKDAY),
      });
      expect(get.statusCode).toBe(200);
      const board = RelayBoardResponseSchema.parse(get.json());
      expect(board.stages.some((s) => s.sessionId === id)).toBe(true);
    } finally {
      await app.close();
    }
  });
});

describe('A2 删一棒（DELETE /api/resource-sessions/:id）', () => {
  test('DELETE 命中 → 200 { deleted }；GET /api/relay 不再含；再删同 id → 404', async () => {
    const store = new InMemoryGovStore();
    const app = buildTestHubServer({ store });
    try {
      const id = await postSession(app);

      const del = await app.inject({
        method: 'DELETE',
        url: '/api/resource-sessions/' + id,
      });
      expect(del.statusCode).toBe(200);
      expect(del.json()).toEqual({ deleted: id });

      const get = await app.inject({
        method: 'GET',
        url: '/api/relay?windowLabel=' + encodeURIComponent(SCENARIO_WINDOW_WEEKDAY),
      });
      const board = RelayBoardResponseSchema.parse(get.json());
      expect(board.stages.some((s) => s.sessionId === id)).toBe(false);

      const del2 = await app.inject({
        method: 'DELETE',
        url: '/api/resource-sessions/' + id,
      });
      expect(del2.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  test('级联：删一棒后引用它的接力交接线也消失（listRelayHandoffs / GET /api/relay 均不含）', async () => {
    const store = new InMemoryGovStore();
    const app = buildTestHubServer({ store });
    try {
      // 两棒（a=seed 今晚 R1，b=新建第二棒）+ 一条 a→b 接力交接线
      const a = 'sess-tonight-ec'; // seed
      const b = await postSession(app);
      const handoffId = await postHandoff(app, a, b);

      // 删 toSession（b）→ 该接力线应级联消失
      const del = await app.inject({
        method: 'DELETE',
        url: '/api/resource-sessions/' + b,
      });
      expect(del.statusCode).toBe(200);

      // store 层：listRelayHandoffs 不再含这条
      const handoffs = await store.listRelayHandoffs();
      expect(handoffs.some((h) => h.id === handoffId)).toBe(false);
      expect(
        handoffs.some((h) => h.fromSessionId === b || h.toSessionId === b),
      ).toBe(false);

      // 路由层：GET /api/relay 既不含 b 站、也不含该交接线（箭头不悬空）
      const get = await app.inject({
        method: 'GET',
        url: '/api/relay?windowLabel=' + encodeURIComponent(SCENARIO_WINDOW_WEEKDAY),
      });
      const board = RelayBoardResponseSchema.parse(get.json());
      expect(board.stages.some((s) => s.sessionId === b)).toBe(false);
      expect(board.handoffs.some((h) => h.id === handoffId)).toBe(false);
      // 另一头（a=seed）仍在，仅交接线被级联清掉
      expect(board.stages.some((s) => s.sessionId === a)).toBe(true);
    } finally {
      await app.close();
    }
  });

  test('级联只清引用被删棒的线：删 fromSession 时其它无关交接线保留', async () => {
    const store = new InMemoryGovStore();
    const app = buildTestHubServer({ store });
    try {
      // a=seed, b, c 三棒；线 a→b（引用 a/b）与 b→c（引用 b/c）。删 a 只应清掉 a→b，保留 b→c。
      const a = 'sess-tonight-ec';
      const b = await postSession(app);
      const c = await postSession(app);
      const ab = await postHandoff(app, a, b);
      const bc = await postHandoff(app, b, c);

      const del = await app.inject({
        method: 'DELETE',
        url: '/api/resource-sessions/' + a,
      });
      expect(del.statusCode).toBe(200);

      const handoffs = await store.listRelayHandoffs();
      expect(handoffs.some((h) => h.id === ab)).toBe(false); // 引用 a → 级联删
      expect(handoffs.some((h) => h.id === bc)).toBe(true); // 不引用 a → 保留
    } finally {
      await app.close();
    }
  });

  test('DELETE 未知 id → 404', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/resource-sessions/sess-nope',
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  test('反监视红线：删一棒返回体无成员/确认人维度', async () => {
    const store = new InMemoryGovStore();
    const app = buildTestHubServer({ store });
    try {
      const id = await postSession(app);
      const del = await app.inject({
        method: 'DELETE',
        url: '/api/resource-sessions/' + id,
      });
      expect(del.statusCode).toBe(200);
      const raw = del.payload;
      expect(raw).not.toMatch(/memberId/);
      expect(raw).not.toMatch(/invitedMemberIds/);
      expect(raw).not.toMatch(/confirmedBy/);
    } finally {
      await app.close();
    }
  });
});
