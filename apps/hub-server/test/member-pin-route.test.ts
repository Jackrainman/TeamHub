import { describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import { InMemoryPmRepository } from './support/inmemory-gov-store.js';

/**
 * 登录密码路由端到端（AUTH-GATE 2026-09-04：PIN 升级为密码，撤销刀⑧② pinPlaintext 明文副本例外）：
 *  - PUT pin：本人会话（或 loopback 操作员）设/改；落库只有 scrypt 散列，**无明文副本**；
 *    少于 8 位 → 400（密码级强度）。
 *  - 「显示 PIN」端点已删除：GET /api/members/:id/pin → 404（身份/匿名同）。
 *  - DELETE pin（重置）：持旗管理员 / loopback → 清 pinHash，成员回未设密码态（首登强制重设）。
 *  - 密钥纪律：任何读响应 JSON 串不含 pinHash/scrypt:/pinPlaintext。
 */

async function login(app: FastifyInstance, memberId: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/session', payload: { memberId } });
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === 'teamhub_session');
  return `teamhub_session=${cookie!.value}`;
}

/** fixtures 的 demo 持旗成员（m-progA）收旗——让「初始化首个管理员」流程有干净的零旗标起点。 */
async function clearFixturePm(store: InMemoryPmRepository): Promise<void> {
  await store.setProjectManager('m-progA', false);
}

describe('PUT /api/members/:id/pin（设/改密码）', () => {
  test('本人会话设密码 → 200；落库仅 scrypt 散列、无 pinPlaintext；少于 8 位 → 400', async () => {
    const store = new InMemoryPmRepository();
    const app = buildTestHubServer({ identityMode: 'identity', store });
    try {
      const cookie = await login(app, 'm-visionA');

      const tooShort = await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/pin',
        headers: { cookie },
        payload: { pin: '1234' },
      });
      expect(tooShort.statusCode).toBe(400);

      const set = await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/pin',
        headers: { cookie },
        payload: { pin: '2468abcd' },
      });
      expect(set.statusCode).toBe(200);
      const me = (await store.getSnapshot()).members.find((m) => m.id === 'm-visionA');
      expect(me?.pinHash).toMatch(/^scrypt:/);
      expect('pinPlaintext' in (me as object)).toBe(false);
      // 响应剥 pinHash
      expect(set.body).not.toContain('pinHash');
      expect(set.body).not.toContain('scrypt:');
    } finally {
      await app.close();
    }
  });

  test('bootstrap（POST /api/setup/super-admin）带 pin ≥8 位；落库无 pinPlaintext；响应体无凭证痕迹', async () => {
    const store = new InMemoryPmRepository();
    await clearFixturePm(store);
    const app = buildTestHubServer({ identityMode: 'identity', store });
    try {
      const cookie = await login(app, 'm-ecB'); // 无密码成员登入（mustSetPin 会话，bootstrap 口放行）
      const res = await app.inject({
        method: 'POST',
        url: '/api/setup/super-admin',
        headers: { cookie },
        payload: { pin: '1357abcd' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toContain('pinPlaintext');
      expect(res.body).not.toContain('pinHash');
      expect(res.body).not.toContain('scrypt:');

      const me = (await store.getSnapshot()).members.find((m) => m.id === 'm-ecB');
      expect(me?.pinHash).toMatch(/^scrypt:/);
      expect('pinPlaintext' in (me as object)).toBe(false);
    } finally {
      await app.close();
    }
  });
});

describe('「显示 PIN」端点已删除（明文副本机制撤销）', () => {
  test('GET /api/members/:id/pin → 404（不设路由）；本人/管理员同', async () => {
    const app = buildTestHubServer({ identityMode: 'identity' });
    try {
      const cookie = await login(app, 'm-visionA');
      await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/pin',
        headers: { cookie },
        payload: { pin: '2468abcd' },
      });
      const self = await app.inject({
        method: 'GET',
        url: '/api/members/m-visionA/pin',
        headers: { cookie },
      });
      expect(self.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('密钥纪律：凭证绝不出读响应', () => {
  test('GET /api/members 与 GET /api/session 的 JSON 串均不含 pinPlaintext/pinHash/scrypt:', async () => {
    const store = new InMemoryPmRepository();
    const app = buildTestHubServer({ identityMode: 'identity', store });
    try {
      const cookie = await login(app, 'm-visionA');
      await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/pin',
        headers: { cookie },
        payload: { pin: '2468abcd' },
      });

      const members = await app.inject({ method: 'GET', url: '/api/members' });
      expect(members.statusCode).toBe(200);
      expect(members.body).not.toContain('pinPlaintext');
      expect(members.body).not.toContain('pinHash');
      expect(members.body).not.toContain('scrypt:');
      expect(members.body).not.toContain('2468abcd');

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

describe('DELETE /api/members/:id/pin（重置密码）', () => {
  test('持旗管理员重置 → 清 pinHash 回未设密码态；该成员下次登录 mustSetPin 并重设', async () => {
    const store = new InMemoryPmRepository();
    const app = buildTestHubServer({ identityMode: 'identity', store });
    try {
      const cookie = await login(app, 'm-visionA');
      await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/pin',
        headers: { cookie },
        payload: { pin: '2468abcd' },
      });
      // 持旗管理员（fixtures m-progA 持旗）先自设密码过首登闸，再重置他人
      const adminCookie = await login(app, 'm-progA');
      await app.inject({
        method: 'PUT',
        url: '/api/members/m-progA/pin',
        headers: { cookie: adminCookie },
        payload: { pin: '9999abcd' },
      });
      const cleared = await app.inject({
        method: 'DELETE',
        url: '/api/members/m-visionA/pin',
        headers: { cookie: adminCookie },
      });
      expect(cleared.statusCode).toBe(200);
      const me = (await store.getSnapshot()).members.find((m) => m.id === 'm-visionA');
      expect(me?.pinHash).toBeUndefined();

      // 重置后：成员回未设密码态——任何登录（含旧密码，给了也忽略）都落 mustSetPin 会话，
      // 业务请求被首登闸 403，重设密码后才解禁。旧密码本身不再证明任何身份。
      const oldLogin = await app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { memberId: 'm-visionA', pin: '2468abcd' },
      });
      expect(oldLogin.statusCode).toBe(200);
      expect(oldLogin.json().mustSetPin).toBe(true);
      const relogin = await app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { memberId: 'm-visionA' },
      });
      expect(relogin.statusCode).toBe(200);
      expect(relogin.json().mustSetPin).toBe(true);
    } finally {
      await app.close();
    }
  });
});
