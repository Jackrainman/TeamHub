import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  DeployConfigSchema,
  SetupInitRequestSchema,
  SetupStateResponseSchema,
} from '@teamhub/hub-contracts';
import type { DeployConfig } from '@teamhub/hub-contracts';
import { tryServeStaticConsole } from './static-console.js';
import { buildHealthResponse } from './status.js';

/** exit code 42 = 请求重启（start-teamhub.sh 循环 / compose restart:on-failure 据此拉起正常模式）。 */
export const RESTART_EXIT_CODE = 42;

export interface BuildSetupServerOptions {
  /** config.json 落盘路径（向导提交后写入这里，随后 exit 42 重启进正常模式）。 */
  configFile: string;
  /** console 静态站目录（单端口托管向导页面；缺省则只有 API，无静态站）。 */
  consoleDistDir?: string;
  /**
   * 五域（gov/kb/inv/baseline/checklist）落盘文件候选路径。GET /api/setup/state 的 dataDirHasData =
   * 其中任一已存在——供升级迁移提示（既有 v0.25.x 部署升级后见一次向导时提示「检测到已有数据」）。
   */
  dataFileCandidates?: string[];
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
 * config.json 不存在时启动本 server（**不建任何数据 store、不落任何种子**——"选了才 seed"是向导能选真空板的
 * 前提）。只注册四件事：console 静态站托管、`GET /health`（带 setupPending:true）、`GET /api/setup/state`、
 * `POST /api/setup/init`（写 config.json → 回 restarting:true → 延迟 exit 42）。
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

  // GET /api/setup/state：setup 模式恒 initialized:false；dataDirHasData 报五域任一落盘文件是否已存在。
  app.get('/api/setup/state', async () => {
    const dataDirHasData = (options.dataFileCandidates ?? []).some((p) =>
      existsSync(p),
    );
    return SetupStateResponseSchema.parse({
      initialized: false,
      dataDirHasData,
    });
  });

  // POST /api/setup/init：zod 校验 {dataMode, identityMode} → mkdir -p → 写 config.json → 回 restarting:true
  // → 延迟 exit 42。已初始化（config.json 已存在，多标签页并发）→ 409 幂等。
  app.post('/api/setup/init', async (request, reply) => {
    const parsed = SetupInitRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply
        .code(400)
        .send({ detail: parsed.error.issues[0]?.message ?? 'invalid body' });
      return reply;
    }
    // 竞态防护：另一标签页刚写完 config.json → 409（不覆盖、不重复退出）。
    if (existsSync(options.configFile)) {
      void reply.code(409).send({ detail: '已初始化（config.json 已存在）' });
      return reply;
    }
    const config: DeployConfig = {
      schemaVersion: 1,
      dataMode: parsed.data.dataMode,
      identityMode: parsed.data.identityMode,
      initializedAt: now().toISOString(),
    };
    // 对称 fail-closed：落盘前先自校验产物合法（写坏文件会让下次启动拒起，务必只落合法 config）。
    const validated = DeployConfigSchema.parse(config);
    await mkdir(dirname(options.configFile), { recursive: true });
    await writeFile(
      options.configFile,
      `${JSON.stringify(validated, null, 2)}\n`,
      'utf8',
    );
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
