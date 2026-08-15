import { describe, expect, test } from 'vitest';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import {
  PresenceScheduleResponseSchema,
  ResourceSessionsResponseSchema,
  SharedResourcesResponseSchema,
  CreateResourceSessionResponseSchema,
  SCENARIO_WINDOW_WEEKDAY,
} from '@teamhub/hub-contracts';
import { InMemoryGovStore } from './support/inmemory-gov-store.js';

// SCHED-WIRE-EXISTING（D-029 差异化在场排班）：把已存在但零运行时引用的纯函数 derivePresenceSchedule
// 接出成真实 API。验证：seed 锚点（scheduleScenarioFixture）→ GET /api/schedule?windowLabel=今晚 出非空建议、
// 三态俱在（电控 present / 电路 onCall / 视觉 free）；I0 输出无人维度；POST 录入一窗后排班含该窗派生。

describe('GET /api/schedule（差异化在场排班，I0 无人维度）', () => {
  test('windowLabel=今晚 → 非空 recommendations + present/onCall/free 三态俱在', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/schedule?windowLabel=' + encodeURIComponent(SCENARIO_WINDOW_WEEKDAY),
      });
      expect(res.statusCode).toBe(200);
      const body = PresenceScheduleResponseSchema.parse(res.json());
      expect(body.windowLabel).toBe(SCENARIO_WINDOW_WEEKDAY);
      expect(body.recommendations.length).toBeGreaterThan(0);
      const modes = new Set(body.recommendations.map((r) => r.mode));
      // 今晚 R1 归电控做系统调试（平日差异化）：电控 present、电路 onCall、视觉 free（被底盘卡）。
      expect(modes.has('present')).toBe(true);
      expect(modes.has('onCall')).toBe(true);
      expect(modes.has('free')).toBe(true);
    } finally {
      await app.close();
    }
  });

  test('I0：响应 JSON 不含任何人维度字段（memberId/displayName/confirmedBy/invitedMemberIds/成员 id）', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/schedule?windowLabel=' + encodeURIComponent(SCENARIO_WINDOW_WEEKDAY),
      });
      expect(res.statusCode).toBe(200);
      const raw = res.payload;
      // 派生输出主键是 group/resource/task——绝不出现人维度字段或种子成员 id。
      expect(raw).not.toMatch(/memberId/);
      expect(raw).not.toMatch(/invitedMemberIds/);
      expect(raw).not.toMatch(/displayName/);
      expect(raw).not.toMatch(/confirmedBy/);
      expect(raw).not.toMatch(/m-prog|m-vision|m-ec|m-mech|m-circuit/);
      // 结构层断言：每条建议无 memberId 属性
      const body = PresenceScheduleResponseSchema.parse(res.json());
      for (const rec of body.recommendations) {
        expect(rec).not.toHaveProperty('memberId');
        expect(rec).not.toHaveProperty('invitedMemberIds');
      }
    } finally {
      await app.close();
    }
  });

  test('windowLabel 缺失 → 400', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/schedule' });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('windowLabel 空串 → 400', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/schedule?windowLabel=' });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('未知窗口 → 200 + 空 recommendations（无该窗会话 = 沉默，非错误）', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/schedule?windowLabel=' + encodeURIComponent('下个月'),
      });
      expect(res.statusCode).toBe(200);
      const body = PresenceScheduleResponseSchema.parse(res.json());
      expect(body.recommendations.length).toBe(0);
    } finally {
      await app.close();
    }
  });
});

