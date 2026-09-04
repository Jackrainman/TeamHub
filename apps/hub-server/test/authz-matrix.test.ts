import { describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ROBOTICS_TENANT_CONFIG, type AppSettings } from '@teamhub/hub-contracts';
import type { AppSettingsService } from '../src/store/sqlite-unified.js';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import { usernameOf } from './support/login-helpers.js';

/**
 * 授权矩阵扫描（VERIFY-SCRIPT-UPGRADE）：全量遍历 server 注册的每一条 /api/* 路由 × 四类身份
 * （匿名 / 首登未设PIN / 普通成员 / 持旗管理员），断言闸级结果——
 *   anon   ：读闸（auth-gate）未登录一律 401，仅预登录白名单放行；
 *   pinGate：首登/升级 PIN 闸，业务一律 403 PIN_SETUP_REQUIRED，仅放行口（session/setup state/
 *            PUT 本人 pin/setup super-admin）通过；
 *   member ：过闸（业务 403 如门验收人/组长专属不算闸拦，各有专项测试覆盖），超管专属路由须 403；
 *   admin  ：持项目管理旗标（m-progA），无任何 401/闸 403。
 *
 * 覆盖机制：路由清单来自 app.printRoutes() 自动枚举——新增路由自动纳入矩阵（默认按业务端点
 * 期望 anon 401 / pinGate 403 / member·admin 过闸），与该期望不符即红，迫使在 ROWS 显式归类；
 * ROWS 里的每一条也反向核对真实存在，路由改名/删除会立刻暴露陈旧条目。
 *
 * 所有请求走非 loopback（REMOTE）：本机操作员豁免（PIN 灾难恢复口等）不参与矩阵断言。
 */

const REMOTE = '10.0.0.5';

type GateClass = 'anon' | 'pinGate' | 'member' | 'admin';
/** 'pass' = 过闸：非 401 且非闸级 403（PIN_SETUP_REQUIRED）；数字 = 精确状态码。 */
type Verdict = 'pass' | 401 | 403;

interface MatrixRow {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** printRoutes 模式（含 :param），用于存在性核对。 */
  path: string;
  /** inject 用具体 URL；缺省把 :param 替换为 'matrix-nope'（业务 404 算过闸）。 */
  url?: (cls: GateClass) => string;
  payload?: Record<string, unknown>;
  /** 不发会话 cookie（session 端点自身：避免 DELETE 误销本类会话）。 */
  noCookie?: boolean;
  expect: Record<GateClass, Verdict>;
}

const ALL_PASS: Record<GateClass, Verdict> = { anon: 'pass', pinGate: 'pass', member: 'pass', admin: 'pass' };
const ADMIN_ONLY: Record<GateClass, Verdict> = { anon: 401, pinGate: 403, member: 403, admin: 'pass' };

