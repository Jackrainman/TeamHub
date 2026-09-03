import { describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ROBOTICS_TENANT_CONFIG, type AppSettings } from '@teamhub/hub-contracts';
import type { AppSettingsService } from '../src/store/sqlite-unified.js';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import { usernameOf } from './support/login-helpers.js';

/**
 * AUTH-GATE 公网加固端到端：
 *  - 读闸：身份模式未登录业务 GET 一律 401；白名单（session / setup / roster 导入预览）放行；
 *    匿名模式整体不启用。AUTH-LOGIN-USERNAME：GET /api/members 已移出白名单（登录改自输用户名，
 *    公网枚举名册的口子关掉）。
 *  - 首登 PIN 闸：无 pinHash 成员登录 → 响应 mustSetPin:true；该会话业务请求 403 PIN_SETUP_REQUIRED，
 *    只放行 PUT 本人 pin / session / GET setup/state（BUG-IDX-DEADLOCK：App 启动闸依赖它，拦截即死锁）；设完 PIN 同会话立即解禁（读实时名册，不吃快照）。
 *  - 登录失败锁定：同 ip+username 连续错 5 次 → 429，锁期内连正确 PIN 也拒。
 *  - PUT pin 收紧：非本人非 loopback 设他人 PIN → 403（原 firstSetup 免登录认领通道已关）。
 *  - cookieSecure：开关开 → set-cookie 带 Secure。
 */

async function loginRaw(app: FastifyInstance, memberId: string, pin?: string) {
  const username = usernameOf(memberId);
  return app.inject({
    method: 'POST',
    url: '/api/session',
    payload: pin === undefined ? { username } : { username, pin },
  });
}

async function login(app: FastifyInstance, memberId: string): Promise<string> {
  const res = await loginRaw(app, memberId);
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === 'teamhub_session');
  return `teamhub_session=${cookie!.value}`;
}

