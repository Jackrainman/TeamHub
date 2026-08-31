import type { FastifyInstance } from 'fastify';
import type { IdentityMode } from '@teamhub/hub-contracts';
import { isLoopbackOperator } from '../http/helpers.js';

export interface WriteGateOptions {
  writeToken?: string;
  rateLimit: { max: number; windowMs: number };
  identityMode: IdentityMode;
  trustProxy: boolean | string;
}

export function registerWriteGate(app: FastifyInstance, opts: WriteGateOptions): void {
  const { writeToken, rateLimit, identityMode, trustProxy } = opts;
  const rateHits = new Map<string, { count: number; resetAt: number }>();
  const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

  app.addHook('onRequest', async (request, reply) => {
    if (!WRITE_METHODS.has(request.method) || !request.url.startsWith('/api/')) return;
    if (request.url.split('?')[0] === '/api/setup/init') return;
    const path = request.url.split('?')[0];
    const isSessionAuthEndpoint =
      path === '/api/session' &&
      (request.method === 'POST' || request.method === 'DELETE');
    const isRosterBootstrap =
      (path === '/api/roster/import' || path === '/api/roster/preview') &&
      request.method === 'POST';
    const isSetupBootstrap =
      path === '/api/setup/super-admin' && request.method === 'POST';
    const isPinRecovery =
      request.method === 'DELETE' &&
      /^\/api\/members\/[^/]+\/pin$/.test(path) &&
      isLoopbackOperator(request, trustProxy);
    const sessionAuthed = identityMode === 'identity' && request.identity != null;
    if (
      writeToken &&
      !isSessionAuthEndpoint &&
      !isRosterBootstrap &&
      !isSetupBootstrap &&
      !isPinRecovery &&
      !sessionAuthed &&
      request.headers.authorization !== `Bearer ${writeToken}`
    ) {
      void reply.code(401).send({ detail: 'unauthorized' });
      return reply;
    }
    if (identityMode === 'identity') {
      if (
        !isSessionAuthEndpoint &&
        !isRosterBootstrap &&
        !isSetupBootstrap &&
        !isPinRecovery &&
        !request.identity
      ) {
        void reply.code(401).send({ detail: 'login required' });
        return reply;
      }
    }
    const ip = request.ip;
    const nowMs = Date.now();
    const hit = rateHits.get(ip);
    if (!hit || nowMs >= hit.resetAt) {
      if (rateHits.size > 10_000) {
        for (const [k, v] of rateHits) if (v.resetAt <= nowMs) rateHits.delete(k);
      }
      rateHits.set(ip, { count: 1, resetAt: nowMs + rateLimit.windowMs });
    } else if (hit.count >= rateLimit.max) {
      void reply.code(429).send({ detail: 'rate limit exceeded' });
      return reply;
    } else {
      hit.count += 1;
    }
  });
}
