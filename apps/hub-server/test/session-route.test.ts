import { describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import { InMemoryPmRepository } from './support/inmemory-gov-store.js';

// IDENTITY-LITE（D-083 §4.2）会话 + 服务端 actor 注入端到端。红线：pinHash 永不出响应；防枚举失败不区分；
// 匿名模式（默认）现状零变化。

/** 登录并回带 session cookie 头（供后续写请求携带）。member 无 pinHash 时 pin 可省。 */
async function login(
  app: FastifyInstance,
  memberId: string,
  pin?: string,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/session',
    payload: pin === undefined ? { memberId } : { memberId, pin },
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
        payload: { memberId: 'm-ecB' },
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
        payload: { memberId: 'm-visionA', pin: '0000' },
      });
      expect(wrong.statusCode).toBe(401);
      // 该给 PIN 却没给 → 401（同样失败）
      const noPin = await app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { memberId: 'm-visionA' },
      });
      expect(noPin.statusCode).toBe(401);
      // 不存在的人 → 401，且 detail 与 PIN 错完全一致（防枚举）
      const unknown = await app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { memberId: 'm-nobody', pin: '2468abcd' },
      });
      expect(unknown.statusCode).toBe(401);
      expect(unknown.json().detail).toBe(wrong.json().detail);

      // 对 PIN → 200
      const right = await app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { memberId: 'm-visionA', pin: '2468abcd' },
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

      const members = await app.inject({ method: 'GET', url: '/api/members' });
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
