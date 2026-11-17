import Fastify, { type FastifyInstance } from 'fastify';
import { SetupInitRequestSchema, SetupStateResponseSchema } from '@teamhub/hub-contracts';
import { tryServeStaticConsole } from './static-console.js';
import { buildHealthResponse } from './status.js';
import type { V1Database } from './store/v1-database.js';
import { fail } from './lib/fail.js';

export const RESTART_EXIT_CODE = 42;
export interface BuildSetupServerOptions {
  database: V1Database;
  consoleDistDir?: string;
  now?: () => Date;
  exit?: (code: number) => void;
  restartDelayMs?: number;
}
export function buildSetupServer(options: BuildSetupServerOptions): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 });
  const now = options.now ?? (() => new Date());
  const exit = options.exit ?? ((code: number) => process.exit(code));
  app.get('/health', async () => ({ ...buildHealthResponse(now()), setupPending: true }));
  app.get('/api/setup/state', async () => {
    const state = options.database.getDatabaseState();
    if (state === 'initialized') return SetupStateResponseSchema.parse({
      initialized: true, settings: options.database.getSettings(), hasPmMember: false,
    });
    return SetupStateResponseSchema.parse({ initialized: false, databaseState: state });
  });
  app.post('/api/setup/init', async (request, reply) => {
    const input = SetupInitRequestSchema.safeParse(request.body ?? {});
    if (!input.success) return fail(reply, 'VALIDATION_FAILED', { status: 400, detail: input.error.issues[0]?.message ?? 'invalid body' });
    const state = options.database.getDatabaseState();
    if (state !== 'empty') return fail(reply, 'CONFLICT', { status: 409,
      detail: state === 'initialized' ? 'TeamHub 已初始化' : '数据库含未认领业务数据，请使用迁移工具' });
    options.database.initialize(input.data, now());
    setTimeout(() => exit(RESTART_EXIT_CODE), options.restartDelayMs ?? 500);
    void reply.code(200).send({ restarting: true });
    return reply;
  });
  app.setNotFoundHandler(async (request, reply) => {
    if (await tryServeStaticConsole(request, reply, options.consoleDistDir)) return;
    return fail(reply, 'NOT_FOUND', { status: 404, detail: 'Not found' });
  });
  return app;
}
