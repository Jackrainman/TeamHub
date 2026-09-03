import type { FastifyInstance } from 'fastify';
import type { IdentityMode } from '@teamhub/hub-contracts';
import { isLoopbackOperator, readSessionCookie } from '../http/helpers.js';
import type { SessionManager } from '../identity/session-store.js';

/**
 * 读闸门 + 首登 PIN 闸（AUTH-GATE 公网加固，D-083 身份模式收紧；AUTH-LOGIN-USERNAME 再收紧）。
 *
 * 背景：公网暴露后「匿名可读一切」不再成立。身份模式下——
 *  ① **读闸**：未登录（无会话）一律 401，只放行白名单（登录/会话自身、setup 初始化）。
 *     **GET /api/members 已移出白名单**（AUTH-LOGIN-USERNAME）：登录改自输用户名后登录页不再
 *     需要名册，公网枚举全队名册的口子关掉；BootstrapGate 的「无持旗成员」判定改走
 *     /api/setup/state 的 hasPmMember 字段（本就在白名单）。
 *  ② **首登/升级 PIN 闸**：会话成员无 pinHash（首登）**或挂着旧短 PIN 升级标记**时，一切业务
 *     请求 403 PIN_SETUP_REQUIRED，只放行 PUT 本人 pin / session 端点 / GET setup/state（启动闸）——先设/升密码再进应用，
 *     服务端兜底不依赖前端自觉。PUT pin 成功即清标记（members.ts → sessions.clearPinUpgrade）。
 *
 * 匿名模式本闸门整体不启用（匿名部署无私密面，行为与既往一致）。
 * 钩子须注册在身份解析钩子**之后**（onRequest 按注册序，须先读到 request.identity）。
 */
export interface AuthGateOptions {
  identityMode: IdentityMode;
  /** 查实时名册：该成员是否已设 PIN（读实时、不吃会话快照——PIN 设完下一请求即放行）。 */
  memberHasPin: (memberId: string) => Promise<boolean>;
  /** 会话表（旧短 PIN 升级标记查询；匿名模式为 null）。 */
  sessions: SessionManager | null;
  /** 反代信任（透传 isLoopbackOperator；PIN 灾难恢复口判定用，与写门同参）。 */
  trustProxy: boolean | string;
}

/** 读闸白名单（path 已去 query）。登录/初始化所需的最小集合，除此之外未登录一律 401。
 *  后台不开「加后缀就能进」的口子：/api/setup/* 只放行 state（初始化标记+设置单例+hasPmMember，
 *  低敏）与 super-admin bootstrap（路由自带「已有持旗成员 → 409」一次性门）；config/graduate 等敏感写
 *  未登录 401、登录后还须路由层 superAdmin。roster 导入三口留在白名单仅服务空名册冷启动
 * （路由层 rosterWriteAuth 在非空名册时要求 superAdmin 会话，白名单不过即路由兜住）。 */
function isPreLoginAllowed(method: string, path: string): boolean {
  if (path === '/api/session') return true; // GET 探模式 / POST 登录 / DELETE 登出
  if (method === 'GET' && path === '/api/setup/state') return true; // console 启动闸探测 + BootstrapGate 判定
  if (method === 'POST' && path === '/api/setup/super-admin') return true; // 零管理员初始化（一次性门）
  if (method === 'POST' && (path === '/api/roster/import' || path === '/api/roster/preview')) return true;
  if (method === 'GET' && path === '/api/roster/template') return true;
  return false;
}

/** 首登/升级 PIN 闸放行口：设本人密码 + 会话端点（登出永远可用）。
 *  BUG-IDX-DEADLOCK：GET /api/setup/state 也须放行——App.tsx 启动闸只信它，首登会话被拦 403
 *  则整屏 SetupStateUnavailable，ForcePinGate 永远渲染不出来 → 死锁（公网 HTTPS 首登实测复现）。
 *  该端点内容低敏（initialized 标记 + AppSettings + hasPmMember），本就在预登录白名单内。 */
function isPinSetupAllowed(method: string, path: string, memberId: string): boolean {
  if (path === '/api/session') return true;
  if (method === 'GET' && path === '/api/setup/state') return true; // 启动闸探测（解首登死锁）
  if (method === 'PUT' && path === `/api/members/${memberId}/pin`) return true;
  // bootstrap 初始化首个管理员：同笔设密码+授旗+发会话（路由自身有「已有持旗成员 → 409」护档）。
  if (method === 'POST' && path === '/api/setup/super-admin') return true;
  return false;
}

export function registerAuthGate(app: FastifyInstance, opts: AuthGateOptions): void {
  const { identityMode, memberHasPin, sessions, trustProxy } = opts;

  app.addHook('onRequest', async (request, reply) => {
    if (identityMode !== 'identity') return;
    const path = request.url.split('?')[0];
    if (!path.startsWith('/api/')) return;

    if (!request.identity) {
      if (isPreLoginAllowed(request.method, path)) return;
      // PIN-DEADLOCK-RECOVERY（与写门同一豁免）：本机操作员 PUT/DELETE pin 灾难恢复口不过读闸。
      if (
        (request.method === 'DELETE' || request.method === 'PUT') &&
        /^\/api\/members\/[^/]+\/pin$/.test(path) &&
        isLoopbackOperator(request, trustProxy)
      ) {
        return;
      }
      void reply.code(401).send({ detail: 'login required' });
      return reply;
    }

    const hasPin = await memberHasPin(request.identity.memberId);
    // AUTH-LOGIN-USERNAME：旧短 PIN 登录的会话挂升级标记 → 与无 PIN 同等拦阻。
    const token = readSessionCookie(request);
    const pinUpgrade = token ? (sessions?.isPinUpgradeRequired(token) ?? false) : false;
    if ((!hasPin || pinUpgrade) && !isPinSetupAllowed(request.method, path, request.identity.memberId)) {
      // PIN-DEADLOCK-RECOVERY：loopback 操作员的 PIN 灾难恢复口不受首登闸拦阻（与未登录分支同一豁免）。
      if (
        request.method === 'DELETE' &&
        /^\/api\/members\/[^/]+\/pin$/.test(path) &&
        isLoopbackOperator(request, trustProxy)
      ) {
        return;
      }
      void reply.code(403).send({
        code: 'PIN_SETUP_REQUIRED',
        detail: '首次登录须先设置 PIN',
      });
      return reply;
    }
  });
}
