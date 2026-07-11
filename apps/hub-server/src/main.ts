import {
  baselineScenarioFixture,
  governanceScenarioFixture,
  inventoryScenarioFixture,
  kbScenarioFixture,
} from '@teamhub/hub-contracts';
import type {
  GovernanceSnapshot,
  InventorySnapshot,
  KbSnapshot,
} from '@teamhub/hub-contracts';
import { buildHubServer } from './server.js';
import { FileGovStore } from './store/file-gov-store.js';
import { FileKbStore } from './store/file-kb-store.js';
import { FileInvStore } from './store/file-inv-store.js';
import { FileBaselineStore } from './store/file-baseline-store.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4177;

// V1-FOLLOWUP-2：空板冷启动种子。默认（TEAMHUB_DEMO_SEED 未设 / 非 'false'）落演示场景（8 任务 + 图纸版本日志 +
// 知识库语料），便于走查；真实团队设 TEAMHUB_DEMO_SEED=false → 落盘文件首启动 seed 为**空板**（仅保留赛季 /
// 项目 / 阶段元信息），不再启动进假数据。仅影响**新建**落盘文件；已有数据文件按原样加载、不受此 flag 影响。
function emptyGovSnapshot(): GovernanceSnapshot {
  return {
    seasonId: governanceScenarioFixture.seasonId,
    // S1 接线：seasons 是赛季元信息（同 seasonId/projectId/stage），空板冷启动仍保留，不算「假数据」。
    seasons: governanceScenarioFixture.seasons,
    projectId: governanceScenarioFixture.projectId,
    stage: governanceScenarioFixture.stage,
    groups: [],
    members: [],
    tasks: [],
    dependencies: [],
    needs: [],
    knowledgeNodes: [],
    taskKnowledgeTags: [],
    artifacts: [],
  };
}

function emptyKbSnapshot(): KbSnapshot {
  return {
    projectId: kbScenarioFixture.projectId,
    issueCards: [],
    errorEntries: [],
    archiveDocuments: [],
  };
}

function emptyInventorySnapshot(): InventorySnapshot {
  return {
    projectId: inventoryScenarioFixture.projectId,
    partTypes: [],
    trackedParts: [],
    actions: [],
  };
}

async function main(): Promise<void> {
  // 设了 TEAMHUB_GOV_DATA_FILE → 治理快照落盘（重启不丢，PM 录入 / 图纸提交日志 / 结案知识节点累积）；
  // 文件不存在时 seed 真实锚点场景 + 图纸版本日志（A6）。未设则维持 InMemoryGovStore（mock-first 不变）。
  // 单一真相在服务器，与 TEAMHUB_KB_DATA_FILE / FileKbStore 同一套落盘纪律。
  // 空板 flag：仅决定**新建**落盘文件的首次种子（演示场景 vs 空板）；已有文件按原样加载。
  const demoSeed = process.env.TEAMHUB_DEMO_SEED !== 'false';
  const govDataFile = process.env.TEAMHUB_GOV_DATA_FILE;
  const store = govDataFile
    ? await FileGovStore.create(
        govDataFile,
        demoSeed ? governanceScenarioFixture : emptyGovSnapshot(),
      )
    : undefined;
  if (!store) {
    // 内存模式无落盘：PM 录入 / 图纸提交日志 / 结案知识节点重启即丢。提示设 TEAMHUB_GOV_DATA_FILE 落盘。
    console.warn(
      '[teamhub-hub-server] TEAMHUB_GOV_DATA_FILE 未设：治理数据走内存（InMemoryGovStore），重启丢失。设该环境变量落盘持久化。',
    );
  }

  // 设了 TEAMHUB_KB_DATA_FILE → 知识库语料落盘（重启不丢、closeout 回灌累积）；
  // 未设则维持 InMemoryKbStore（mock-first 不变）。单一真相在服务器。
  const kbDataFile = process.env.TEAMHUB_KB_DATA_FILE;
  const kbStore = kbDataFile
    ? await FileKbStore.create(
        kbDataFile,
        demoSeed ? kbScenarioFixture : emptyKbSnapshot(),
      )
    : undefined;
  if (!kbStore) {
    // 内存模式无落盘：结案回灌的 KB 语料重启即丢。提示设 TEAMHUB_KB_DATA_FILE 落盘。
    console.warn(
      '[teamhub-hub-server] TEAMHUB_KB_DATA_FILE 未设：知识库语料走内存（InMemoryKbStore），重启丢失。设该环境变量落盘持久化。',
    );
  }

  // 设了 TEAMHUB_INV_DATA_FILE → 库存 / BOM 落盘（重启不丢，盘点 / 拆装 / 一句话快记累积）；
  // 未设则维持 InMemoryInvStore（mock-first 不变）。单一真相在服务器，与 Gov/KB 同一套落盘纪律。
  const invDataFile = process.env.TEAMHUB_INV_DATA_FILE;
  const invStore = invDataFile
    ? await FileInvStore.create(
        invDataFile,
        demoSeed ? inventoryScenarioFixture : emptyInventorySnapshot(),
      )
    : undefined;
  if (!invStore) {
    console.warn(
      '[teamhub-hub-server] TEAMHUB_INV_DATA_FILE 未设：库存数据走内存（InMemoryInvStore），重启丢失。设该环境变量落盘持久化。',
    );
  }

  // 设了 TEAMHUB_BASELINE_DATA_FILE → 倒排基准线落盘（重启不丢，队长手写覆盖 / 验证门过门留痕累积）；
  // 独立文件 baseline.json（红线3：不进 TEAMHUB_GOV_DATA_FILE/GovernanceSnapshot）。未设则维持
  // InMemoryBaselineStore（mock-first 不变）。新建落盘文件按 demoSeed 落三版车演示基准线（S6 接上，
  // 同 gov/kb/inv 一套开关）：demoSeed → baselineScenarioFixture（首屏非空）；TEAMHUB_DEMO_SEED=false
  // → 空数组（真实团队首次 PATCH /api/baseline 生成自己的模板）。已有文件按原样加载、不受此 flag 影响。
  const baselineDataFile = process.env.TEAMHUB_BASELINE_DATA_FILE;
  const baselineStore = baselineDataFile
    ? await FileBaselineStore.create(
        baselineDataFile,
        demoSeed ? baselineScenarioFixture : [],
      )
    : undefined;
  if (!baselineStore) {
    console.warn(
      '[teamhub-hub-server] TEAMHUB_BASELINE_DATA_FILE 未设：倒排基准线走内存（InMemoryBaselineStore），重启丢失。设该环境变量落盘持久化。',
    );
  }

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

  // 反代信任：单端口 4177 反代 / 隧道部署后面须设 TEAMHUB_TRUST_PROXY=true，否则写限流塌成全队单桶（见 server.ts）。
  const trustProxy = process.env.TEAMHUB_TRUST_PROXY === 'true';

  const app = buildHubServer({
    consoleDistDir: process.env.TEAMHUB_CONSOLE_DIST_DIR,
    store,
    kbStore,
    invStore,
    baselineStore,
    writeToken,
    trustProxy,
  });

  await app.listen({ host, port });
  app.log.info(`teamhub hub-server listening on http://${host}:${port}`);
}

main().catch((error) => {
  console.error(`[teamhub-hub-server] ${(error as Error).message}`);
  process.exit(1);
});