const ROWS: MatrixRow[] = [
  // ── 预登录白名单（auth-gate.isPreLoginAllowed）+ PIN 闸放行口，四类身份全过闸 ──
  { method: 'GET', path: '/api/session', noCookie: true, expect: ALL_PASS },
  { method: 'POST', path: '/api/session', noCookie: true, payload: { username: usernameOf('m-ecB') }, expect: ALL_PASS },
  { method: 'DELETE', path: '/api/session', noCookie: true, expect: ALL_PASS },
  { method: 'GET', path: '/api/setup/state', expect: ALL_PASS },
  // 一次性 bootstrap 门：fixture 已有持旗成员 → 409（过闸、非 401/403）
  { method: 'POST', path: '/api/setup/super-admin', payload: { pin: '1234abcd' }, expect: ALL_PASS },
  // PUT 本人 pin：PIN 闸放行口。无效 payload → 400（验过闸即可），避免真设 PIN 改变后续请求的闸态
  {
    method: 'PUT',
    path: '/api/members/:id/pin',
    url: (cls) =>
      `/api/members/${cls === 'member' ? 'm-visionA' : cls === 'admin' ? 'm-progA' : 'm-ecB'}/pin`,
    payload: { pin: '123' },
    expect: { anon: 401, pinGate: 'pass', member: 'pass', admin: 'pass' },
  },
  // 名册模板：预登录白名单放行（空名册冷启动），但不在 PIN 闸放行口内
  { method: 'GET', path: '/api/roster/template', expect: { anon: 'pass', pinGate: 403, member: 'pass', admin: 'pass' } },

  // ── 超管专属（requireSuperAdmin / isSuperAdmin / rosterWriteAuth 非空名册）──
  { method: 'PUT', path: '/api/setup/config', expect: ADMIN_ONLY },
  { method: 'POST', path: '/api/setup/graduate', expect: ADMIN_ONLY },
  // groups/seasons 路由 parseBody 先于超管判定，payload 须合法才够到 403
  { method: 'POST', path: '/api/groups', payload: { name: '矩阵组' }, expect: ADMIN_ONLY },
  { method: 'PUT', path: '/api/groups/:id', payload: { name: 'x' }, expect: ADMIN_ONLY },
  { method: 'DELETE', path: '/api/groups/:id', expect: ADMIN_ONLY },
  {
    method: 'POST',
    path: '/api/seasons',
    payload: { name: '矩阵赛季', startsAt: '2026-09-01T00:00:00.000Z', endsAt: null },
    expect: ADMIN_ONLY,
  },
  { method: 'DELETE', path: '/api/members/:id/pin', expect: ADMIN_ONLY },
  { method: 'PUT', path: '/api/members/:id/gate-reviewer', payload: { gateReviewer: true }, expect: ADMIN_ONLY },
  { method: 'PUT', path: '/api/members/:id/role', payload: { role: 'member' }, expect: ADMIN_ONLY },
  { method: 'PUT', path: '/api/members/:id/project-manager', payload: { projectManager: true }, expect: ADMIN_ONLY },
  // roster 导入三口在预登录白名单内过闸，非空名册时由路由层 rosterWriteAuth 兜住（匿名 401/成员 403）
  { method: 'POST', path: '/api/roster/preview', expect: ADMIN_ONLY },
  { method: 'POST', path: '/api/roster/import', expect: ADMIN_ONLY },
  { method: 'POST', path: '/api/kb/import-docs', expect: ADMIN_ONLY },
  { method: 'POST', path: '/api/inventory/preview', expect: ADMIN_ONLY },
  { method: 'POST', path: '/api/inventory/import', expect: ADMIN_ONLY },
];

/** 未列入 ROWS 的路由一律按普通业务端点期望：未登录 401、首登 403、成员/管理员过闸。 */
const BUSINESS_DEFAULT: Record<GateClass, Verdict> = { anon: 401, pinGate: 403, member: 'pass', admin: 'pass' };

/** 解析 printRoutes() 压缩前缀树 → 扁平 {method,path}（剔除 GET 自动派生的 HEAD）。 */
function enumerateApiRoutes(app: FastifyInstance): { method: string; path: string }[] {
  const stack: string[] = [];
  const out: { method: string; path: string }[] = [];
  for (const line of app.printRoutes().split('\n')) {
    if (!line.trim()) continue;
    const marker = line.search(/[├└]── /);
    const depth = marker / 4;
    const rest = line.slice(marker + 4);
    const m = rest.match(/^(.*?)(?: \(([^)]*)\))?$/);
    stack[depth] = m![1];
    stack.length = depth + 1;
    if (!m![2]) continue;
    const path = stack.join('');
    for (const method of m![2].split(', ')) {
      if (method !== 'HEAD') out.push({ method, path });
    }
  }
  return out.filter((r) => r.path.startsWith('/api/'));
}

const MATRIX_SETTINGS: AppSettings = {
  schemaVersion: 1,
  projectId: 'p-authz-matrix',
  dataMode: 'real',
  identityMode: 'identity',
  verticalId: 'robotics',
  enabledModules: [...ROBOTICS_TENANT_CONFIG.enabledModules],
  initializedAt: '2026-08-15T12:00:00.000Z',
  updatedAt: '2026-08-15T12:00:00.000Z',
};

async function login(app: FastifyInstance, memberId: string, pin?: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/session',
    payload: pin === undefined ? { username: usernameOf(memberId) } : { username: usernameOf(memberId), pin },
  });
  expect(res.statusCode, `login ${memberId}`).toBe(200);
  return `teamhub_session=${res.cookies.find((c) => c.name === 'teamhub_session')!.value}`;
}

