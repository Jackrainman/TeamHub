import { describe, expect, test } from 'vitest';
import { buildHubServer } from '../src/server.js';
import {
  RelayBoardResponseSchema,
  RelayHandoffResponseSchema,
  UpdateResourceSessionResponseSchema,
  CreateResourceSessionResponseSchema,
  SCENARIO_WINDOW_WEEKDAY,
} from '../src/contracts.js';
import { InMemoryGovStore } from '../src/store/mock-gov-store.js';

// R1 接力交接画布（队长可编辑）后端：PATCH 占用窗口（拖卡片排先后 orderInWindow / 选填 eta）+
// GET /api/relay 富集读视图（接力站 + 站间交接线，**无成员维度**）+ POST/DELETE 接力交接线
// （拉线即先后交接，**非**任务依赖；自环 / 成环 400）。验证反监视红线 + 状态码契约。
//
// seed（scheduleScenarioFixture）：今晚 R1 一条已确认窗口 sess-tonight-ec（windowLabel=SCENARIO_WINDOW_WEEKDAY，
// confirmedBy 非空），relayHandoffs=[]。多数用例先 POST 第二条今晚窗口，再在两站间拉线。

/** 在指定 windowLabel 录入一条占用窗口，返回新 session.id。 */
async function postSession(
  app: ReturnType<typeof buildHubServer>,
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
      invitedMemberIds: ['m-mechC'],
      note: null,
      confirmedBy: { id: 'm-progA', displayName: '程序A', source: 'console' },
      ...overrides,
    },
  });
  expect(res.statusCode).toBe(201);
  return CreateResourceSessionResponseSchema.parse(res.json()).session.id;
}

