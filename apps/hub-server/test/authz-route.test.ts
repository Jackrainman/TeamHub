import { describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildHubServer } from '../src/server.js';
import { InMemoryGovStore } from '../src/store/mock-gov-store.js';

/**
 * 权限地基路由端到端（K1，minor bump）：
 *  - POST /api/setup/super-admin：匿名 404 / 未登录 401 / 无 superAdmin 时把登录本人升 superAdmin + 同笔设
 *    pinHash / 已有 superAdmin 时 409。
 *  - PUT /api/members/:id/role：匿名=写门即可 / 身份=须 superAdmin（403）/ 降级保护（最后一个 superAdmin 409）。
 *  - 敏感门收口：身份模式下 gate-reviewer / seasons 非 superAdmin → 403，superAdmin → 放行；匿名不变。
 * 红线：无任何按人聚合端点，快照身份陈旧不影响服务端鉴权（服务端另读实时名册）。
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

describe('POST /api/setup/super-admin（初始化首个管理员）', () => {
  test('匿名模式 → 404（身份模式未启用）', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/setup/super-admin',
        payload: { pin: '1234' },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  test('身份模式未登录 → 401（写门钩子）', async () => {
    const app = buildHubServer({ identityMode: 'identity' });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/setup/super-admin',
        payload: { pin: '1234' },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  test('无 superAdmin：升登录本人为 superAdmin + 同笔设 pinHash（此后免 PIN 登录失败）；响应剥 pinHash', async () => {
    const store = new InMemoryGovStore();
    const app = buildHubServer({ identityMode: 'identity', store });
    try {
      const cookie = await login(app, 'm-ecB'); // 免 PIN 登入（role=member）
      const res = await app.inject({
        method: 'POST',
        url: '/api/setup/super-admin',
        headers: { cookie },
        payload: { pin: '1234' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().member.role).toBe('superAdmin');
      expect(JSON.stringify(res.json())).not.toContain('pinHash');
      expect(JSON.stringify(res.json())).not.toContain('scrypt:');

      // 落库：role superAdmin + pinHash 已设 → 免 PIN 登录此后失败（401），带对 PIN 成功
      expect((await store.getSnapshot()).members.find((m) => m.id === 'm-ecB')?.role).toBe(
        'superAdmin',
      );
      const noPin = await app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { memberId: 'm-ecB' },
      });
      expect(noPin.statusCode).toBe(401);
      const withPin = await app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { memberId: 'm-ecB', pin: '1234' },
      });
      expect(withPin.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  test('已存在 superAdmin → 409（一次性初始化门）', async () => {
    const store = new InMemoryGovStore();
    const app = buildHubServer({ identityMode: 'identity', store });
    try {
      const cookie = await login(app, 'm-ecB');
      const first = await app.inject({
        method: 'POST',
        url: '/api/setup/super-admin',
        headers: { cookie },
        payload: { pin: '1234' },
      });
      expect(first.statusCode).toBe(200);
      // 换个人登入再试 → 已有管理员 → 409
      const cookie2 = await login(app, 'm-visionA');
      const second = await app.inject({
        method: 'POST',
        url: '/api/setup/super-admin',
        headers: { cookie: cookie2 },
        payload: { pin: '5678' },
      });
      expect(second.statusCode).toBe(409);
    } finally {
      await app.close();
    }
  });
});

describe('PUT /api/members/:id/role（成员角色维护）', () => {
  test('匿名模式：写门即可 → 200；未知 id → 404', async () => {
    const store = new InMemoryGovStore();
    const app = buildHubServer({ store });
    try {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/members/m-ecB/role',
        payload: { role: 'groupAdmin' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().member.role).toBe('groupAdmin');
      expect(JSON.stringify(res.json())).not.toContain('pinHash');

      const missing = await app.inject({
        method: 'PUT',
        url: '/api/members/m-nope/role',
        payload: { role: 'member' },
      });
      expect(missing.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  test('降级保护（两模式统一）：摘掉最后一个 superAdmin → 409', async () => {
    const app = buildHubServer(); // 匿名，便于直接改角色
    try {
      // 先造出唯一 superAdmin
      await app.inject({
        method: 'PUT',
        url: '/api/members/m-ecB/role',
        payload: { role: 'superAdmin' },
      });
      // 摘掉它（唯一 superAdmin 降级）→ 409
      const demote = await app.inject({
        method: 'PUT',
        url: '/api/members/m-ecB/role',
        payload: { role: 'member' },
      });
      expect(demote.statusCode).toBe(409);
      // 但若先有第二个 superAdmin，再降第一个 → 200（非最后一个）
      await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/role',
        payload: { role: 'superAdmin' },
      });
      const demoteOk = await app.inject({
        method: 'PUT',
        url: '/api/members/m-ecB/role',
        payload: { role: 'member' },
      });
      expect(demoteOk.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  test('身份模式：非 superAdmin → 403；superAdmin → 200', async () => {
    const store = new InMemoryGovStore();
    const app = buildHubServer({ identityMode: 'identity', store });
    try {
      // 未初始化管理员时，普通登录人改角色 → 403（fail-closed）
      const cookie = await login(app, 'm-ecB');
      const forbid = await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/role',
        headers: { cookie },
        payload: { role: 'groupAdmin' },
      });
      expect(forbid.statusCode).toBe(403);

      // 本人成为 superAdmin 后再改 → 200（服务端读实时名册，不吃陈旧会话快照）
      await app.inject({
        method: 'POST',
        url: '/api/setup/super-admin',
        headers: { cookie },
        payload: { pin: '1234' },
      });
      const ok = await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/role',
        headers: { cookie },
        payload: { role: 'groupAdmin' },
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().member.role).toBe('groupAdmin');
    } finally {
      await app.close();
    }
  });
});

describe('DELETE /api/members/:id/pin（重置 PIN，公测余项⑦）', () => {
  test('匿名模式 → 404（身份模式未启用）', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({ method: 'DELETE', url: '/api/members/m-ecB/pin' });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  test('身份模式未登录 → 401（写门钩子）；非 superAdmin → 403', async () => {
    const store = new InMemoryGovStore();
    const app = buildHubServer({ identityMode: 'identity', store });
    try {
      const anon = await app.inject({ method: 'DELETE', url: '/api/members/m-visionA/pin' });
      expect(anon.statusCode).toBe(401);

      const cookie = await login(app, 'm-ecB'); // 普通成员
      const forbid = await app.inject({
        method: 'DELETE',
        url: '/api/members/m-visionA/pin',
        headers: { cookie },
      });
      expect(forbid.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  test('superAdmin 重置他人 PIN → 200：pinHash 清除、回免 PIN 态、可经 firstSetup 重设；响应剥 pinHash', async () => {
    const store = new InMemoryGovStore();
    const app = buildHubServer({ identityMode: 'identity', store });
    try {
      // 造 superAdmin（m-ecB）+ 给 m-visionA 设 PIN（本人登录后自设）
      const adminCookie = await login(app, 'm-ecB');
      await app.inject({
        method: 'POST',
        url: '/api/setup/super-admin',
        headers: { cookie: adminCookie },
        payload: { pin: '1234' },
      });
      const userCookie = await login(app, 'm-visionA');
      await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/pin',
        headers: { cookie: userCookie },
        payload: { pin: '9999' },
      });
      // 确认已设：免 PIN 登录 m-visionA 失败
      const locked = await app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { memberId: 'm-visionA' },
      });
      expect(locked.statusCode).toBe(401);

      // superAdmin 重置 → 200
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/members/m-visionA/pin',
        headers: { cookie: adminCookie },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().member.id).toBe('m-visionA');
      expect(JSON.stringify(res.json())).not.toContain('pinHash');

      // 落库：pinHash 已清 → 免 PIN 登录恢复（回免 PIN 态）
      expect(
        (await store.getSnapshot()).members.find((m) => m.id === 'm-visionA')?.pinHash,
      ).toBeUndefined();
      const relogin = await app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { memberId: 'm-visionA' },
      });
      expect(relogin.statusCode).toBe(200);

      // firstSetup 流程可重设新 PIN（旧 PIN 已失效）
      const cookie2 = await login(app, 'm-visionA');
      const reset = await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/pin',
        headers: { cookie: cookie2 },
        payload: { pin: '5555' },
      });
      expect(reset.statusCode).toBe(200);
      const oldPin = await app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { memberId: 'm-visionA', pin: '9999' },
      });
      expect(oldPin.statusCode).toBe(401);
      const newPin = await app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { memberId: 'm-visionA', pin: '5555' },
      });
      expect(newPin.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  test('superAdmin 重置未知 id → 404', async () => {
    const store = new InMemoryGovStore();
    const app = buildHubServer({ identityMode: 'identity', store });
    try {
      const cookie = await login(app, 'm-ecB');
      await app.inject({
        method: 'POST',
        url: '/api/setup/super-admin',
        headers: { cookie },
        payload: { pin: '1234' },
      });
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/members/m-nope/pin',
        headers: { cookie },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('敏感门收口：身份模式须 superAdmin（匿名不变）', () => {
  test('gate-reviewer：身份非 superAdmin → 403，superAdmin → 200；匿名仍 200', async () => {
    // 匿名不变
    const anon = buildHubServer();
    try {
      const res = await anon.inject({
        method: 'PUT',
        url: '/api/members/m-ecB/gate-reviewer',
        payload: { gateReviewer: true },
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await anon.close();
    }

    const app = buildHubServer({ identityMode: 'identity', store: new InMemoryGovStore() });
    try {
      const cookie = await login(app, 'm-ecB');
      const forbid = await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/gate-reviewer',
        headers: { cookie },
        payload: { gateReviewer: true },
      });
      expect(forbid.statusCode).toBe(403);

      await app.inject({
        method: 'POST',
        url: '/api/setup/super-admin',
        headers: { cookie },
        payload: { pin: '1234' },
      });
      const ok = await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/gate-reviewer',
        headers: { cookie },
        payload: { gateReviewer: true },
      });
      expect(ok.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  test('POST /api/seasons：身份非 superAdmin → 403，superAdmin → 201', async () => {
    const app = buildHubServer({ identityMode: 'identity', store: new InMemoryGovStore() });
    try {
      const cookie = await login(app, 'm-ecB');
      const body = { name: 'Robocon 2028', startsAt: '2027-09-01T00:00:00.000Z', endsAt: null };
      const forbid = await app.inject({
        method: 'POST',
        url: '/api/seasons',
        headers: { cookie },
        payload: body,
      });
      expect(forbid.statusCode).toBe(403);

      await app.inject({
        method: 'POST',
        url: '/api/setup/super-admin',
        headers: { cookie },
        payload: { pin: '1234' },
      });
      const ok = await app.inject({
        method: 'POST',
        url: '/api/seasons',
        headers: { cookie },
        payload: body,
      });
      expect(ok.statusCode).toBe(201);
    } finally {
      await app.close();
    }
  });
});
