import { describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { governanceScenarioFixture } from '@teamhub/hub-contracts';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import { InMemoryPmRepository } from './support/inmemory-gov-store.js';
import { usernameOf } from './support/login-helpers.js';
import { hashPin } from '../src/identity/pin.js';

// IDENTITY-LITE（D-083 §4.2）会话 + 服务端 actor 注入端到端。红线：pinHash 永不出响应；防枚举失败不区分；
// 匿名模式（默认）现状零变化。AUTH-LOGIN-USERNAME：登录键 = 自输用户名（displayName），memberId 只活在会话里。

/** 登录并回带 session cookie 头（供后续写请求携带）。member 无 pinHash 时 pin 可省。 */
async function login(
  app: FastifyInstance,
  memberId: string,
  pin?: string,
): Promise<string> {
  const username = usernameOf(memberId);
  const res = await app.inject({
    method: 'POST',
    url: '/api/session',
    payload: pin === undefined ? { username } : { username, pin },
  });
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === 'teamhub_session');
  expect(cookie?.value).toBeTruthy();
  const cookieHeader = `teamhub_session=${cookie!.value}`;
  // AUTH-GATE：无 pinHash 成员登录后是 mustSetPin 会话（业务请求 403）——测试补设 PIN 过闸。
  const pinRes = await app.inject({
    method: 'PUT',
    url: `/api/members/${memberId}/pin`,
    headers: { cookie: cookieHeader },
    payload: { pin: '1234abcd' },
  });
  expect(pinRes.statusCode).toBe(200);
  return cookieHeader;
}

describe('匿名模式（默认）：现状零变化', () => {
  test('GET /api/session → {mode:anonymous, session:null}', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/session' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ mode: 'anonymous', session: null });
    } finally {
      await app.close();
    }
  });

  test('POST/DELETE /api/session → 404（session 端点禁用）', async () => {
    const app = buildTestHubServer();
    try {
      const post = await app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { username: '电控B' },
      });
      expect(post.statusCode).toBe(404);
      const del = await app.inject({ method: 'DELETE', url: '/api/session' });
      expect(del.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  test('写路由无会话照常放行（现状），confirmedBy 沿用请求体自报', async () => {
    const store = new InMemoryPmRepository();
    const app = buildTestHubServer({ store });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/dependencies',
        payload: {
          projectId: 'prj-robots',
          fromTaskId: 't-r1-newboard',
          toTaskId: 't-r1-chassis',
          type: 'blocks',
          source: 'human',
          confirmedBy: { id: 'm-ecB', displayName: '电控B', source: 'console' },
        },
      });
      expect(res.statusCode).toBe(201);
      const dep = (await store.getSnapshot()).dependencies.at(-1)!;
      expect(dep.confirmedBy?.id).toBe('m-ecB'); // 匿名模式=请求体自报
    } finally {
      await app.close();
    }
  });

  test('PUT /api/members/:id/pin → 404（匿名模式禁用设 PIN）', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/members/m-ecB/pin',
        payload: { pin: '1234abcd' },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('身份模式：登录 / 登出 / 免 PIN / 错 PIN', () => {
  test('无 pinHash 成员免 PIN 登录 → 200 + cookie；GET /api/session 回身份', async () => {
    const app = buildTestHubServer({ identityMode: 'identity' });
    try {
      const cookie = await login(app, 'm-ecB'); // 无 pinHash → 免 PIN
      const me = await app.inject({
        method: 'GET',
        url: '/api/session',
        headers: { cookie },
      });
      expect(me.statusCode).toBe(200);
      const body = me.json();
      expect(body.mode).toBe('identity');
      expect(body.session.memberId).toBe('m-ecB');
      expect(body.session).not.toHaveProperty('pinHash');
    } finally {
      await app.close();
    }
  });

  test('登出后 GET /api/session → session:null', async () => {
    const app = buildTestHubServer({ identityMode: 'identity' });
    try {
      const cookie = await login(app, 'm-ecB');
      const out = await app.inject({
        method: 'DELETE',
        url: '/api/session',
        headers: { cookie },
      });
      expect(out.statusCode).toBe(200);
      // 用同一（已销毁）token 再查：null
      const me = await app.inject({
        method: 'GET',
        url: '/api/session',
        headers: { cookie },
      });
      expect(me.json().session).toBeNull();
    } finally {
      await app.close();
    }
  });

  test('设 PIN → 登出 → 错 PIN 401 / 对 PIN 200；防枚举失败统一', async () => {
    const app = buildTestHubServer({ identityMode: 'identity' });
    try {
      const cookie = await login(app, 'm-visionA'); // 免 PIN 先登进来
      const set = await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/pin',
        headers: { cookie },
        payload: { pin: '2468abcd' },
      });
      expect(set.statusCode).toBe(200);
      // 登出
      await app.inject({ method: 'DELETE', url: '/api/session', headers: { cookie } });

      // 错 PIN → 401
      const wrong = await app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { username: '视觉A', pin: '0000' },
      });
      expect(wrong.statusCode).toBe(401);
      // 该给 PIN 却没给 → 401（同样失败）
      const noPin = await app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { username: '视觉A' },
      });
      expect(noPin.statusCode).toBe(401);
      // 不存在的人 → 401，且 detail 与 PIN 错完全一致（防枚举）
      const unknown = await app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { username: '查无此人', pin: '2468abcd' },
      });
      expect(unknown.statusCode).toBe(401);
      expect(unknown.json().detail).toBe(wrong.json().detail);

      // 对 PIN → 200
      const right = await app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { username: '视觉A', pin: '2468abcd' },
      });
      expect(right.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  test('设他人 PIN：非本人会话 → 403（非 loopback 客户端）；loopback 操作员兜底放行（灾难恢复口）', async () => {
    const app = buildTestHubServer({ identityMode: 'identity' });
    try {
      // m-visionA 免 PIN 登入后给自己设 PIN（此后 m-visionA 有 pinHash）
      const cookieA = await login(app, 'm-visionA');
      const setA = await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/pin',
        headers: { cookie: cookieA },
        payload: { pin: '1111abcd' },
      });
      expect(setA.statusCode).toBe(200);
      // m-ecB 免 PIN 登入，从非 loopback 地址试图改 m-visionA 的 PIN → 403（只许本人）
      const cookieB = await login(app, 'm-ecB');
      const forbid = await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/pin',
        remoteAddress: '10.0.0.5',
        headers: { cookie: cookieB },
        payload: { pin: '9999abcd' },
      });
      expect(forbid.statusCode).toBe(403);
      // 同一请求从 loopback 发出 → 200（PIN-DEADLOCK-RECOVERY 先例：本机操作员即运维）
      const loopback = await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/pin',
        headers: { cookie: cookieB },
        payload: { pin: '9999abcd' },
      });
      expect(loopback.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});