function assertVerdict(verdict: Verdict, res: { statusCode: number; json: () => unknown }, ctx: string) {
  if (verdict !== 'pass') {
    expect(res.statusCode, ctx).toBe(verdict);
    return;
  }
  expect(res.statusCode, ctx).not.toBe(401);
  // 业务 403（门验收人/组长/本人专属）容忍；闸级 403（PIN_SETUP_REQUIRED）不容忍
  if (res.statusCode === 403) {
    expect((res.json() as { code?: string })?.code, ctx).not.toBe('PIN_SETUP_REQUIRED');
  }
}

describe('授权矩阵：全路由 × 四类身份', () => {
  test('矩阵扫描 + 路由枚举双向核对', async () => {
    // setupControl stub：让 PUT /api/setup/config、POST /api/setup/graduate 两条超管路由也注册进矩阵
    const settingsService: AppSettingsService = {
      getSettings: () => MATRIX_SETTINGS,
      getDatabaseState: () => 'initialized',
      initialize: () => { throw new Error('not used'); },
      updateIdentityMode: () => { throw new Error('not used'); },
      graduateToReal: () => { throw new Error('not used'); },
    };
    // writeRateLimit 放宽：单 IP 数百次 inject 不触发 429（限流本身由 authz-route/write-gate 专项覆盖）
    const app = buildTestHubServer({
      identityMode: 'identity',
      setupControl: { settingsService },
      writeRateLimit: { max: 100_000, windowMs: 60_000 },
    });
    try {
      // 身份装配：PIN 设置走 loopback 灾难恢复口（与矩阵请求的非 loopback 隔离）
      await app.inject({ method: 'PUT', url: '/api/members/m-progA/pin', payload: { pin: 'admin12345' } });
      await app.inject({ method: 'PUT', url: '/api/members/m-visionA/pin', payload: { pin: '2468abcd' } });
      const cookies: Record<Exclude<GateClass, 'anon'>, string> = {
        pinGate: await login(app, 'm-ecB'), // fixture 无 pinHash → mustSetPin 会话
        member: await login(app, 'm-visionA', '2468abcd'),
        admin: await login(app, 'm-progA', 'admin12345'),
      };

      // 双向核对：ROWS 每条必须真实存在；枚举全量自动纳入（未归类 → 业务默认期望）
      const enumerated = enumerateApiRoutes(app);
      const enumeratedKeys = new Set(enumerated.map((r) => `${r.method} ${r.path}`));
      for (const row of ROWS) {
        expect(enumeratedKeys.has(`${row.method} ${row.path}`), `ROWS 陈旧条目：${row.method} ${row.path}`).toBe(true);
      }
      const explicitKeys = new Set(ROWS.map((r) => `${r.method} ${r.path}`));
      const rows: MatrixRow[] = [
        ...ROWS,
        ...enumerated
          .filter((r) => !explicitKeys.has(`${r.method} ${r.path}`))
          .map((r) => ({ method: r.method as MatrixRow['method'], path: r.path, expect: BUSINESS_DEFAULT })),
      ];

      const classes: GateClass[] = ['anon', 'pinGate', 'member', 'admin'];
      let checked = 0;
      for (const cls of classes) {
        for (const row of rows) {
          const url = row.url?.(cls) ?? row.path.replace(/:[^/]+/g, 'matrix-nope');
          const cookie = row.noCookie || cls === 'anon' ? undefined : cookies[cls];
          const res = await app.inject({
            method: row.method,
            url,
            remoteAddress: REMOTE,
            headers: cookie ? { cookie } : {},
            payload: row.payload,
          });
          assertVerdict(row.expect[cls], res, `${cls} ${row.method} ${row.path} → ${res.statusCode}`);
          checked += 1;
        }
      }
      expect(checked).toBe(enumerated.length * 4);
    } finally {
      await app.close();
    }
  });

  test('/health 在 /api 闸外：匿名 200', async () => {
    const app = buildTestHubServer({ identityMode: 'identity' });
    try {
      const res = await app.inject({ method: 'GET', url: '/health', remoteAddress: REMOTE });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
