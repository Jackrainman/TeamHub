import { GOVERNANCE_SCENARIO_NOW } from '@teamhub/hub-contracts';
import type { DeploymentInfo, TenantConfig } from '@teamhub/hub-contracts';
import { LocalArtifactFileStorage } from './modules/archive/index.js';
import { buildSetupServer } from './build-setup-server.js';
import { FixedClock, RealClock } from './clock.js';
import type { Clock } from './clock.js';
import { buildHubServer } from './server.js';
import { LarkIntegrationStore } from './modules/integrations/lark-store.js';
import { openUnifiedDb } from './store/sqlite-unified.js';
import { resolveBuildId } from './status.js';
import { SqliteApplicationUnitOfWork } from './infrastructure/sqlite-application-unit-of-work.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4177;

async function main(): Promise<void> {
  const host = process.env.HUB_HOST ?? DEFAULT_HOST;
  const port = Number.parseInt(process.env.HUB_PORT ?? String(DEFAULT_PORT), 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('invalid HUB_PORT');
  }

  const dbFile = process.env.TEAMHUB_DB_FILE;
  if (!dbFile) {
    throw new Error('必须设置 TEAMHUB_DB_FILE（唯一生产 SQLite 库文件路径）');
  }

  // 启动先只打开统一库的 meta/app_settings 壳；设置单例决定 setup 或正常模式，绝不读配置文件/env fallback。
  const database = openUnifiedDb(dbFile);
  const databaseState = database.getDatabaseState();
  if (databaseState !== 'initialized') {
    const setupApp = buildSetupServer({
      settingsService: database,
      consoleDistDir: process.env.TEAMHUB_CONSOLE_DIST_DIR,
    });
    setupApp.addHook('onClose', async () => database.close());
    await setupApp.listen({ host, port });
    console.log(
      `[teamhub-hub-server] setup 模式（databaseState=${databaseState}）：打开 http://${host}:${port} 完成初始化`,
    );
    return;
  }

  const settings = database.getSettings();
  if (!settings) {
    database.close();
    throw new Error('数据库状态为 initialized，但 app_settings 单例不存在');
  }

  const clock: Clock =
    settings.dataMode === 'demo'
      ? new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW))
      : new RealClock();
  const stores = database.openStores(clock);
  const unitOfWork = new SqliteApplicationUnitOfWork(database.db, clock);
  const larkStore = LarkIntegrationStore.fromSharedDb(database.db);
  await stores.gov.ensureDefaultGroups();

  const identityMode = settings.identityMode;
  const writeToken = process.env.TEAMHUB_WRITE_TOKEN ?? larkStore.getWriteToken();
  const trustProxy = process.env.TEAMHUB_TRUST_PROXY === 'true';
  const tenantConfig: TenantConfig = {
    enabledModules: [...settings.enabledModules],
  };

  const storage: DeploymentInfo['storage'] = [
    { domain: 'gov', backend: 'sqlite', path: dbFile },
    { domain: 'kb', backend: 'sqlite', path: dbFile },
    { domain: 'inv', backend: 'sqlite', path: dbFile },
    { domain: 'baseline', backend: 'sqlite', path: dbFile },
    { domain: 'checklist', backend: 'sqlite', path: dbFile },
    { domain: 'reimburse', backend: 'sqlite', path: dbFile },
  ];
  const deployment: DeploymentInfo = {
    dataMode: settings.dataMode,
    identityMode,
    verticalId: settings.verticalId,
    storage,
    enabledModules: [...settings.enabledModules],
    artifactUploadEnabled: new LocalArtifactFileStorage().dir() !== null,
    buildId: resolveBuildId(),
  };

  const app = buildHubServer({
    consoleDistDir: process.env.TEAMHUB_CONSOLE_DIST_DIR,
    store: stores.gov,
    clock,
    knowledgeRepository: stores.kb,
    scheduleRepository: stores.schedule,
    inventoryRepository: stores.inv,
    artifactRepository: stores.archive,
    baselineRepository: stores.baseline,
    checklistRepository: stores.checklist,
    reimburseStore: stores.reimburse,
    inventoryStockInPort: stores.inv,
    reimburseStockInPort: stores.reimburse,
    unitOfWork,
    writeToken,
    trustProxy,
    identityMode,
    tenantConfig,
    deployment,
    larkStore,
    setupControl: { settingsService: database },
  });

  app.addHook('onClose', async () => database.close());

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