describe('读闸：身份模式未登录', () => {
  test('业务 GET（任务/库存/报账/名册）→ 401；白名单（session/setup state）放行', async () => {
    const app = buildTestHubServer({ identityMode: 'identity' });
    try {
      // AUTH-LOGIN-USERNAME：/api/members 移出白名单——未登录读名册同业务端点一律 401
      for (const url of ['/api/tasks', '/api/reimburse/entries', '/api/reimburse/profile', '/api/members']) {
        const res = await app.inject({ method: 'GET', url });
        expect(res.statusCode, url).toBe(401);
      }
      const session = await app.inject({ method: 'GET', url: '/api/session' });
      expect(session.statusCode).toBe(200);
      expect(session.json()).toEqual({ mode: 'identity', session: null });
      // BootstrapGate 判定源 = /api/setup/state 的 hasPmMember（白名单内）——
      // 该路由需 setupControl（app_settings 服务），hasPmMember 的用例见 setup-route.test.ts。
      // 登录端点本身放行（不然永远登不上）
      const loginRes = await loginRaw(app, 'm-ecB');
      expect(loginRes.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  test('匿名模式：读闸不启用（现状零变化）', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/tasks' });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});

describe('首登 PIN 闸（mustSetPin）', () => {
  test('无 pinHash 成员登录 → mustSetPin:true；业务请求 403；设 PIN 后同会话解禁', async () => {
    const app = buildTestHubServer({ identityMode: 'identity' });
    try {
      // m-ecB fixture 无 pinHash
      const loginRes = await loginRaw(app, 'm-ecB');
      expect(loginRes.statusCode).toBe(200);
      expect(loginRes.json().mustSetPin).toBe(true);
      const cookie = `teamhub_session=${loginRes.cookies.find((c) => c.name === 'teamhub_session')!.value}`;

      // GET /api/session 也回 mustSetPin:true
      const session = await app.inject({ method: 'GET', url: '/api/session', headers: { cookie } });
      expect(session.json().mustSetPin).toBe(true);

      // 业务读/写全 403 PIN_SETUP_REQUIRED
      const read = await app.inject({ method: 'GET', url: '/api/tasks', headers: { cookie } });
      expect(read.statusCode).toBe(403);
      expect(read.json().code).toBe('PIN_SETUP_REQUIRED');
      const write = await app.inject({
        method: 'POST',
        url: '/api/dependencies',
        headers: { cookie },
        payload: {},
      });
      expect(write.statusCode).toBe(403);

      // 闸内放行口：PUT 本人 pin
      const setPin = await app.inject({
        method: 'PUT',
        url: '/api/members/m-ecB/pin',
        headers: { cookie },
        payload: { pin: '4321abcd' },
      });
      expect(setPin.statusCode).toBe(200);

      // 设完同会话立即解禁（读实时名册）
      const after = await app.inject({ method: 'GET', url: '/api/tasks', headers: { cookie } });
      expect(after.statusCode).toBe(200);
      const session2 = await app.inject({ method: 'GET', url: '/api/session', headers: { cookie } });
      expect(session2.json().mustSetPin).toBe(false);

      // 下次登录须带新 PIN，响应不再 mustSetPin
      const relogin = await loginRaw(app, 'm-ecB', '4321abcd');
      expect(relogin.statusCode).toBe(200);
      expect(relogin.json().mustSetPin).toBe(false);
    } finally {
      await app.close();
    }
  });

  test('BUG-IDX-DEADLOCK 回归：mustSetPin 会话放行 GET /api/setup/state（App 启动闸依赖它），业务端点仍 403', async () => {
    const settings: AppSettings = {
      schemaVersion: 1,
      projectId: 'p-auth-gate',
      dataMode: 'real',
      identityMode: 'identity',
      verticalId: 'robotics',
      enabledModules: [...ROBOTICS_TENANT_CONFIG.enabledModules],
      initializedAt: '2026-08-15T12:00:00.000Z',
      updatedAt: '2026-08-15T12:00:00.000Z',
    };
    const settingsService: AppSettingsService = {
      getSettings: () => settings,
      getDatabaseState: () => 'initialized',
      initialize: () => { throw new Error('not used'); },
      updateIdentityMode: () => { throw new Error('not used'); },
      graduateToReal: () => { throw new Error('not used'); },
    };
    const app = buildTestHubServer({ identityMode: 'identity', setupControl: { settingsService } });
    try {
      // m-ecB fixture 无 pinHash → 登录即 mustSetPin（首登死锁复现态）
      const loginRes = await loginRaw(app, 'm-ecB');
      expect(loginRes.statusCode).toBe(200);
      expect(loginRes.json().mustSetPin).toBe(true);
      const cookie = `teamhub_session=${loginRes.cookies.find((c) => c.name === 'teamhub_session')!.value}`;

      // 启动闸探测放行：App.tsx 拿到 settings 才能渲染 ForcePinGate（修复前 403 → SetupStateUnavailable 死锁）
      const state = await app.inject({ method: 'GET', url: '/api/setup/state', headers: { cookie } });
      expect(state.statusCode).toBe(200);
      expect(state.json().initialized).toBe(true);
      expect(state.json().hasPmMember).toBe(true);

      // 业务端点仍被首登闸拦（放行面未扩大）
      const blocked = await app.inject({ method: 'GET', url: '/api/tasks', headers: { cookie } });
      expect(blocked.statusCode).toBe(403);
      expect(blocked.json().code).toBe('PIN_SETUP_REQUIRED');
    } finally {
      await app.close();
    }
  });

  test('已有 pinHash 成员登录 → 响应无 mustSetPin 负担（false）', async () => {
    const app = buildTestHubServer({ identityMode: 'identity' });
    try {
      const cookie = await login(app, 'm-visionA');
      await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/pin',
        headers: { cookie },
        payload: { pin: '2468abcd' },
      });
      const res = await loginRaw(app, 'm-visionA', '2468abcd');
      expect(res.statusCode).toBe(200);
      expect(res.json().mustSetPin).toBe(false);
    } finally {
      await app.close();
    }
  });
});

describe('登录失败锁定', () => {
  test('同 username 连续错 PIN 5 次 → 429；锁期内正确 PIN 也拒', async () => {
    const app = buildTestHubServer({ identityMode: 'identity' });
    try {
      // 先给 m-visionA 设 PIN
      const cookie = await login(app, 'm-visionA');
      await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/pin',
        headers: { cookie },
        payload: { pin: '2468abcd' },
      });
      // 连错 5 次
      for (let i = 0; i < 5; i++) {
        const bad = await loginRaw(app, 'm-visionA', '0000');
        expect(bad.statusCode).toBe(401);
      }
      // 第 6 次：连正确 PIN 也 429（锁定生效）
      const locked = await loginRaw(app, 'm-visionA', '2468abcd');
      expect(locked.statusCode).toBe(429);
      // 不同 username 不受牵连（按 ip|username 分桶）
      const other = await loginRaw(app, 'm-ecB');
      expect(other.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});

describe('PUT pin 收紧（firstSetup 免登录认领通道已关）', () => {
  test('设他人 PIN：无会话 → 读闸 401；非本人会话（已设 PIN）→ 403；loopback 兜底放行（灾难恢复）', async () => {
    const app = buildTestHubServer({ identityMode: 'identity' });
    try {
      // 无会话（读闸拦在路由之前）
      const remote = await app.inject({
        method: 'PUT',
        url: '/api/members/m-ecB/pin',
        remoteAddress: '10.0.0.5',
        payload: { pin: '1234abcd' },
      });
      expect(remote.statusCode).toBe(401);
      // 非本人会话：m-visionA 已设 PIN，从非 loopback 改 m-ecB 的 PIN → 403（只许本人）
      const cookie = await login(app, 'm-visionA');
      await app.inject({
        method: 'PUT',
        url: '/api/members/m-visionA/pin',
        headers: { cookie },
        payload: { pin: '2468abcd' },
      });
      const forbid = await app.inject({
        method: 'PUT',
        url: '/api/members/m-ecB/pin',
        remoteAddress: '10.0.0.5',
        headers: { cookie },
        payload: { pin: '1234abcd' },
      });
      expect(forbid.statusCode).toBe(403);
      // loopback 操作员兜底（PIN-DEADLOCK-RECOVERY 先例）
      const loopback = await app.inject({
        method: 'PUT',
        url: '/api/members/m-ecB/pin',
        payload: { pin: '1234abcd' },
      });
      expect(loopback.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});

describe('cookie Secure 标记', () => {
  test('cookieSecure 开 → set-cookie 带 Secure；关（默认）→ 不带', async () => {
    const secureApp = buildTestHubServer({ identityMode: 'identity', cookieSecure: true });
    try {
      const res = await loginRaw(secureApp, 'm-ecB');
      const raw = res.headers['set-cookie'];
      expect(String(raw)).toContain('Secure');
      expect(String(raw)).toContain('HttpOnly');
      expect(String(raw)).toContain('SameSite=Lax');
    } finally {
      await secureApp.close();
    }
    const plainApp = buildTestHubServer({ identityMode: 'identity' });
    try {
      const res = await loginRaw(plainApp, 'm-ecB');
      expect(String(res.headers['set-cookie'])).not.toContain('Secure');
    } finally {
      await plainApp.close();
    }
  });
});
