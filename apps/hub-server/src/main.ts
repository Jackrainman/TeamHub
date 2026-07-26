import {
  baselineScenarioFixture,
  checklistScenarioFixture,
  governanceScenarioFixture,
  inventoryScenarioFixture,
  kbScenarioFixture,
} from '@teamhub/hub-contracts';
import { ROBOTICS_TENANT_CONFIG } from '@teamhub/hub-contracts';
import type {
  DeploymentInfo,
  GovernanceSnapshot,
  InventorySnapshot,
  KbSnapshot,
} from '@teamhub/hub-contracts';
import { buildHubServer } from './server.js';
import { RealClock } from './clock.js';
import type { Clock } from './clock.js';
import {
  FileGovStore,
  deriveResourcesFilePath,
  deriveScheduleSessionsFilePath,
} from './store/file-gov-store.js';
import { SqliteGovStore } from './store/sqlite-gov-store.js';
import { openUnifiedDb, defaultSeeds } from './store/sqlite-unified.js';
import { FileKbStore } from './store/file-kb-store.js';
import { FileInvStore } from './store/file-inv-store.js';
import { FileBaselineStore } from './store/file-baseline-store.js';
import { FileChecklistStore } from './store/file-checklist-store.js';
import type { GovStore, KbStore, InvStore } from './store/gov-store.js';
import type { BaselineStore } from './store/baseline-store.js';
import type { ChecklistStore } from './store/checklist-store.js';
import { getArtifactDir } from './artifact-storage.js';
import { resolveBuildId } from './status.js';
import { parseTenantConfigEnv } from './tenant-config-env.js';
import { readDeployConfigFile } from './deploy-config-file.js';
import { buildSetupServer } from './build-setup-server.js';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4177;

