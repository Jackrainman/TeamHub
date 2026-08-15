import { ROBOTICS_TENANT_CONFIG } from '@teamhub/hub-contracts';
import type { DeploymentInfo } from '@teamhub/hub-contracts';
import { buildHubServer } from './server.js';
import { RealClock } from './clock.js';
import type { Clock } from './clock.js';
import { openUnifiedDb, defaultSeeds } from './store/sqlite-unified.js';
import { LarkIntegrationStore } from './store/lark-integration-store.js';
import { getArtifactDir } from './artifact-storage.js';
import { resolveBuildId } from './status.js';
import { parseTenantConfigEnv } from './tenant-config-env.js';
import { readDeployConfigFile } from './deploy-config-file.js';
import { buildSetupServer } from './build-setup-server.js';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4177;

async function main(): Promise<void> {
  // 部署配置（SETUP-WIZARD 刀①，setup-wizard.md §2/§3）：config.json 是模式的唯一真相。
  // 存在 → 严格解析（坏文件 fail-closed 抛错、拒启动）→ dataMode/identityMode 全取自 config；
  // 不存在 → setup 模式（首启动向导）。TEAMHUB_CONFIG_FILE 覆盖路径（默认 ~/teamhub-data/config.json）。
  const configFile =
    process.env.TEAMHUB_CONFIG_FILE ??
    join(homedir(), 'teamhub-data', 'config.json');
  const config = await readDeployConfigFile(configFile);

  const host = process.env.HUB_HOST ?? DEFAULT_HOST;
  const port = Number.parseInt(process.env.HUB_PORT ?? String(DEFAULT_PORT), 10);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('invalid HUB_PORT');
  }

  const dbFile = process.env.TEAMHUB_DB_FILE;

  // ── setup 模式（config.json 不存在）：最小 server 托管向导，不建任何 store、不落任何种子 ────────────
  if (!config) {
    const dataFileCandidates = dbFile ? [dbFile] : [];
    const setupApp = buildSetupServer({
      configFile,
      consoleDistDir: process.env.TEAMHUB_CONSOLE_DIST_DIR,
      dataFileCandidates,
    });
    await setupApp.listen({ host, port });
    console.log(
      `[teamhub-hub-server] setup 模式（未初始化）：打开 http://${host}:${port} 跟随向导完成初始化（配置将写入 ${configFile}）`,
    );
    return;
  }

  // ── 正常模式（config.json 存在）：dataMode/identityMode 全取自 config ──────────────────────────
  // 空板 flag：仅决定**新建**落盘文件的首次种子（演示场景 vs 空板）；已有文件按原样加载。
  const demoSeed = config.dataMode === 'demo';
  // K6（时钟与空板刀）：真实态注入 RealClock 到所有吃 clock 的构造点（各 store 工厂 + buildHubServer options）；
  // 演示态传 undefined → 各构造点回退 FixedClock(GOVERNANCE_SCENARIO_NOW)，演示 / health-check / 既有测试零变化。
  // kb/baseline/checklist 三 store 本身不吃 clock（其 createdAt 由路由层 clock=buildHubServer options 注入），
  // 故只 gov/inv store 工厂 + server options 三处显式透传；逐个 grep 确认无遗漏（clock.ts 全仓消费点）。
  const clock: Clock | undefined = demoSeed ? undefined : new RealClock();

  if (!dbFile) {
    throw new Error('正常模式必须设置 TEAMHUB_DB_FILE（统一 SQLite 库文件路径）');
  }
  const unified = openUnifiedDb(dbFile, {
    seeds: defaultSeeds(demoSeed),
    clock,
  });
  const larkStore = LarkIntegrationStore.fromSharedDb(unified.db);
  await unified.gov.ensureDefaultGroups();

  // IDENTITY-LITE（D-083 §4.2）：轻身份登录双模式，来源 = config.identityMode（SETUP-WIZARD 刀①，模式类
  // env 已退役）。'anonymous' = 匿名模式（身份模块不启用、session 端点禁用、写路由信客户端自报 actor、写门
  // 只认 TEAMHUB_WRITE_TOKEN）；'identity' = 身份模式（匿名可读一切 + 登录才能写，写路由须携有效会话、actor
  // 服务端注入）。
  const identityMode = config.identityMode;

  // 写 token 属于启动秘密：显式 env 优先；未设置时复用统一 SQLite 中持久化的随机 token。
  const writeToken =
    process.env.TEAMHUB_WRITE_TOKEN ?? larkStore.getWriteToken();

  // 反代信任：单端口 4177 反代 / 隧道部署后面须设 TEAMHUB_TRUST_PROXY=true，否则写限流塌成全队单桶（见 server.ts）。
  const trustProxy = process.env.TEAMHUB_TRUST_PROXY === 'true';

  // 装配层接线（AUDIT-DEBT-2026-07 §9-④ 审计债④）：TenantConfig 通道此前从未接到真实启动路径，
  // `buildHubServer` 恒吃内部缺省 ROBOTICS_TENANT_CONFIG（全 6 模块开）。`TEAMHUB_TENANT_MODULES`
  // 未设 → parseTenantConfigEnv 返回 undefined → 行为与今天逐字一致；设了才真正收窄模块
  // （见 tenant-config-env.ts 头部注释 + tenant-config-route.test.ts 验证过的"关模块"真实行为）。
  const tenantConfig = parseTenantConfigEnv(process.env.TEAMHUB_TENANT_MODULES);

  // 部署信息与唯一生产数据库同源；不再根据 Store 是否注入推导 file/memory 分支。
  const storage: DeploymentInfo['storage'] = [
    { domain: 'gov', backend: 'sqlite', path: dbFile },
    { domain: 'kb', backend: 'sqlite', path: dbFile },
    { domain: 'inv', backend: 'sqlite', path: dbFile },
    { domain: 'baseline', backend: 'sqlite', path: dbFile },
    { domain: 'checklist', backend: 'sqlite', path: dbFile },
    { domain: 'reimburse', backend: 'sqlite', path: dbFile },
  ];
  const deployment: DeploymentInfo = {
    // SETUP-WIZARD 刀③：数据形态回显——设置页「部署配置」据此决定是否显示「结束试驾，转正式」按钮（仅 demo）。
    dataMode: config.dataMode,
    identityMode,
    storage,
    // 启用模块 = 有效租户配置（未设 TEAMHUB_TENANT_MODULES → 缺省全 6 模块，与 buildHubServer 同一缺省）。
    enabledModules: (tenantConfig ?? ROBOTICS_TENANT_CONFIG).enabledModules,
    // 未配 TEAMHUB_ARTIFACT_FILES_DIR → 图纸上传裸 400；console 据此禁用上传按钮。
    artifactUploadEnabled: getArtifactDir() !== null,
    buildId: resolveBuildId(),
  };

  const app = buildHubServer({
    consoleDistDir: process.env.TEAMHUB_CONSOLE_DIST_DIR,
    store: unified.gov,
    clock,
    kbStore: unified.kb,
    invStore: unified.inv,
    baselineStore: unified.baseline,
    checklistStore: unified.checklist,
    reimburseStore: unified.reimburse,
    writeToken,
    trustProxy,
    identityMode,
    tenantConfig,
    deployment,
    larkStore,
    setupControl: {
      configFile,
      config,
      dataFiles: [dbFile],
      artifactDir: getArtifactDir() ?? undefined,
    },
  });

  app.addHook('onClose', async () => {
    unified.close();
  });

  let shutdownStarted = false;
  const shutdown = () => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    void app.close().catch((error: unknown) => {
      app.log.error(error, 'graceful shutdown failed');
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  await app.listen({ host, port });
  app.log.info(`teamhub hub-server listening on http://${host}:${port}`);
}

main().catch((error) => {
  console.error(`[teamhub-hub-server] ${(error as Error).message}`);
  process.exit(1);
});