describe('在场排班读视图 + 录入', () => {
  test('GET /api/resource-sessions → seed 占用窗口（sess-tonight-ec）', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/resource-sessions' });
      expect(res.statusCode).toBe(200);
      const body = ResourceSessionsResponseSchema.parse(res.json());
      expect(body.sessions.length).toBeGreaterThanOrEqual(1);
      expect(body.sessions.some((s) => s.id === 'sess-tonight-ec')).toBe(true);
    } finally {
      await app.close();
    }
  });

  test('GET /api/resources → seed 共享资源（res-r1 / res-r2）', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/resources' });
      expect(res.statusCode).toBe(200);
      const body = SharedResourcesResponseSchema.parse(res.json());
      expect(body.resources.some((r) => r.id === 'res-r1')).toBe(true);
    } finally {
      await app.close();
    }
  });

  test('POST /api/resource-sessions → 201；server 钉 source=human + 补 id/createdAt；响应剥 confirmedBy（I0）', async () => {
    const store = new InMemoryGovStore();
    const before = (await store.listResourceSessions()).length;
    const app = buildTestHubServer({ store });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/resource-sessions',
        payload: {
          projectId: 'prj-robots',
          resourceId: 'res-r1',
          windowLabel: '明天上午',
          orderInWindow: 1,
          holderGroupId: 'grp-mech',
          holderTaskId: 't-r1-arm-mount',
          invitedMemberIds: ['m-mechC'],
          note: '明天上午机械上车',
          confirmedBy: { id: 'm-progA', displayName: '程序A', source: 'console' },
          source: 'derived', // 试图夹带来源 → 应被 omit、server 钉 human
        },
      });
      expect(res.statusCode).toBe(201);
      const body = CreateResourceSessionResponseSchema.parse(res.json());
      expect(body.session.id).toMatch(/^sess-new-/);
      // C5：source 由 server 钉 human（夹带的 derived 被 omit）
      expect(body.session.source).toBe('human');
      expect(body.session.windowLabel).toBe('明天上午');
      // I0：读响应永不回 confirmedBy（ActorRef）
      expect(body.session).not.toHaveProperty('confirmedBy');
      // 落库生效（内存累积）
      expect((await store.listResourceSessions()).length).toBe(before + 1);
    } finally {
      await app.close();
    }
  });

  test('POST 一条今晚的接力窗口后 GET /api/schedule?windowLabel=今晚 仍含派生建议（接出闭环）', async () => {
    const store = new InMemoryGovStore();
    const app = buildTestHubServer({ store });
    try {
      // 录入一条今晚 R1 接力窗口（机械接力，orderInWindow=1）
      const post = await app.inject({
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
        },
      });
      expect(post.statusCode).toBe(201);

      const res = await app.inject({
        method: 'GET',
        url: '/api/schedule?windowLabel=' + encodeURIComponent(SCENARIO_WINDOW_WEEKDAY),
      });
      expect(res.statusCode).toBe(200);
      const body = PresenceScheduleResponseSchema.parse(res.json());
      expect(body.recommendations.length).toBeGreaterThan(0);
      // 新录入的机械接力窗口 → 机械组 present（持有 R1）
      expect(
        body.recommendations.some(
          (r) => r.groupId === 'grp-mech' && r.mode === 'present',
        ),
      ).toBe(true);
      // I0 守恒：仍无人维度
      expect(res.payload).not.toMatch(/memberId|invitedMemberIds|displayName|confirmedBy/);
    } finally {
      await app.close();
    }
  });

  test('POST /api/resource-sessions 缺必填 → 400', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/resource-sessions',
        payload: { resourceId: 'res-r1' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('POST /api/resource-sessions 无 Bearer（配了 writeToken）→ 401（继承 H3 onRequest 鉴权）', async () => {
    const app = buildTestHubServer({ writeToken: 'secret-xyz' });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/resource-sessions',
        payload: {},
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  test('POST /api/resource-sessions 带正确 Bearer + 合法 body → 201', async () => {
    const app = buildTestHubServer({ writeToken: 'secret-xyz' });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/resource-sessions',
        headers: { authorization: 'Bearer secret-xyz' },
        payload: {
          projectId: 'prj-robots',
          resourceId: 'res-r2',
          windowLabel: '周末',
          orderInWindow: 0,
          holderGroupId: 'grp-program',
          holderTaskId: 't-r2-integration',
          invitedMemberIds: [],
          note: null,
          confirmedBy: null,
        },
      });
      expect(res.statusCode).toBe(201);
    } finally {
      await app.close();
    }
  });
});