describe('身份模式：写门 401 + 服务端 actor 注入', () => {
  test('无会话写 → 401；携会话写 → 201', async () => {
    const app = buildTestHubServer({ identityMode: 'identity' });
    try {
      const noAuth = await app.inject({
        method: 'POST',
        url: '/api/dependencies',
        payload: {
          projectId: 'prj-robots',
          fromTaskId: 't-r1-newboard',
          toTaskId: 't-r1-chassis',
          type: 'blocks',
          source: 'human',
          confirmedBy: { id: 'm-ecB', displayName: '电控B', source: 'console' },
        },
      });
      expect(noAuth.statusCode).toBe(401);

      const cookie = await login(app, 'm-ecB');
      const ok = await app.inject({
        method: 'POST',
        url: '/api/dependencies',
        headers: { cookie },
        payload: {
          projectId: 'prj-robots',
          fromTaskId: 't-r1-newboard',
          toTaskId: 't-r1-chassis',
          type: 'blocks',
          source: 'human',
          confirmedBy: { id: 'm-ecB', displayName: '电控B', source: 'console' },
        },
      });
      expect(ok.statusCode).toBe(201);
    } finally {
      await app.close();
    }
  });

  test('自报身份被服务端覆盖：落库 confirmedBy = session 身份，非请求体值', async () => {
    const store = new InMemoryPmRepository();
    const app = buildTestHubServer({ identityMode: 'identity', store });
    try {
      const cookie = await login(app, 'm-ecB'); // session = m-ecB
      const before = (await store.getSnapshot()).dependencies.length;
      const res = await app.inject({
        method: 'POST',
        url: '/api/dependencies',
        headers: { cookie },
        payload: {
          projectId: 'prj-robots',
          fromTaskId: 't-r1-newboard',
          toTaskId: 't-r1-chassis',
          type: 'blocks',
          source: 'human',
          // 客户端谎报别人的身份
          confirmedBy: { id: 'm-imposter', displayName: '冒名者', source: 'console' },
        },
      });
      expect(res.statusCode).toBe(201);
      const deps = (await store.getSnapshot()).dependencies;
      expect(deps.length).toBe(before + 1);
      const created = deps.at(-1)!;
      // 落库值 = session 身份（m-ecB），不是请求体谎报的 m-imposter
      expect(created.confirmedBy?.id).toBe('m-ecB');
      expect(created.confirmedBy?.id).not.toBe('m-imposter');
      // 读视图仍剥 confirmedBy（I0 先例不变）
      expect(res.json().dependency).not.toHaveProperty('confirmedBy');
    } finally {
      await app.close();
    }
  });
});

