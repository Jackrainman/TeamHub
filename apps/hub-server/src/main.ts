import { buildSetupServer } from './build-setup-server.js';
import { RealClock } from './clock.js';
import { buildHubServer } from './server.js';
import { openV1Database } from './store/v1-database.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4177;
async function main(): Promise<void> {
  const host = process.env.HUB_HOST ?? DEFAULT_HOST;
  const port = Number.parseInt(process.env.HUB_PORT ?? String(DEFAULT_PORT), 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error('invalid HUB_PORT');
  const dbFile = process.env.TEAMHUB_DB_FILE;
  if (!dbFile) throw new Error('必须设置 TEAMHUB_DB_FILE（v1 SQLite 库文件路径）');
  const database = openV1Database(dbFile);
  if (database.getDatabaseState() !== 'initialized') {
    const setupApp = buildSetupServer({
      database, consoleDistDir: process.env.TEAMHUB_CONSOLE_DIST_DIR,
    });
    setupApp.addHook('onClose', async () => database.close());
    await setupApp.listen({ host, port });
    console.log(`[teamhub-hub-server] setup 模式：打开 http://${host}:${port} 完成初始化`);
    return;
  }
  const app = buildHubServer({
    database, consoleDistDir: process.env.TEAMHUB_CONSOLE_DIST_DIR,
    clock: new RealClock(), writeToken: process.env.TEAMHUB_WRITE_TOKEN,
    trustProxy: process.env.TEAMHUB_TRUST_PROXY === 'true',
    cookieSecure: process.env.TEAMHUB_COOKIE_SECURE === 'true',
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
