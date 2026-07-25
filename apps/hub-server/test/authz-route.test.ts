import { describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildHubServer } from '../src/server.js';
import { InMemoryGovStore } from '../src/store/mock-gov-store.js';

/**
 * 权限地基路由端到端（K1 + MEMBER-PM-FLAG 公测补强刀②b）：
 *  - POST /api/setup/super-admin：匿名 404 / 未登录 401 / 无持旗成员时给登录本人授 projectManager 旗标 +
 *    同笔设 pinHash / 已有持旗成员时 409。
 *  - PUT /api/members/:id/role：匿名=写门即可 / 身份=须持旗管理员（403）；role 两档不再承载管理员权限。
 *  - PUT /api/members/:id/project-manager：授/收旗 + 降级保护（最后一个持旗成员 409）。
 *  - 敏感门收口：身份模式下 gate-reviewer / seasons 非持旗成员 → 403，持旗 → 放行；匿名不变。
 * 红线：无任何按人聚合端点，快照身份陈旧不影响服务端鉴权（服务端另读实时名册）。
 * 注：fixtures 里 m-progA 已持旗（demo）——凡要走「初始化首个管理员」流程的用例先收它的旗。
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
async function clearFixturePm(store: InMemoryGovStore): Promise<void> {
  await store.setProjectManager('m-progA', false);
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

  test('身份模式未登录 + 老路径（无 displayName）→ 401（路由内自判；钩子已豁免本端点供 bootstrap）', async () => {
    const store = new InMemoryGovStore();
    await clearFixturePm(store);
    const app = buildHubServer({ identityMode: 'identity', store });
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

  test('无持旗成员：给登录本人授 projectManager 旗标 + 同笔设 pinHash（此后免 PIN 登录失败）；响应剥 pinHash', async () => {
    const store = new InMemoryGovStore();
    await clearFixturePm(store);
    const app = buildHubServer({ identityMode: 'identity', store });
    try {
      const cookie = await login(app, 'm-ecB'); // 免 PIN 登入（role=member、无旗标）
      const res = await app.inject({
        method: 'POST',
        url: '/api/setup/super-admin',
        headers: { cookie },
        payload: { pin: '1234' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().member.projectManager).toBe(true);
      expect(res.json().member.role).toBe('member'); // 旗标与 role 正交：组织身份不动
      expect(JSON.stringify(res.json())).not.toContain('pinHash');
      expect(JSON.stringify(res.json())).not.toContain('scrypt:');

      // 落库：旗标已授 + pinHash 已设 → 免 PIN 登录此后失败（401），带对 PIN 成功
      const me = (await store.getSnapshot()).members.find((m) => m.id === 'm-ecB');
      expect(me?.projectManager).toBe(true);
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

  test('已存在持旗成员 → 409（一次性初始化门）', async () => {
    const store = new InMemoryGovStore(); // fixtures 的 m-progA 已持旗
    const app = buildHubServer({ identityMode: 'identity', store });
    try {
      const cookie = await login(app, 'm-ecB');
      const res = await app.inject({
        method: 'POST',
        url: '/api/setup/super-admin',
        headers: { cookie },
        payload: { pin: '1234' },
      });
      expect(res.statusCode).toBe(409);
    } finally {
      await app.close();
    }
  });
});

describe('POST /api/setup/super-admin — bootstrap 路径（SETUP-WIZARD-ROSTER 刀②）', () => {
  test('无会话 + displayName/groupName → 一笔建人+授旗+设 PIN+签会话 cookie（此后带 cookie 可写）', async () => {
    const store = new InMemoryGovStore();
    await clearFixturePm(store);
    const app = buildHubServer({ identityMode: 'identity', store });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/setup/super-admin',
        payload: { displayName: '新队长', groupName: '机械', asGroupLead: true, pin: '1234' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.member.displayName).toBe('新队长');
      expect(body.member.projectManager).toBe(true);
      expect(body.member.role).toBe('groupAdmin'); // 组长申报
      expect(JSON.stringify(body)).not.toContain('pinHash');
      expect(JSON.stringify(body)).not.toContain('scrypt:');
      // 登录态：响应签发会话 cookie
      const cookie = res.cookies.find((c) => c.name === 'teamhub_session');
      expect(cookie?.value).toBeTruthy();

      // 落库核实：建人（挂机械组）+ 授旗 + pinHash 已设
      const snap = await store.getSnapshot();
      const me = snap.members.find((m) => m.displayName === '新队长')!;
      expect(me.projectManager).toBe(true);
      expect(me.pinHash).toBeTruthy();
      expect(snap.groups.find((g) => g.id === me.groupId)?.name).toBe('机械');
      // 免 PIN 登录失败、带 PIN 成功（PIN 同笔已设）
      const noPin = await app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { memberId: me.id },
      });
      expect(noPin.statusCode).toBe(401);
      // 签发的会话可直接写（持旗）：改角色 200
      const write = await app.inject({
        method: 'PUT',
        url: '/api/members/m-ecB/role',
        headers: { cookie: `teamhub_session=${cookie!.value}` },
        payload: { role: 'groupAdmin' },
      });
      expect(write.statusCode).toBe(200);
      // 第二个人再来 → 已有持旗成员 → 409（一次性初始化门）
      const second = await app.inject({
        method: 'POST',
        url: '/api/setup/super-admin',
        payload: { displayName: '另一个', groupName: '机械', pin: '5678' },
      });
      expect(second.statusCode).toBe(409);
    } finally {
      await app.close();
    }
  });

  test('姓名命中既有成员 → 认领该行（不新建、组不动），授旗+PIN+会话', async () => {
    const store = new InMemoryGovStore();
    await clearFixturePm(store);
    const app = buildHubServer({ identityMode: 'identity', store });
    try {
      const before = (await store.getSnapshot()).members.length;
      const res = await app.inject({
        method: 'POST',
        url: '/api/setup/super-admin',
        payload: { displayName: '电控B', pin: '1234' }, // fixtures 既有成员
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().member.id).toBe('m-ecB');
      expect(res.json().member.projectManager).toBe(true);
      const snap = await store.getSnapshot();
      expect(snap.members.length).toBe(before); // 未新建
      expect(snap.members.find((m) => m.id === 'm-ecB')?.groupId).toBe('grp-ec'); // 组不动
    } finally {
      await app.close();
    }
  });

  test('新建但缺 groupName → 400；显式 projectManager:false → 建人+PIN 但不授旗（门可再现）', async () => {
    const store = new InMemoryGovStore();
    await clearFixturePm(store);
    const app = buildHubServer({ identityMode: 'identity', store });
    try {
      const bad = await app.inject({
        method: 'POST',
        url: '/api/setup/super-admin',
        payload: { displayName: '没给组', pin: '1234' },
      });
      expect(bad.statusCode).toBe(400);

      const noFlag = await app.inject({
        method: 'POST',
        url: '/api/setup/super-admin',
        payload: { displayName: '普通队员', groupName: '视觉', projectManager: false, pin: '1234' },
      });
      expect(noFlag.statusCode).toBe(200);
      const me = (await store.getSnapshot()).members.find((m) => m.displayName === '普通队员')!;
      expect(me.projectManager).toBeFalsy(); // 不授旗
      expect(me.pinHash).toBeTruthy(); // PIN 照设
      // 名册仍无持旗成员 → 下一个人仍可走 bootstrap（门再现）
      const next = await app.inject({
        method: 'POST',
        url: '/api/setup/super-admin',
        payload: { displayName: '真队长', groupName: '机械', pin: '1234' },
      });
      expect(next.statusCode).toBe(200);
      expect(next.json().member.projectManager).toBe(true);
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

  test('降级保护（两模式统一）：摘掉最后一个持旗成员 → 409', async () => {
    const app = buildHubServer(); // 匿名，便于直接授/收旗
    try {
      // fixtures 里 m-progA 持旗；先给 m-ecB 授旗，再收 m-progA（非最后一个 → 200）
      const grant = await app.inject({
        method: 'PUT',
        url: '/api/members/m-ecB/project-manager',
        payload: { projectManager: true },
      });
      expect(grant.statusCode).toBe(200);
      expect(grant.json().member.projectManager).toBe(true);
      const revokeProgA = await app.inject({
        method: 'PUT',
        url: '/api/members/m-progA/project-manager',
        payload: { projectManager: false },
      });
      expect(revokeProgA.statusCode).toBe(200);
      // 摘掉最后一个持旗成员（m-ecB）→ 409
      const demote = await app.inject({
        method: 'PUT',
        url: '/api/members/m-ecB/project-manager',
        payload: { projectManager: false },
      });
      expect(demote.statusCode).toBe(409);
      // 但若先有第二个持旗成员，再收第一个 → 200（非最后一个）
      await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/project-manager',
        payload: { projectManager: true },
      });
      const demoteOk = await app.inject({
        method: 'PUT',
        url: '/api/members/m-ecB/project-manager',
        payload: { projectManager: false },
      });
      expect(demoteOk.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  test('身份模式：非持旗成员 → 403；持旗管理员 → 200', async () => {
    const store = new InMemoryGovStore();
    await clearFixturePm(store);
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

      // 本人授旗后再改 → 200（服务端读实时名册，不吃陈旧会话快照）
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

  test('身份模式未登录 → 401（写门钩子）；非持旗成员 → 403（非 loopback 来源）', async () => {
    const store = new InMemoryGovStore();
    const app = buildHubServer({ identityMode: 'identity', store });
    try {
      // 显式非 loopback 来源（inject 默认 127.0.0.1 会命中 PIN-DEADLOCK-RECOVERY loopback 豁免）
      const anon = await app.inject({
        method: 'DELETE',
        url: '/api/members/m-visionA/pin',
        remoteAddress: '10.0.0.5',
      });
      expect(anon.statusCode).toBe(401);

      const cookie = await login(app, 'm-ecB'); // 普通成员
      const forbid = await app.inject({
        method: 'DELETE',
        url: '/api/members/m-visionA/pin',
        headers: { cookie },
        remoteAddress: '10.0.0.5',
      });
      expect(forbid.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  test('loopback 豁免（PIN-DEADLOCK-RECOVERY）：非持旗会话 / 无会话 经 loopback DELETE → 200，pinHash 清除', async () => {
    const store = new InMemoryGovStore();
    const app = buildHubServer({ identityMode: 'identity', store });
    try {
      // 给 m-visionA 设 PIN（本人登录自设）
      const userCookie = await login(app, 'm-visionA');
      await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/pin',
        headers: { cookie: userCookie },
        payload: { pin: '9999' },
      });

      // ① 非持旗会话（m-ecB，role=member）经 loopback（inject 默认 127.0.0.1）→ 放行
      const memberCookie = await login(app, 'm-ecB');
      const viaMember = await app.inject({
        method: 'DELETE',
        url: '/api/members/m-visionA/pin',
        headers: { cookie: memberCookie },
      });
      expect(viaMember.statusCode).toBe(200);
      expect(JSON.stringify(viaMember.json())).not.toContain('pinHash');
      expect(
        (await store.getSnapshot()).members.find((m) => m.id === 'm-visionA')?.pinHash,
      ).toBeUndefined();

      // ② 无会话经 loopback → 写门钩子放过、路由豁免 → 200（死锁现场无人能登录的逃生门）
      await store.setMemberPin('m-visionA', 'scrypt:testsalt:testhash'); // 再设回 PIN
      const noSession = await app.inject({ method: 'DELETE', url: '/api/members/m-visionA/pin' });
      expect(noSession.statusCode).toBe(200);
      expect(
        (await store.getSnapshot()).members.find((m) => m.id === 'm-visionA')?.pinHash,
      ).toBeUndefined();
      // 免 PIN 登录恢复（回免 PIN 态）
      const relogin = await app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { memberId: 'm-visionA' },
      });
      expect(relogin.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  test('trustProxy=true：豁免改信转发头——X-Forwarded-For=loopback 放行（SSH 隧道），=非 loopback 仍 401', async () => {
    const store = new InMemoryGovStore();
    const app = buildHubServer({ identityMode: 'identity', store, trustProxy: true });
    try {
      const userCookie = await login(app, 'm-visionA');
      await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/pin',
        headers: { cookie: userCookie },
        payload: { pin: '9999' },
      });

      // 裸 socket 非 loopback（反代），转发头为 loopback（SSH 隧道/本机反代客户端）→ request.ip=127.0.0.1 → 放行
      const tunneled = await app.inject({
        method: 'DELETE',
        url: '/api/members/m-visionA/pin',
        remoteAddress: '10.0.0.1',
        headers: { 'x-forwarded-for': '127.0.0.1' },
      });
      expect(tunneled.statusCode).toBe(200);
      expect(
        (await store.getSnapshot()).members.find((m) => m.id === 'm-visionA')?.pinHash,
      ).toBeUndefined();

      // 转发头非 loopback → 无会话仍被写门 401（豁免不扩散到远端客户端）
      const remote = await app.inject({
        method: 'DELETE',
        url: '/api/members/m-visionA/pin',
        remoteAddress: '10.0.0.1',
        headers: { 'x-forwarded-for': '203.0.113.9' },
      });
      expect(remote.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  test('持旗管理员重置他人 PIN → 200：pinHash 清除、回免 PIN 态、可经 firstSetup 重设；响应剥 pinHash', async () => {
    const store = new InMemoryGovStore();
    await clearFixturePm(store);
    const app = buildHubServer({ identityMode: 'identity', store });
    try {
      // 造持旗管理员（m-ecB）+ 给 m-visionA 设 PIN（本人登录后自设）
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

      // 持旗管理员重置 → 200
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

  test('持旗管理员重置未知 id → 404', async () => {
    const store = new InMemoryGovStore();
    await clearFixturePm(store);
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

describe('敏感门收口：身份模式须持旗管理员（匿名不变）', () => {
  test('gate-reviewer：身份非持旗成员 → 403，持旗 → 200；匿名仍 200', async () => {
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

    const store = new InMemoryGovStore();
    await clearFixturePm(store);
    const app = buildHubServer({ identityMode: 'identity', store });
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

  test('POST /api/seasons：身份非持旗成员 → 403，持旗 → 201', async () => {
    const store = new InMemoryGovStore();
    await clearFixturePm(store);
    const app = buildHubServer({ identityMode: 'identity', store });
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

describe('H3 写门 × 身份模式（令牌/会话双轨，SETUP-WIZARD-TOKEN 修复）', () => {
  // 背景：非 loopback 部署常配 writeToken（start-teamhub.sh 自动生成）。旧写门对所有写一律先查 Bearer，
  // 导致登录本身（POST /api/session）与整个首启动向导（bootstrap → 导 CSV → 确认组长）被 401 锁死——
  // 令牌要进设置页、设置页要先登录。现行规则：身份模式下**有效会话即已鉴权**，且四条引导/认证例外路径
  // （session、bootstrap、roster 导入、loopback PIN 恢复）从 Bearer 硬门放过、鉴权收敛在路由一处判。
  test('身份 + 配 writeToken：无 Bearer 可登录（POST /api/session 豁免 Bearer 门）', async () => {
    const app = buildHubServer({ identityMode: 'identity', writeToken: 'sekret' });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/session',
        payload: { memberId: 'm-ecB' }, // 免 PIN 成员
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  test('身份 + 配 writeToken：持会话 cookie 的写无 Bearer → 放行；无会话无 Bearer → 401', async () => {
    const app = buildHubServer({ identityMode: 'identity', writeToken: 'sekret' });
    try {
      const cookie = await login(app, 'm-progA'); // demo 持旗成员
      const withSession = await app.inject({
        method: 'PUT',
        url: '/api/members/m-ecB/role',
        headers: { cookie },
        payload: { role: 'groupAdmin' },
      });
      expect(withSession.statusCode).toBe(200);
      const anon = await app.inject({
        method: 'PUT',
        url: '/api/members/m-ecB/role',
        payload: { role: 'member' },
      });
      expect(anon.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  test('身份 + 配 writeToken：bootstrap 无 Bearer 无会话 → 200 一笔建人授旗，再来 → 409', async () => {
    const store = new InMemoryGovStore();
    await clearFixturePm(store);
    const app = buildHubServer({ identityMode: 'identity', store, writeToken: 'sekret' });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/setup/super-admin',
        payload: { displayName: '新队长', groupName: '机械', pin: '1234' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().member.projectManager).toBe(true);
      const second = await app.inject({
        method: 'POST',
        url: '/api/setup/super-admin',
        payload: { displayName: '另一个', groupName: '机械', pin: '5678' },
      });
      expect(second.statusCode).toBe(409);
    } finally {
      await app.close();
    }
  });

  test('身份 + 配 writeToken：loopback PIN 恢复无 Bearer → 放行（inject 默认 127.0.0.1）', async () => {
    const store = new InMemoryGovStore();
    const app = buildHubServer({ identityMode: 'identity', store, writeToken: 'sekret' });
    try {
      // 先给 m-ecB 设 PIN（经持旗会话），再从 loopback 无令牌恢复
      const cookie = await login(app, 'm-progA');
      await app.inject({
        method: 'PUT',
        url: '/api/members/m-ecB/pin',
        headers: { cookie },
        payload: { pin: '1234' },
      });
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/members/m-ecB/pin',
      });
      expect(res.statusCode).toBe(200);
      expect(
        (await store.getSnapshot()).members.find((m) => m.id === 'm-ecB')?.pinHash,
      ).toBeFalsy();
    } finally {
      await app.close();
    }
  });
});
