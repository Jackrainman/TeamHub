import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import type { SessionIdentity } from '@teamhub/hub-contracts';
import { SessionManager } from './identity/session-store.js';
import { SqliteSessionStore } from './identity/sqlite-session-store.js';
import { RealClock } from './clock.js';
import type { Clock } from './clock.js';
import { tryServeStaticConsole } from './static-console.js';
import { SESSION_TTL_MS, buildSessionCookie, readSessionCookie } from './http/helpers.js';
import { registerWriteGate } from './middleware/write-gate.js';
import { registerAuthGate } from './middleware/auth-gate.js';
import { fail } from './lib/fail.js';
import type { V1Database } from './store/v1-database.js';
import { SqliteApplicationUnitOfWork } from './infrastructure/sqlite-application-unit-of-work.js';
import { createSystemModule } from './modules/system/index.js';
import { createTasksModule } from './modules/tasks/index.js';
import { createReimburseModule } from './modules/reimburse/index.js';
import { createSearchModule } from './modules/search/index.js';

declare module 'fastify' {
  interface FastifyRequest { identity: SessionIdentity | null }
}
export interface BuildHubServerOptions {
  database: V1Database;
  consoleDistDir?: string;
  clock?: Clock;
  writeToken?: string;
  writeRateLimit?: { max: number; windowMs: number };
  trustProxy?: boolean | string;
  cookieSecure?: boolean;
  setupControl?: { now?: () => Date; exit?: (code: number) => void; restartDelayMs?: number };
}
export function buildHubServer(options: BuildHubServerOptions): FastifyInstance {
  const settings = options.database.getSettings();
  if (!settings) throw new Error('database is not initialized');
  const app = Fastify({ logger: false, bodyLimit: 256 * 1024, trustProxy: options.trustProxy ?? false });
  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    void fail(reply, status === 500 ? 'INTERNAL' : 'VALIDATION_FAILED', { status, detail: error.message || 'internal error' });
  });
  const clock = options.clock ?? new RealClock();
  const db = options.database.db;
  const unitOfWork = new SqliteApplicationUnitOfWork(db, clock);
  const sessions = settings.identityMode === 'identity'
    ? new SessionManager(new SqliteSessionStore(db), SESSION_TTL_MS) : null;

  const system = createSystemModule(db);
  const tasks = createTasksModule({
    db, clock, directory: system.publicApi, identityMode: settings.identityMode,
  });
  const reimburse = createReimburseModule({
    db, clock, admin: system.publicApi, unitOfWork, identityMode: settings.identityMode,
  });
  const search = createSearchModule({
    tasks: tasks.publicApi,
    members: system.publicApi,
    reimburse: reimburse.publicApi,
  });

  app.decorateRequest('identity', null);
  if (sessions) {
    app.addHook('onRequest', async (request, reply) => {
      const token = readSessionCookie(request);
      request.identity = token ? sessions.resolve(token) : null;
      if (token && request.identity && sessions.touch(token)) {
        void reply.header('set-cookie', buildSessionCookie(token, { secure: options.cookieSecure }));
      }
    });
  }
  registerAuthGate(app, {
    identityMode: settings.identityMode,
    trustProxy: options.trustProxy ?? false,
    sessions,
    memberHasPin: async (memberId) => system.publicApi.memberHasPin(memberId),
  });
  registerWriteGate(app, {
    writeToken: options.writeToken,
    rateLimit: options.writeRateLimit ?? { max: 120, windowMs: 60_000 },
    identityMode: settings.identityMode,
    trustProxy: options.trustProxy ?? false,
  });
  void app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 1 } });
  system.registerRoutes(app, {
    settings,
    tasks: tasks.publicApi,
    identityMode: settings.identityMode,
    sessions,
    trustProxy: options.trustProxy ?? false,
    cookieSecure: options.cookieSecure,
    setupControl: options.setupControl ? { database: options.database, ...options.setupControl } : undefined,
  });
  tasks.registerRoutes(app);
  reimburse.registerRoutes(app);
  search.registerRoutes(app);
  app.setNotFoundHandler(async (request, reply) => {
    if (await tryServeStaticConsole(request, reply, options.consoleDistDir)) return;
    return fail(reply, 'NOT_FOUND', { status: 404, detail: 'Not found' });
  });
  return app;
}