// V1-FOLLOWUP-2 + K6（时钟与空板刀）+ SETUP-WIZARD 刀①：config.dataMode 派生「演示态 vs 真实态」两套地基——
// **dataMode='real' 同时启用真实时钟与真空板**（旧演示态开关 false 的等价，模式类 env 已退役、来源改 config）。
// dataMode='demo' = 演示态：冻结时钟 FixedClock(GOVERNANCE_SCENARIO_NOW) + 演示锚点（8 任务 + 图纸版本日志 +
// 知识库语料 + 演示车/排班），便于走查；dataMode='real' = 真实态：RealClock（真实部署新建任务 createdAt 走真钟，
// 不再恒 6/11、挂单池 stalenessDays 不再第一秒 >14 天全标红）+ 落盘文件首启动 seed 为**空板**（仅保留赛季 /
// 项目 / 阶段元信息，schedule 三块空、不再见虚构车 + 演示排班）。仅影响**新建**落盘文件与内存态；已有数据文件
// 按原样加载、不受此影响。
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

  // SS3 SQLite 增量迁移（product-redefine-2026-07 §4.4 / §9-③）：**默认仍 JSON、现状零变化**。
  // 仅当 TEAMHUB_GOV_BACKEND=sqlite 时切 SqliteGovStore（须同时设 TEAMHUB_GOV_SQLITE_FILE=库文件路径）——
  // 本地 SQLite 文件与 gov.json 同性质落盘（D-083 刀④拍板不属「真实服务器写入」）。库不存在则按 demoSeed
  // 落种子（同 FileGovStore 首启动纪律）；已迁移/既有库按原样打开（fail-closed：schema 版本过高即拒开）。
  // 运维 env、与模式无关：既用于正常模式建店，也用于 setup 模式 dataDirHasData 探测（gov 域走 sqlite 时探测库文件）。
  const govBackend =
    process.env.TEAMHUB_GOV_BACKEND === 'sqlite' ? 'sqlite' : 'json';

  // ── setup 模式（config.json 不存在）：最小 server 托管向导，不建任何 store、不落任何种子 ────────────
  if (!config) {
    // dataDirHasData 候选（五域落盘文件路径，任一存在 → 升级迁移提示）。gov 域按 backend 选文件。
    const dataFileCandidates = [
      govBackend === 'sqlite'
        ? process.env.TEAMHUB_GOV_SQLITE_FILE
        : process.env.TEAMHUB_GOV_DATA_FILE,
      process.env.TEAMHUB_KB_DATA_FILE,
      process.env.TEAMHUB_INV_DATA_FILE,
      process.env.TEAMHUB_BASELINE_DATA_FILE,
      process.env.TEAMHUB_CHECKLIST_DATA_FILE,
    ].filter((p): p is string => Boolean(p));
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

  // ── 统一 SQLite 后端（TEAMHUB_BACKEND=sqlite）：五域共库，一个 TEAMHUB_DB_FILE 取代六条路径 ──────
  const unifiedBackend = process.env.TEAMHUB_BACKEND === 'sqlite';
  let store: GovStore | undefined;
  let kbStore: KbStore | undefined;
  let invStore: InvStore | undefined;
  let baselineStore: BaselineStore | undefined;
  let checklistStore: ChecklistStore | undefined;
  let unifiedClose: (() => void) | undefined;

  if (unifiedBackend) {
    const dbFile = process.env.TEAMHUB_DB_FILE;
    if (!dbFile) {
      throw new Error('TEAMHUB_BACKEND=sqlite 需同时设 TEAMHUB_DB_FILE（统一 SQLite 库文件路径）');
    }
    const seeds = defaultSeeds(demoSeed);
    const unified = openUnifiedDb(dbFile, { seeds, clock });
    store = unified.gov;
    kbStore = unified.kb;
    invStore = unified.inv;
    baselineStore = unified.baseline;
    checklistStore = unified.checklist;
    unifiedClose = unified.close;
    await store.ensureDefaultGroups();
  } else {
  // ── 旧路径：逐域 env 选 JSON / InMemory ──────────────────────────────────────────────────────
  const govSeed = demoSeed ? governanceScenarioFixture : emptyGovSnapshot();
  if (govBackend === 'sqlite') {
    const sqliteFile = process.env.TEAMHUB_GOV_SQLITE_FILE;
    if (!sqliteFile) {
      throw new Error(
        'TEAMHUB_GOV_BACKEND=sqlite 需同时设 TEAMHUB_GOV_SQLITE_FILE（SQLite 库文件路径）',
      );
    }
    store = await SqliteGovStore.create(sqliteFile, govSeed, clock, demoSeed);
  } else {
    const govDataFile = process.env.TEAMHUB_GOV_DATA_FILE;
    store = govDataFile
      ? await FileGovStore.create(govDataFile, govSeed, clock, demoSeed)
      : undefined;
    if (!store) {
      // 内存模式无落盘：PM 录入 / 图纸提交日志 / 结案知识节点重启即丢。提示设 TEAMHUB_GOV_DATA_FILE 落盘。
      console.warn(
        '[teamhub-hub-server] TEAMHUB_GOV_DATA_FILE 未设：治理数据走内存（InMemoryGovStore），重启丢失。设该环境变量落盘持久化（或 TEAMHUB_GOV_BACKEND=sqlite + TEAMHUB_GOV_SQLITE_FILE 走 SQLite）。',
      );
    }
  }

  // 空板默认组树（打磨轮刀⑤，onboarding-init-wizard-2026-07-25 §4）：real 真空板启动时预建默认四组树
  // （程序母组挂电控/视觉 + 顶层机械/电路，不含 grp-convergence 哨兵组）；groups 非空（demo seed /
  // 既有数据）天然 no-op。内存路径（store=undefined → server.ts 默认 InMemoryGovStore）由
  // buildHubServer 内同源调用兜底。
  if (store) await store.ensureDefaultGroups();

  // 设了 TEAMHUB_KB_DATA_FILE → 知识库语料落盘（重启不丢、closeout 回灌累积）；
  // 未设则维持 InMemoryKbStore（mock-first 不变）。单一真相在服务器。
  const kbDataFile = process.env.TEAMHUB_KB_DATA_FILE;
  kbStore = kbDataFile
    ? await FileKbStore.create(
        kbDataFile,
        demoSeed ? kbScenarioFixture : emptyKbSnapshot(),
      )
    : undefined;
  if (!kbStore) {
    console.warn(
      '[teamhub-hub-server] TEAMHUB_KB_DATA_FILE 未设：知识库语料走内存（InMemoryKbStore），重启丢失。设该环境变量落盘持久化。',
    );
  }

  const invDataFile = process.env.TEAMHUB_INV_DATA_FILE;
  invStore = invDataFile
    ? await FileInvStore.create(
        invDataFile,
        demoSeed ? inventoryScenarioFixture : emptyInventorySnapshot(),
        clock,
      )
    : undefined;
  if (!invStore) {
    console.warn(
      '[teamhub-hub-server] TEAMHUB_INV_DATA_FILE 未设：库存数据走内存（InMemoryInvStore），重启丢失。设该环境变量落盘持久化。',
    );
  }

  const baselineDataFile = process.env.TEAMHUB_BASELINE_DATA_FILE;
  baselineStore = baselineDataFile
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

  const checklistDataFile = process.env.TEAMHUB_CHECKLIST_DATA_FILE;
  checklistStore = checklistDataFile
    ? await FileChecklistStore.create(
        checklistDataFile,
        demoSeed ? checklistScenarioFixture : [],
      )
    : undefined;
  if (!checklistStore) {
    console.warn(
      '[teamhub-hub-server] TEAMHUB_CHECKLIST_DATA_FILE 未设：门检查单 / 欠条走内存（InMemoryChecklistStore），重启丢失。设该环境变量落盘持久化。',
    );
  }
  } // end else (non-unified backend)

  // IDENTITY-LITE（D-083 §4.2）：轻身份登录双模式，来源 = config.identityMode（SETUP-WIZARD 刀①，模式类
  // env 已退役）。'anonymous' = 匿名模式（身份模块不启用、session 端点禁用、写路由信客户端自报 actor、写门
  // 只认 TEAMHUB_WRITE_TOKEN）；'identity' = 身份模式（匿名可读一切 + 登录才能写，写路由须携有效会话、actor
  // 服务端注入）。
  const identityMode = config.identityMode;

  // H3（AUDIT-FIXES 部署前必修）：非 loopback 暴露写端点必须配 TEAMHUB_WRITE_TOKEN，否则拒绝启动——
  // 避免裸暴露未鉴权的 POST /api/*（任意可达者污染治理数据 / 撑爆 KB / 回环 actor 身份）。
  // 默认 127.0.0.1 / ::1 / localhost 放行（本机 dev）。**身份模式例外**：写路由已由会话（登录）把关，
  // 故非 loopback + identity 模式即便无 TEAMHUB_WRITE_TOKEN 也放行（大一大二 LAN 打开即看的预期形态）。
  const writeToken = process.env.TEAMHUB_WRITE_TOKEN;
  const isLoopback =
    host === '127.0.0.1' || host === '::1' || host === 'localhost';
  if (!isLoopback && !writeToken && identityMode !== 'identity') {
    throw new Error(
      `refusing to bind non-loopback host ${host} without TEAMHUB_WRITE_TOKEN (write endpoints would be unauthenticated)`,
    );
  }

  // 反代信任：单端口 4177 反代 / 隧道部署后面须设 TEAMHUB_TRUST_PROXY=true，否则写限流塌成全队单桶（见 server.ts）。
  const trustProxy = process.env.TEAMHUB_TRUST_PROXY === 'true';

  // 装配层接线（AUDIT-DEBT-2026-07 §9-④ 审计债④）：TenantConfig 通道此前从未接到真实启动路径，
  // `buildHubServer` 恒吃内部缺省 ROBOTICS_TENANT_CONFIG（全 6 模块开）。`TEAMHUB_TENANT_MODULES`
  // 未设 → parseTenantConfigEnv 返回 undefined → 行为与今天逐字一致；设了才真正收窄模块
  // （见 tenant-config-env.ts 头部注释 + tenant-config-route.test.ts 验证过的"关模块"真实行为）。
  const tenantConfig = parseTenantConfigEnv(process.env.TEAMHUB_TENANT_MODULES);

  // ── 部署信息（K3 部署信息刀）─────────────────────────────────────────────────────────────────
  // 把上面各域 store 装配时已知的「走哪种 backend + 落盘路径」收集成运维定位事实，经 options 透传，
  // 由 GET /api/system/status 回显。**只报后端类型与路径**（与真实落盘同源读同一批 env，故不会漂移），
  // **绝不含密钥**（writeToken 等一律不进 deployment）。每条 storage 直接读上面已创建的 store 变量派生：
  // store 存在 = 该域落盘（file/sqlite），undefined = 内存。
  const storage: DeploymentInfo['storage'] = unifiedBackend
    ? [
        { domain: 'gov', backend: 'sqlite', path: process.env.TEAMHUB_DB_FILE },
        { domain: 'kb', backend: 'sqlite', path: process.env.TEAMHUB_DB_FILE },
        { domain: 'inv', backend: 'sqlite', path: process.env.TEAMHUB_DB_FILE },
        { domain: 'baseline', backend: 'sqlite', path: process.env.TEAMHUB_DB_FILE },
        { domain: 'checklist', backend: 'sqlite', path: process.env.TEAMHUB_DB_FILE },
      ]
    : [
        govBackend === 'sqlite'
          ? { domain: 'gov', backend: 'sqlite', path: process.env.TEAMHUB_GOV_SQLITE_FILE }
          : store
            ? { domain: 'gov', backend: 'file', path: process.env.TEAMHUB_GOV_DATA_FILE }
            : { domain: 'gov', backend: 'memory' },
        kbStore
          ? { domain: 'kb', backend: 'file', path: process.env.TEAMHUB_KB_DATA_FILE }
          : { domain: 'kb', backend: 'memory' },
        invStore
          ? { domain: 'inv', backend: 'file', path: process.env.TEAMHUB_INV_DATA_FILE }
          : { domain: 'inv', backend: 'memory' },
        baselineStore
          ? { domain: 'baseline', backend: 'file', path: process.env.TEAMHUB_BASELINE_DATA_FILE }
          : { domain: 'baseline', backend: 'memory' },
        checklistStore
          ? { domain: 'checklist', backend: 'file', path: process.env.TEAMHUB_CHECKLIST_DATA_FILE }
          : { domain: 'checklist', backend: 'memory' },
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

  // SETUP-WIZARD 刀③：部署配置写通道依赖。改 identityMode / 转正式后重写 config.json（唯一真相）；
  // 转正式归档的落盘文件 = 五域各自的落盘路径（gov 按 backend 选文件），存在的才归档、不存在跳过（某域走
  // 内存 / 未配落盘时天然缺席）。**gov 域 JSON 后端另有两份 sibling**（resources.json / schedule-sessions.json，
  // R3 车 + 排班占用/接力，与 gov.json 同目录）——不一并挪走，demo 车 / 排班在真空板重启后还在，故用 store 的
  // 派生函数同源补上（sqlite 后端整库一个文件、无 sibling）。
  const govDataFileForArchive = unifiedBackend
    ? process.env.TEAMHUB_DB_FILE
    : govBackend === 'sqlite'
      ? process.env.TEAMHUB_GOV_SQLITE_FILE
      : process.env.TEAMHUB_GOV_DATA_FILE;
  const govSiblingFiles =
    !unifiedBackend && govBackend === 'json' && govDataFileForArchive
      ? [
          deriveResourcesFilePath(govDataFileForArchive),
          deriveScheduleSessionsFilePath(govDataFileForArchive),
        ]
      : [];
  const setupDataFiles = [
    govDataFileForArchive,
    ...govSiblingFiles,
    process.env.TEAMHUB_KB_DATA_FILE,
    process.env.TEAMHUB_INV_DATA_FILE,
    process.env.TEAMHUB_BASELINE_DATA_FILE,
    process.env.TEAMHUB_CHECKLIST_DATA_FILE,
  ].filter((p): p is string => Boolean(p));

  const app = buildHubServer({
    consoleDistDir: process.env.TEAMHUB_CONSOLE_DIST_DIR,
    store,
    // K6：真实态注入 RealClock（覆盖路由层 claim/assign/baseline/artifact/schedule now + 无落盘 env 时的
    // 默认内存 store 的 createTask）；演示态传 undefined → server.ts 回退 FixedClock，现状零变化。
    clock,
    kbStore,
    invStore,
    baselineStore,
    checklistStore,
    writeToken,
    trustProxy,
    identityMode,
    tenantConfig,
    deployment,
    setupControl: {
      configFile,
      config,
      dataFiles: setupDataFiles,
      artifactDir: getArtifactDir() ?? undefined,
    },
  });

  await app.listen({ host, port });
  app.log.info(`teamhub hub-server listening on http://${host}:${port}`);
}

main().catch((error) => {
  console.error(`[teamhub-hub-server] ${(error as Error).message}`);
  process.exit(1);
});
