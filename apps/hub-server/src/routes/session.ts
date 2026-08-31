import type { FastifyInstance } from 'fastify';
import {
  SessionRequestSchema,
  SessionResponseSchema,
} from '@teamhub/hub-contracts';
import type { IdentityMode, SessionIdentity } from '@teamhub/hub-contracts';
import type { PmRepository } from '../modules/pm/repository.js';
import type { SessionManager } from '../identity/session-store.js';
import { verifyPin } from '../identity/pin.js';
import {
  parseBody,
  readSessionCookie,
  buildSessionCookie,
  clearSessionCookie,
} from './helpers.js';

export interface SessionRouteDeps {
  store: PmRepository;
  identityMode: IdentityMode;
  sessions: SessionManager | null;
}

export function registerSessionRoutes(app: FastifyInstance, deps: SessionRouteDeps): void {
  const { store, identityMode, sessions } = deps;

  app.get('/api/session', async (request) => {
    return SessionResponseSchema.parse({
      mode: identityMode,
      session: request.identity ?? null,
    });
  });

  app.post('/api/session', async (request, reply) => {
    if (identityMode !== 'identity' || !sessions) {
      void reply.code(404).send({ detail: '身份模式未启用' });
      return;
    }
    const parsed = parseBody(SessionRequestSchema, request, reply);
    if (!parsed) return;
    const { memberId, pin } = parsed;
    const snapshot = await store.getSnapshot();
    const member = snapshot.members.find((m) => m.id === memberId);
    const authOk = member
      ? member.pinHash
        ? pin !== undefined && verifyPin(pin, member.pinHash)
        : true
      : false;
    if (!authOk || !member) {
      void reply.code(401).send({ detail: '登录失败' });
      return;
    }
    const identity: SessionIdentity = {
      memberId: member.id,
      displayName: member.displayName,
      groupId: member.groupId,
      role: member.role,
      gateReviewer: member.gateReviewer,
      projectManager: member.projectManager,
    };
    const token = sessions.create(identity);
    void reply.header('set-cookie', buildSessionCookie(token));
    return SessionResponseSchema.parse({ mode: 'identity', session: identity });
  });

  app.delete('/api/session', async (request, reply) => {
    if (identityMode !== 'identity' || !sessions) {
      void reply.code(404).send({ detail: '身份模式未启用' });
      return;
    }
    const token = readSessionCookie(request);
    if (token) sessions.destroy(token);
    void reply.header('set-cookie', clearSessionCookie());
    return SessionResponseSchema.parse({ mode: 'identity', session: null });
  });
}
