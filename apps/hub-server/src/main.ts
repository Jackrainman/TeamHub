import { buildHubServer } from './server.js';
import { FileGovStore } from './store/file-gov-store.js';
import { FileKbStore } from './store/file-kb-store.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4177;

async function main(): Promise<void> {
  // 设了 TEAMHUB_GOV_DATA_FILE → 治理快照落盘（重启不丢，PM 录入 / 图纸提交日志 / 结案知识节点累积）；
  // 文件不存在时 seed 真实锚点场景 + 图纸版本日志（A6）。未设则维持 InMemoryGovStore（mock-first 不变）。
  // 单一真相在服务器，与 TEAMHUB_KB_DATA_FILE / FileKbStore 同一套落盘纪律。
  const govDataFile = process.env.TEAMHUB_GOV_DATA_FILE;
  const store = govDataFile
    ? await FileGovStore.create(govDataFile)
    : undefined;

  // 设了 TEAMHUB_KB_DATA_FILE → 知识库语料落盘（重启不丢、closeout 回灌累积）；
  // 未设则维持 InMemoryKbStore（mock-first 不变）。单一真相在服务器。
  const kbDataFile = process.env.TEAMHUB_KB_DATA_FILE;
  const kbStore = kbDataFile
    ? await FileKbStore.create(kbDataFile)
    : undefined;

  const host = process.env.HUB_HOST ?? DEFAULT_HOST;
  const port = Number.parseInt(process.env.HUB_PORT ?? String(DEFAULT_PORT), 10);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('invalid HUB_PORT');
  }

  // H3（AUDIT-FIXES 部署前必修）：非 loopback 暴露写端点必须配 TEAMHUB_WRITE_TOKEN，否则拒绝启动——
  // 避免裸暴露未鉴权的 POST /api/*（任意可达者污染治理数据 / 撑爆 KB / 回环 actor 身份）。
  // 默认 127.0.0.1 / ::1 / localhost 放行（本机 dev）。
  const writeToken = process.env.TEAMHUB_WRITE_TOKEN;
  const isLoopback =
    host === '127.0.0.1' || host === '::1' || host === 'localhost';
  if (!isLoopback && !writeToken) {
    throw new Error(
      `refusing to bind non-loopback host ${host} without TEAMHUB_WRITE_TOKEN (write endpoints would be unauthenticated)`,
    );
  }

  const app = buildHubServer({
    consoleDistDir: process.env.TEAMHUB_CONSOLE_DIST_DIR,
    store,
    kbStore,
    writeToken,
  });

  await app.listen({ host, port });
  app.log.info(`teamhub hub-server listening on http://${host}:${port}`);
}

main().catch((error) => {
  console.error(`[teamhub-hub-server] ${(error as Error).message}`);
  process.exit(1);
});