describe('密钥纪律：pinHash 永不出响应', () => {
  test('GET /api/members 与 PUT pin 响应均无 pinHash', async () => {
    const app = buildTestHubServer({ identityMode: 'identity' });
    try {
      const cookie = await login(app, 'm-visionA');
      const setRes = await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/pin',
        headers: { cookie },
        payload: { pin: '1357abcd' },
      });
      expect(setRes.statusCode).toBe(200);
      expect(setRes.json().member).not.toHaveProperty('pinHash');

      const members = await app.inject({
        method: 'GET',
        url: '/api/members',
        headers: { cookie },
      });
      expect(members.statusCode).toBe(200);
      const body = members.json();
      expect(body.members.length).toBeGreaterThan(0);
      for (const m of body.members) {
        expect(m).not.toHaveProperty('pinHash');
      }
      // 兜底：整个响应文本里不出现散列前缀
      expect(members.body).not.toContain('scrypt:');
    } finally {
      await app.close();
    }
  });
});

describe('AUTH-LOGIN-USERNAME：用户名登录 / 重名 409 / 旧短 PIN 强制升级', () => {
  test('自输用户名（displayName）登录 → 200；姓名精确匹配（带空格不命中 → 401）', async () => {
    const app = buildTestHubServer({ identityMode: 'identity' });
    try {
      const ok = await app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { username: '电控B' },
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().session.memberId).toBe('m-ecB');
      // 精确匹配：不 trim——' 电控B' 视同不存在的人，统一 401
      const padded = await app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { username: ' 电控B' },
      });
      expect(padded.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  test('名册重名（历史脏数据）→ 409 运营信号，不进 401 防枚举分支', async () => {
    const dup = {
      ...governanceScenarioFixture.members[0],
      id: 'm-dupB',
      displayName: '电控B',
    };
    const store = new InMemoryPmRepository({
      ...governanceScenarioFixture,
      members: [...governanceScenarioFixture.members, dup],
    });
    const app = buildTestHubServer({ identityMode: 'identity', store });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { username: '电控B' },
      });
      expect(res.statusCode).toBe(409);
      // 不重名的成员照常登录（重名只拦当事名）
      const ok = await app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { username: '视觉A' },
      });
      expect(ok.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  test('旧 4 位 PIN 登录 → 200 但 mustSetPin + 业务请求 403；重设 ≥8 位后同会话解禁', async () => {
    const legacy = {
      ...governanceScenarioFixture.members.find((m) => m.id === 'm-visionA')!,
      pinHash: hashPin('1234'), // 旧版 4 位 PIN 散列
    };
    const store = new InMemoryPmRepository({
      ...governanceScenarioFixture,
      members: governanceScenarioFixture.members.map((m) =>
        m.id === 'm-visionA' ? legacy : m,
      ),
    });
    const app = buildTestHubServer({ identityMode: 'identity', store });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { username: '视觉A', pin: '1234' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().mustSetPin).toBe(true);
      const cookie = `teamhub_session=${res.cookies.find((c) => c.name === 'teamhub_session')!.value}`;

      // GET /api/session 也报 mustSetPin
      const me = await app.inject({ method: 'GET', url: '/api/session', headers: { cookie } });
      expect(me.json().mustSetPin).toBe(true);
      // 业务请求被首登/升级闸拦：403 PIN_SETUP_REQUIRED
      const blocked = await app.inject({ method: 'GET', url: '/api/members', headers: { cookie } });
      expect(blocked.statusCode).toBe(403);
      expect(blocked.json().code).toBe('PIN_SETUP_REQUIRED');

      // 重设 ≥8 位密码 → 200，同会话立即解禁
      const set = await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/pin',
        headers: { cookie },
        payload: { pin: 'newpass8' },
      });
      expect(set.statusCode).toBe(200);
      const open = await app.inject({ method: 'GET', url: '/api/members', headers: { cookie } });
      expect(open.statusCode).toBe(200);
      const me2 = await app.inject({ method: 'GET', url: '/api/session', headers: { cookie } });
      expect(me2.json().mustSetPin).toBeFalsy();

      // 新密码可登录且无升级标记；旧 4 位不再通过
      const relog = await app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { username: '视觉A', pin: 'newpass8' },
      });
      expect(relog.statusCode).toBe(200);
      expect(relog.json().mustSetPin).toBeFalsy();
      const oldPin = await app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { username: '视觉A', pin: '1234' },
      });
      expect(oldPin.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});
