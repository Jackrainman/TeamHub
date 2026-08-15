import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import {
  SetupInitRequestSchema,
  SetupStateResponseSchema,
} from '@teamhub/hub-contracts';
import { tryServeStaticConsole } from './static-console.js';
import { buildHealthResponse } from './status.js';
import type { AppSettingsService } from './store/sqlite-unified.js';

/** exit code 42 = 请求重启（start-teamhub.sh 循环 / compose restart:on-failure 据此拉起正常模式）。 */
export const RESTART_EXIT_CODE = 42;

export interface BuildSetupServerOptions {
  /** 同一个统一 SQLite 上的设置服务；setup 与正常模式不再分叉为配置文件。 */
  settingsService: AppSettingsService;
  /** console 静态站目录（单端口托管向导页面；缺省则只有 API，无静态站）。 */
  consoleDistDir?: string;
  /** 时钟（默认真钟）：注入以便测试断言 initializedAt / checkedAt 确定。 */
  now?: () => Date;
  /** 退出函数（默认 process.exit）：注入以便测试断言退出码而不真杀进程。 */
  exit?: (code: number) => void;
  /** 受理后延迟退出的毫秒数（默认 500ms，给回执落地时间）；测试可调 0 免等待。 */
  restartDelayMs?: number;
}

/**
 * setup 模式最小 server（SETUP-WIZARD 刀①，setup-wizard.md §3）。
 *
 * app_settings 不存在时启动本 server。打开数据库只建 schema/meta/settings 壳，不建业务表；用户提交后，
 * 六域 seed 与 app_settings 单例在同一事务落库，再退出 42 进入正常模式。
 */
export function buildSetupServer(
  options: BuildSetupServerOptions,
): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 });
  const now = options.now ?? (() => new Date());
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const restartDelayMs = options.restartDelayMs ?? 500;

  // GET /health：与正常模式同形（status/service/checkedAt/buildId），额外带 setupPending:true——
  // 前端轮询据此区分「向导未完成」，重启复活后 setupPending 消失 + buildId 复现即整页刷新。
  app.get('/health', async () => ({
    ...buildHealthResponse(now()),
    setupPending: true,
  }));

  // 未认领业务数据不允许 setup 覆盖，但要把状态返回给向导解释，而不是静默当空库。
  app.get('/api/setup/state', async () => {
    const state = options.settingsService.getDatabaseState();
    if (state === 'initialized') {
      return SetupStateResponseSchema.parse({
        initialized: true,
        settings: options.settingsService.getSettings(),
      });
    }
    return SetupStateResponseSchema.parse({
      initialized: false,
      databaseState: state,
    });
  });

  // POST /api/setup/init：校验选择 → 同事务写六域 seed + app_settings → 回 restarting:true → 延迟 exit 42。
  // 多标签页并发或未认领数据都由 service 在同库上再次检查，不做覆盖。
  app.post('/api/setup/init', async (request, reply) => {
    const parsed = SetupInitRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply
        .code(400)
        .send({ detail: parsed.error.issues[0]?.message ?? 'invalid body' });
      return reply;
    }
    const state = options.settingsService.getDatabaseState();
    if (state === 'initialized') {
      void reply.code(409).send({ detail: 'TeamHub 已初始化' });
      return reply;
    }
    if (state === 'unclaimed') {
      void reply.code(409).send({ detail: '数据库含未认领业务数据，拒绝初始化覆盖' });
      return reply;
    }
    options.settingsService.initialize(parsed.data, now());
    // 先安排重启再回执：回执落地后 ~500ms 进程退 42，start 脚本 / compose 拉起正常模式。
    setTimeout(() => exit(RESTART_EXIT_CODE), restartDelayMs);
    void reply.code(200).send({ restarting: true });
    return reply;
  });

  // 其余路径交静态站（向导页面）；非静态资源且非上面 API → 404。
  app.setNotFoundHandler(async (request, reply) => {
    if (await tryServeStaticConsole(request, reply, options.consoleDistDir)) {
      return;
    }
    void reply.code(404).send({ detail: 'Not found' });
  });

  return app;
}
