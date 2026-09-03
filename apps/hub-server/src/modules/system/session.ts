import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  SessionRequestSchema,
  SessionResponseSchema,
} from '@teamhub/hub-contracts';
import type { IdentityMode, SessionIdentity } from '@teamhub/hub-contracts';
import type { PmRepository } from '../pm/repository.js';
import type { SessionManager } from '../../identity/session-store.js';
import { verifyPin } from '../../identity/pin.js';
import {
  parseBody,
  readSessionCookie,
  buildSessionCookie,
  clearSessionCookie,
} from '../../http/helpers.js';

export interface SessionRouteDeps {
  store: PmRepository;
  identityMode: IdentityMode;
  sessions: SessionManager | null;
  /** AUTH-GATE 公网加固：HTTPS 部署下给会话 cookie 加 Secure 标记（env TEAMHUB_COOKIE_SECURE）。 */
  cookieSecure?: boolean;
}

/**
 * 登录失败锁定（AUTH-GATE 公网加固）：按 `ip|memberId` 计数，连续失败 MAX_FAILS 次锁 LOCK_MS。
 * 防在线暴破 PIN——4 位 PIN 空间小，没锁定公网上几分钟就被试穿。成功登录即清零。
 * 内存表、进程重启清零（与 SessionManager 同量级，不引外部存储）。
 */
const LOGIN_MAX_FAILS = 5;
const LOGIN_LOCK_MS = 5 * 60 * 1000;

interface LoginFailEntry {
  fails: number;
  lockedUntil: number;
}

function createLoginLimiter() {
  const entries = new Map<string, LoginFailEntry>();
  return {
    /** 锁定中 → 剩余毫秒；未锁 → 0。 */
    lockedForMs(key: string): number {
      const entry = entries.get(key);
      if (!entry) return 0;
      const remain = entry.lockedUntil - Date.now();
      if (remain <= 0) return 0;
      return remain;
    },
    fail(key: string): void {
      const now = Date.now();
      const entry = entries.get(key);
      if (!entry || (entry.lockedUntil > 0 && now >= entry.lockedUntil)) {
        entries.set(key, { fails: 1, lockedUntil: 0 });
        return;
      }
      const fails = entry.fails + 1;
      entries.set(key, {
        fails,
        lockedUntil: fails >= LOGIN_MAX_FAILS ? now + LOGIN_LOCK_MS : 0,
      });
      // 简易防膨胀：超 1 万条时扫一遍过期项。
      if (entries.size > 10_000) {
        for (const [k, v] of entries) {
          if (v.lockedUntil > 0 && v.lockedUntil <= now) entries.delete(k);
        }
      }
    },
    ok(key: string): void {
      entries.delete(key);
    },
  };
}

export function registerSessionRoutes(app: FastifyInstance, deps: SessionRouteDeps): void {
  const { store, identityMode, sessions } = deps;
  const cookieSecure = deps.cookieSecure ?? false;
  const limiter = createLoginLimiter();

  /** 当前会话成员是否还没设 PIN（读实时名册，不吃会话快照——设完 PIN 同会话立即解禁）。 */
  async function mustSetPin(identity: SessionIdentity | null): Promise<boolean | undefined> {
    if (!identity) return undefined;
    const snapshot = await store.getSnapshot();
    const member = snapshot.members.find((m) => m.id === identity.memberId);
    return member ? !member.pinHash : undefined;
  }

  app.get('/api/session', async (request) => {
    return SessionResponseSchema.parse({
      mode: identityMode,
      session: request.identity ?? null,
      mustSetPin: await mustSetPin(request.identity ?? null),
    });
  });

  app.post('/api/session', async (request: FastifyRequest, reply) => {
    if (identityMode !== 'identity' || !sessions) {
      void reply.code(404).send({ detail: '身份模式未启用' });
      return;
    }
    const parsed = parseBody(SessionRequestSchema, request, reply);
    if (!parsed) return;
    const { memberId, pin } = parsed;
    const limitKey = `${request.ip}|${memberId}`;
    const lockedMs = limiter.lockedForMs(limitKey);
    if (lockedMs > 0) {
      void reply
        .code(429)
        .send({ detail: `尝试次数过多，请 ${Math.ceil(lockedMs / 60000)} 分钟后再试` });
      return;
    }
    const snapshot = await store.getSnapshot();
    const member = snapshot.members.find((m) => m.id === memberId);
    // 防枚举：人不存在 / PIN 错 / 该给 PIN 没给，统一 401 不区分原因。
    const authOk = member
      ? member.pinHash
        ? pin !== undefined && verifyPin(pin, member.pinHash)
        : true
      : false;
    if (!authOk || !member) {
      limiter.fail(limitKey);
      void reply.code(401).send({ detail: '登录失败' });
      return;
    }
    limiter.ok(limitKey);
    const identity: SessionIdentity = {
      memberId: member.id,
      displayName: member.displayName,
      groupId: member.groupId,
      role: member.role,
      gateReviewer: member.gateReviewer,
      projectManager: member.projectManager,
    };
    const token = sessions.create(identity);
    void reply.header('set-cookie', buildSessionCookie(token, { secure: cookieSecure }));
    return SessionResponseSchema.parse({
      mode: 'identity',
      session: identity,
      mustSetPin: !member.pinHash,
    });
  });

  app.delete('/api/session', async (request, reply) => {
    if (identityMode !== 'identity' || !sessions) {
      void reply.code(404).send({ detail: '身份模式未启用' });
      return;
    }
    const token = readSessionCookie(request);
    if (token) sessions.destroy(token);
    void reply.header('set-cookie', clearSessionCookie({ secure: cookieSecure }));
    return SessionResponseSchema.parse({ mode: 'identity', session: null });
  });
}