describe('PATCH /api/resource-sessions/:id（接力画布编辑：排先后 + 预估时间）', () => {
  test('改 orderInWindow + eta → 200，两字段都生效；响应剥 confirmedBy（I0）', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/resource-sessions/sess-tonight-ec',
        payload: { orderInWindow: 5, eta: '约 22:30' },
      });
      expect(res.statusCode).toBe(200);
      const body = UpdateResourceSessionResponseSchema.parse(res.json());
      expect(body.session.orderInWindow).toBe(5);
      expect(body.session.eta).toBe('约 22:30');
      expect(body.session).not.toHaveProperty('confirmedBy');
    } finally {
      await app.close();
    }
  });

  test('只改 eta（不传 order）→ order 保留旧值；eta 显式 null 可清空', async () => {
    const store = new InMemoryGovStore();
    const app = buildHubServer({ store });
    try {
      // 先设 eta
      const set = await app.inject({
        method: 'PATCH',
        url: '/api/resource-sessions/sess-tonight-ec',
        payload: { eta: '搞到收工' },
      });
      expect(UpdateResourceSessionResponseSchema.parse(set.json()).session.eta).toBe(
        '搞到收工',
      );
      // 只传 eta:null → 清空，order（seed=0）不变
      const clear = await app.inject({
        method: 'PATCH',
        url: '/api/resource-sessions/sess-tonight-ec',
        payload: { eta: null },
      });
      const body = UpdateResourceSessionResponseSchema.parse(clear.json());
      expect(body.session.eta).toBeNull();
      expect(body.session.orderInWindow).toBe(0); // seed orderInWindow 未被触碰
    } finally {
      await app.close();
    }
  });

  test('两字段都不给 → 400（至少给一个）', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/resource-sessions/sess-tonight-ec',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('eta 空串 → 400（schema min(1)）', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/resource-sessions/sess-tonight-ec',
        payload: { eta: '' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('未知 id → 404', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/resource-sessions/sess-nope',
        payload: { orderInWindow: 2 },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('GET /api/relay（接力画布读视图，反监视红线无成员维度）', () => {
  test('windowLabel=今晚 → stages 富集（车号/组名/任务标签/order/eta/boardable）', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/relay?windowLabel=' + encodeURIComponent(SCENARIO_WINDOW_WEEKDAY),
      });
      expect(res.statusCode).toBe(200);
      const board = RelayBoardResponseSchema.parse(res.json());
      // seed sess-tonight-ec（confirmedBy 非空）→ 上画布为一站
      const stage = board.stages.find((s) => s.sessionId === 'sess-tonight-ec');
      expect(stage).toBeDefined();
      expect(stage!.resourceId).toBe('res-r1');
      expect(stage!.displayCode).toBe('26R1'); // 车号回退链
      expect(stage!.groupId).toBe('grp-ec');
      expect(typeof stage!.boardable).toBe('boolean');
      expect(board.handoffs).toEqual([]); // seed 无交接线
    } finally {
      await app.close();
    }
  });

  test('I0：返回体（含 stages + handoffs）不含任何人维度字段（memberId/invitedMemberIds/displayName/confirmedBy）', async () => {
    const store = new InMemoryGovStore();
    const app = buildHubServer({ store });
    try {
      // 录入第二窗 + 在两站间拉线，让返回体既有 stages 又有 handoffs（更全面覆盖红线）
      const to = await postSession(app);
      const post = await app.inject({
        method: 'POST',
        url: '/api/relay-handoffs',
        payload: {
          projectId: 'prj-robots',
          windowLabel: SCENARIO_WINDOW_WEEKDAY,
          fromSessionId: 'sess-tonight-ec',
          toSessionId: to,
          confirmedBy: { id: 'm-progA', displayName: '程序A', source: 'console' },
        },
      });
      expect(post.statusCode).toBe(201);

      const res = await app.inject({
        method: 'GET',
        url: '/api/relay?windowLabel=' + encodeURIComponent(SCENARIO_WINDOW_WEEKDAY),
      });
      expect(res.statusCode).toBe(200);
      const raw = res.payload;
      expect(raw).not.toMatch(/memberId/);
      expect(raw).not.toMatch(/invitedMemberIds/);
      expect(raw).not.toMatch(/displayName/);
      expect(raw).not.toMatch(/confirmedBy/);
      expect(raw).not.toMatch(/m-prog|m-vision|m-ec|m-mech|m-circuit/);
      // 结构层：每站无 memberId 属性
      const board = RelayBoardResponseSchema.parse(res.json());
      expect(board.stages.length).toBeGreaterThan(0);
      expect(board.handoffs.length).toBeGreaterThan(0);
      for (const stage of board.stages) {
        expect(stage).not.toHaveProperty('memberId');
        expect(stage).not.toHaveProperty('invitedMemberIds');
      }
      for (const h of board.handoffs) {
        expect(h).not.toHaveProperty('confirmedBy');
      }
    } finally {
      await app.close();
    }
  });

  test('windowLabel 缺失 → 400', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/relay' });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});

describe('POST/DELETE /api/relay-handoffs（接力交接线，自环/成环 400）', () => {
  test('两站间拉线 → 201；server 钉 source=console；响应剥 confirmedBy；GET /api/relay 含该线', async () => {
    const store = new InMemoryGovStore();
    const app = buildHubServer({ store });
    try {
      const from = 'sess-tonight-ec'; // seed
      const to = await postSession(app); // 第二条今晚窗口
      const post = await app.inject({
        method: 'POST',
        url: '/api/relay-handoffs',
        payload: {
          projectId: 'prj-robots',
          windowLabel: SCENARIO_WINDOW_WEEKDAY,
          fromSessionId: from,
          toSessionId: to,
          confirmedBy: { id: 'm-progA', displayName: '程序A', source: 'console' },
        },
      });
      expect(post.statusCode).toBe(201);
      const body = RelayHandoffResponseSchema.parse(post.json());
      expect(body.handoff.id).toMatch(/^handoff-new-/);
      expect(body.handoff.source).toBe('console'); // C5：server 钉
      expect(body.handoff.fromSessionId).toBe(from);
      expect(body.handoff.toSessionId).toBe(to);
      expect(body.handoff).not.toHaveProperty('confirmedBy'); // I0

      // GET /api/relay 应回这条交接线
      const get = await app.inject({
        method: 'GET',
        url: '/api/relay?windowLabel=' + encodeURIComponent(SCENARIO_WINDOW_WEEKDAY),
      });
      const board = RelayBoardResponseSchema.parse(get.json());
      expect(board.handoffs.some((h) => h.id === body.handoff.id)).toBe(true);
    } finally {
      await app.close();
    }
  });

  test('自环（from===to）→ 400', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/relay-handoffs',
        payload: {
          projectId: 'prj-robots',
          windowLabel: SCENARIO_WINDOW_WEEKDAY,
          fromSessionId: 'sess-tonight-ec',
          toSessionId: 'sess-tonight-ec',
          confirmedBy: null,
        },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('from/to session 不存在 → 400', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/relay-handoffs',
        payload: {
          projectId: 'prj-robots',
          windowLabel: SCENARIO_WINDOW_WEEKDAY,
          fromSessionId: 'sess-tonight-ec',
          toSessionId: 'sess-ghost',
          confirmedBy: null,
        },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('成环（A→B 已存在，再建 B→A）→ 400', async () => {
    const store = new InMemoryGovStore();
    const app = buildHubServer({ store });
    try {
      const a = 'sess-tonight-ec';
      const b = await postSession(app);
      // A→B
      const ab = await app.inject({
        method: 'POST',
        url: '/api/relay-handoffs',
        payload: {
          projectId: 'prj-robots',
          windowLabel: SCENARIO_WINDOW_WEEKDAY,
          fromSessionId: a,
          toSessionId: b,
          confirmedBy: null,
        },
      });
      expect(ab.statusCode).toBe(201);
      // B→A → 成环 400
      const ba = await app.inject({
        method: 'POST',
        url: '/api/relay-handoffs',
        payload: {
          projectId: 'prj-robots',
          windowLabel: SCENARIO_WINDOW_WEEKDAY,
          fromSessionId: b,
          toSessionId: a,
          confirmedBy: null,
        },
      });
      expect(ba.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('DELETE 命中 → 200；删后 GET /api/relay 不再含；再删同 id → 404', async () => {
    const store = new InMemoryGovStore();
    const app = buildHubServer({ store });
    try {
      const a = 'sess-tonight-ec';
      const b = await postSession(app);
      const post = await app.inject({
        method: 'POST',
        url: '/api/relay-handoffs',
        payload: {
          projectId: 'prj-robots',
          windowLabel: SCENARIO_WINDOW_WEEKDAY,
          fromSessionId: a,
          toSessionId: b,
          confirmedBy: null,
        },
      });
      const id = RelayHandoffResponseSchema.parse(post.json()).handoff.id;

      const del = await app.inject({
        method: 'DELETE',
        url: '/api/relay-handoffs/' + id,
      });
      expect(del.statusCode).toBe(200);

      const get = await app.inject({
        method: 'GET',
        url: '/api/relay?windowLabel=' + encodeURIComponent(SCENARIO_WINDOW_WEEKDAY),
      });
      const board = RelayBoardResponseSchema.parse(get.json());
      expect(board.handoffs.some((h) => h.id === id)).toBe(false);

      const del2 = await app.inject({
        method: 'DELETE',
        url: '/api/relay-handoffs/' + id,
      });
      expect(del2.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  test('DELETE 未知 id → 404', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/relay-handoffs/handoff-nope',
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
