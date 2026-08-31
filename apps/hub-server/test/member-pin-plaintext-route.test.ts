import { describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import { InMemoryPmRepository } from './support/inmemory-gov-store.js';

/**
 * PIN 明文副本 + 显示端点（打磨轮刀⑧② pinPlaintext，2026-07-25 用户拍板的密钥纪律例外）端到端：
 *  - 双写：PUT pin / bootstrap 后 snapshot 同含 pinHash + pinPlaintext；
 *  - 双清：DELETE pin 后两字段皆无；
 *  - 密钥纪律：任何 members 读响应 JSON 串不含 pinPlaintext/pinHash/scrypt:（名册 / session / bootstrap）；
 *  - GET /api/members/:id/pin 鉴权三态（本人 200 / 持旗管理员 200 / 他人 403）+ 匿名 404 + 未设置 404。
 * I0：单条读取出口，绝无列表批量出口。
 */

/** 登录并回带 session cookie 头。免 PIN 成员省 pin。 */
async function login(app: FastifyInstance, memberId: string, pin?: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/session',
    payload: pin === undefined ? { memberId } : { memberId, pin },
  });
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === 'teamhub_session');
  return `teamhub_session=${cookie!.value}`;
}

/** fixtures 的 demo 持旗成员（m-progA）收旗——让「初始化首个管理员」流程有干净的零旗标起点。 */
async function clearFixturePm(store: InMemoryPmRepository): Promise<void> {
  await store.setProjectManager('m-progA', false);
}

