import { buildHubServer } from './server.js';
import { FileKbStore } from './store/file-kb-store.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4177;

async function main(): Promise<void> {
  // 设了 TEAMHUB_KB_DATA_FILE → 知识库语料落盘（重启不丢、closeout 回灌累积）；
  // 未设则维持 InMemoryKbStore（mock-first 不变）。单一真相在服务器。
  const kbDataFile = process.env.TEAMHUB_KB_DATA_FILE;
  const kbStore = kbDataFile
    ? await FileKbStore.create(kbDataFile)
    : undefined;

  const app = buildHubServer({
    consoleDistDir: process.env.TEAMHUB_CONSOLE_DIST_DIR,
    kbStore,
  });
  const host = process.env.HUB_HOST ?? DEFAULT_HOST;
  const port = Number.parseInt(process.env.HUB_PORT ?? String(DEFAULT_PORT), 10);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('invalid HUB_PORT');
  }

  await app.listen({ host, port });
  app.log.info(`teamhub hub-server listening on http://${host}:${port}`);
}

main().catch((error) => {
  console.error(`[teamhub-hub-server] ${(error as Error).message}`);
  process.exit(1);
});