describe('pinPlaintext 双写双清', () => {
  test('PUT pin 后 snapshot 同含 pinHash + pinPlaintext；DELETE 后两字段皆无', async () => {
    const store = new InMemoryPmRepository();
    const app = buildTestHubServer({ identityMode: 'identity', store });
    try {
      const cookie = await login(app, 'm-visionA');
      const set = await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/pin',
        headers: { cookie },
        payload: { pin: '2468' },
      });
      expect(set.statusCode).toBe(200);
      // 双写：snapshot 里 hash 与明文副本同笔落
      const after1 = (await store.getSnapshot()).members.find((m) => m.id === 'm-visionA');
      expect(after1?.pinHash).toMatch(/^scrypt:/);
      expect(after1?.pinPlaintext).toBe('2468');

      // DELETE（loopback 操作员豁免 superAdmin，inject 默认 127.0.0.1）→ 双清
      const cleared = await app.inject({ method: 'DELETE', url: '/api/members/m-visionA/pin' });
      expect(cleared.statusCode).toBe(200);
      const after2 = (await store.getSnapshot()).members.find((m) => m.id === 'm-visionA');
      expect(after2?.pinHash).toBeUndefined();
      expect(after2?.pinPlaintext).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  test('bootstrap（POST /api/setup/super-admin）带 pin 也双写；响应体不含 pinPlaintext/pinHash/scrypt:', async () => {
    const store = new InMemoryPmRepository();
    await clearFixturePm(store);
    const app = buildTestHubServer({ identityMode: 'identity', store });
    try {
      const cookie = await login(app, 'm-ecB'); // 免 PIN 登入
      const res = await app.inject({
        method: 'POST',
        url: '/api/setup/super-admin',
        headers: { cookie },
        payload: { pin: '1357' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toContain('pinPlaintext');
      expect(res.body).not.toContain('pinHash');
      expect(res.body).not.toContain('scrypt:');

      const me = (await store.getSnapshot()).members.find((m) => m.id === 'm-ecB');
      expect(me?.pinHash).toMatch(/^scrypt:/);
      expect(me?.pinPlaintext).toBe('1357');
    } finally {
      await app.close();
    }
  });
});

describe('密钥纪律：pinPlaintext/pinHash 绝不出读响应', () => {
  test('GET /api/members 与 GET /api/session 的 JSON 串均不含 pinPlaintext/pinHash/scrypt:', async () => {
    const store = new InMemoryPmRepository();
    const app = buildTestHubServer({ identityMode: 'identity', store });
    try {
      const cookie = await login(app, 'm-visionA');
      await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/pin',
        headers: { cookie },
        payload: { pin: '2468' },
      });

      const members = await app.inject({ method: 'GET', url: '/api/members' });
      expect(members.statusCode).toBe(200);
      expect(members.body).not.toContain('pinPlaintext');
      expect(members.body).not.toContain('pinHash');
      expect(members.body).not.toContain('scrypt:');
      expect(members.body).not.toContain('2468');

      const session = await app.inject({
        method: 'GET',
        url: '/api/session',
        headers: { cookie },
      });
      expect(session.statusCode).toBe(200);
      expect(session.body).not.toContain('pinPlaintext');
      expect(session.body).not.toContain('pinHash');
      expect(session.body).not.toContain('scrypt:');
    } finally {
      await app.close();
    }
  });
});

describe('GET /api/members/:id/pin（显示PIN 唯一透出口）', () => {
  test('匿名模式 → 404（身份模式未启用）', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/members/m-ecB/pin' });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  test('鉴权三态：本人 200 回明文 / 持旗管理员 200 / 他人 403；成员不存在 404', async () => {
    const store = new InMemoryPmRepository();
    const app = buildTestHubServer({ identityMode: 'identity', store });
    try {
      // m-visionA 自设 PIN（双写后 pinPlaintext 在库）
      const cookieA = await login(app, 'm-visionA');
      await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/pin',
        headers: { cookie: cookieA },
        payload: { pin: '2468' },
      });

      // 本人 → 200 { pin }
      const self = await app.inject({
        method: 'GET',
        url: '/api/members/m-visionA/pin',
        headers: { cookie: cookieA },
      });
      expect(self.statusCode).toBe(200);
      expect(self.json()).toEqual({ pin: '2468' });

      // 持旗管理员（fixtures m-progA 持旗）看他人 → 200
      const cookieAdmin = await login(app, 'm-progA');
      const admin = await app.inject({
        method: 'GET',
        url: '/api/members/m-visionA/pin',
        headers: { cookie: cookieAdmin },
      });
      expect(admin.statusCode).toBe(200);
      expect(admin.json()).toEqual({ pin: '2468' });

      // 普通成员看他人 → 403
      const cookieB = await login(app, 'm-ecB');
      const forbid = await app.inject({
        method: 'GET',
        url: '/api/members/m-visionA/pin',
        headers: { cookie: cookieB },
      });
      expect(forbid.statusCode).toBe(403);

      // 未登录（无会话）→ 403（读端点不过写门，路由内自判）
      const anon = await app.inject({ method: 'GET', url: '/api/members/m-visionA/pin' });
      expect(anon.statusCode).toBe(403);

      // 成员不存在 → 404
      const missing = await app.inject({
        method: 'GET',
        url: '/api/members/m-nobody/pin',
        headers: { cookie: cookieAdmin },
      });
      expect(missing.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  test('无 pinPlaintext（从未设 / 旧数据）→ 404「未设置 PIN」', async () => {
    const store = new InMemoryPmRepository();
    const app = buildTestHubServer({ identityMode: 'identity', store });
    try {
      // m-ecB 从未设 PIN → 本人读 → 404 未设置
      const cookie = await login(app, 'm-ecB');
      const res = await app.inject({
        method: 'GET',
        url: '/api/members/m-ecB/pin',
        headers: { cookie },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().detail).toBe('未设置 PIN');
    } finally {
      await app.close();
    }
  });

  test('DELETE 清除后再读 → 404「未设置 PIN」（双清生效）', async () => {
    const store = new InMemoryPmRepository();
    const app = buildTestHubServer({ identityMode: 'identity', store });
    try {
      const cookie = await login(app, 'm-visionA');
      await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/pin',
        headers: { cookie },
        payload: { pin: '2468' },
      });
      await app.inject({ method: 'DELETE', url: '/api/members/m-visionA/pin' });
      const res = await app.inject({
        method: 'GET',
        url: '/api/members/m-visionA/pin',
        headers: { cookie },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().detail).toBe('未设置 PIN');
    } finally {
      await app.close();
    }
  });
});
