import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import {
  GOVERNANCE_SCENARIO_NOW,
} from '@teamhub/hub-contracts';
import type {
  ModuleId,
  TenantConfig,
  IdentityMode,
  SessionIdentity,
  DeploymentInfo,
} from '@teamhub/hub-contracts';
import { isModuleEnabled } from '@teamhub/hub-contracts';
import { SessionManager } from './identity/session-store.js';
import { FixedClock } from './clock.js';
import type { Clock } from './clock.js';
import type { ReimburseRepository } from './modules/reimburse/repository.js';
import type { PmRepository } from './modules/pm/repository.js';
import { BaselineService } from './modules/baseline/service.js';
import type { BaselineRepository } from './modules/baseline/repository.js';
import { ChecklistService } from './modules/checklist/service.js';
import type {
  ChecklistRepository,
} from './modules/checklist/repository.js';
import { isGateReviewer, isSuperAdmin } from './authz.js';
import { tryServeStaticConsole } from './static-console.js';
import { registerSearchRoutes } from './routes/search.js';
import { registerExportRoutes } from './routes/export.js';
import { registerGovReportRoutes } from './routes/gov-report.js';
import {
  KnowledgeService,
  registerKnowledgeRoutes,
} from './modules/knowledge/index.js';
import type { KnowledgeRepository } from './modules/knowledge/index.js';
import { registerInventoryRoutes, InventoryService } from './modules/inventory/index.js';
import type { InventoryReadPort, InventoryRepository } from './modules/inventory/index.js';
import { registerReimburseRoutes, ReimburseService } from './modules/reimburse/index.js';
import {
  ScheduleService,
  registerScheduleRoutes,
} from './modules/schedule/index.js';
import type { ScheduleRepository } from './modules/schedule/index.js';
import {
  ArchiveService,
  LocalArtifactFileStorage,
  registerArchiveRoutes,
} from './modules/archive/index.js';
import type { ArtifactRepository } from './modules/archive/index.js';
import { registerSystemRoutes } from './routes/system.js';
import { registerPmCoreRoutes } from './routes/pm.js';
import { registerSessionRoutes } from './routes/session.js';
import { registerSetupRoutes } from './routes/setup.js';
import { registerLarkRoutes } from './routes/lark.js';
import {
  SESSION_TTL_MS,
  readSessionCookie,
  requireSuperAdmin,
} from './routes/helpers.js';
import { registerWriteGate } from './middleware/write-gate.js';
import type { AppSettingsService } from './store/sqlite-unified.js';
import type {
  InventoryStockInPort,
  ReimburseStockInPort,
} from './modules/reimburse/service.js';
import type { ApplicationUnitOfWork } from './application/unit-of-work.js';

/**
 * 部署配置写通道运行时依赖（SETUP-WIZARD 刀③，setup-wizard.md §6）：设置页「部署配置」写区背后的
 * `PUT /api/setup/config`（改 identityMode）+ `POST /api/setup/graduate`（转正式）两端点所需。
 * **仅正常模式**（buildHubServer）注册这两端点——setup 模式那条链是 build-setup-server.ts，不进本函数，
 * 故两端点在 setup 模式天然 404。缺省 undefined → 两端点不注册（测试 / 无 config 上下文 → 404），
 * 由 main.ts 在正常模式装配时透传实参。**绝不含密钥**（同 deployment 纪律）。
 */
export interface SetupControl {
  /** app_settings 单例和同库初始化/改配置/转正式事务的唯一服务。 */
  settingsService: AppSettingsService;
  /** 时钟（默认真钟）：注入以便测试断言 updatedAt 确定。 */
  now?: () => Date;
  /** 退出函数（默认 process.exit）：注入以便测试断言退出码而不真杀进程。 */
  exit?: (code: number) => void;
  /** 受理后延迟退出的毫秒数（默认 500ms，给回执落地时间）；测试可调 0 免等待。 */
  restartDelayMs?: number;
}

export interface BuildHubServerOptions {
  consoleDistDir?: string;
  /** 治理读写出入口；生产与测试组合根都必须显式装配。 */
  store: PmRepository;
  /**
   * 派生快照求值时刻。mock-first 阶段默认钉在 fixture 场景时间 GOVERNANCE_SCENARIO_NOW，
   * 让 real 模式 /api/dep-graph 与 hub-console mock 同口径；真实数据接入后注入 RealClock。
   */
  clock?: Clock;
  /**
   * 知识库域 repository（ARCH-UNIFY A4；原 KbStore 收窄点）：相似检索语料
   * （IssueCard/ErrorEntry/ArchiveDocument）不在 GovernanceSnapshot 内，故独立 port。
   * 结案派生 KnowledgeNode 那半经窄口 KnowledgeNodeCloseoutPort 适配 `store.closeoutKbNode`。
   */
  knowledgeRepository: KnowledgeRepository;
  /**
   * 排班域 repository（ARCH-UNIFY A4；原 ScheduleStore 交叉进 PmRepository，已摘出）：
   * 共享资源车 + 占用窗口 + 接力交接线（不在 GovernanceSnapshot 内）。
   * 派生所需治理快照经窄口 PmSnapshotReadPort 由 `store` 适配注入。
   */
  scheduleRepository: ScheduleRepository;
  /**
   * 库存 / BOM repository（ARCH-UNIFY A4 库存域；原 InvStore 扩展点，D-042 决策 4）。
   * INV 是唯一需扩 schema 的支柱（InventorySnapshot 不在 GovernanceSnapshot 内），故走独立
   * `InventoryRepository` port 而非复用 PmRepository；由组合根注入（生产=SqliteInventoryRepository）。
   */
  inventoryRepository: InventoryRepository;
  /**
   * 倒排基准线读写出入口（BASELINE-CORE，S3 落地/S4 挂路由）。独立于 `PmRepository`（`SeasonBaseline`
   * 不进 `GovernanceSnapshot`），故走独立 `BaselineRepository` 而非扩 PmRepository。
   * 由 `GET/PATCH /api/baseline` + `POST /api/baseline/milestones/:milestoneId/pass` 消费
   * （registerPmCoreRoutes，与 seasonId 同域）。
   */
  baselineRepository: BaselineRepository;
  /**
   * 门检查单 / 欠条读写出入口（GATE-CHECKLIST-IOU，D-087；本刀 C2 落地、C3 挂路由）。独立于 `PmRepository`
   * （`GateChecklistItem` 不进 `GovernanceSnapshot`），故走独立 `ChecklistRepository`。
   * 由组合根显式注入；C3 由 `GET/POST /api/checklist` +
   * `POST /api/checklist/:id/{clear,waive}` + `GET /api/checklist/templates` 消费。
   */
  checklistRepository: ChecklistRepository;
  /**
   * H3（AUDIT-FIXES 部署前必修）：写端点共享密钥。配了则所有 `POST /api/*` 须带 `Authorization: Bearer <token>`；
   * 未配则放行（loopback dev 默认）。非 loopback 暴露**必须**配（main.ts 拒绝裸暴露）。
   */
  writeToken?: string;
  /** H3：写端点每 IP 固定窗口限流（默认 120 次 / 60s）。测试可调小触发 429。 */
  writeRateLimit?: { max: number; windowMs: number };
  /**
   * 反代信任。默认 false（request.ip = 直连源）。在文档化的单端口 4177 反代 / SSH 隧道部署后面，
   * 不开则所有客户端的 request.ip 都塌成代理 / loopback，限流退化成**全队共用一个桶**（任一客户端可耗尽、
   * DoS 全队写入）。运维在可信代理后应设为 `true`（或代理地址 / 跳数），令 request.ip 解析为转发来的真实
   * 客户端 IP，限流按客户端分桶。直连暴露时保持 false（否则 X-Forwarded-For 可伪造）。透传给 Fastify。
   */
  trustProxy?: boolean | string;
  /** 归档物上传单文件字节上限（默认 50MB）。测试可调小以触发 413、免造大文件。 */
  artifactMaxBytes?: number;
  /** SQLite app_settings 中的模块开关；生产与测试组合根都必须显式注入，禁止代码默认成为第二事实源。 */
  tenantConfig: TenantConfig;
  /**
   * 轻身份登录模式（IDENTITY-LITE，D-083 §4.2）。必须由 app_settings 对应的组合根显式注入：
   * 身份模块不启用、session 端点禁用（POST/DELETE → 404）、写路由信客户端自报 actor、写门只认 TEAMHUB_WRITE_TOKEN。
   * `'identity'` = 匿名可读一切 + 登录才能写：session 端点启用、写路由须携有效会话（否则 401）+ actor 服务端注入。
   */
  identityMode: IdentityMode;
  /**
   * 部署信息（K3 部署信息刀）。main.ts 启动时收集「每域走哪种 store + 路径 / 启用模块 / 图纸开关 /
   * 构建标识 / 身份模式」这批运维定位事实，经此透传，由 `GET /api/system/status` 原样回显——设置页
   * 「部署信息」分区据此判断真实落盘 vs 内存态。**敏感值绝不进来**（WRITE_TOKEN 等）。缺省 undefined
   * （测试 / 内存 dev）→ status 不带 deployment 字段，旧客户端零影响。
   */
  deployment?: DeploymentInfo;
  /**
   * 部署配置写通道（SETUP-WIZARD 刀③）。给了才注册 `PUT /api/setup/config` + `POST /api/setup/graduate`
   * （否则两端点 404）。main.ts 在正常模式装配时透传统一 SQLite settings service。
   */
  setupControl?: SetupControl;
  /** 飞书集成配置持久化（LARK-INTEG-CONFIG）。给了才注册 /api/integrations/lark + /api/hermes/credential。 */
  larkStore?: import('./store/lark-integration-store.js').LarkIntegrationStore;
  /**
   * 报账域读写出入口（REIMBURSE-PROC 一期）。独立于 `PmRepository`（ReimburseEntry/ReimburseBatch 不进
   * GovernanceSnapshot，同 InvStore 先例）。由 `/api/reimburse/*` 消费
   * （registerReimburseRoutes，挂 ledger 模块下）。
   */
  reimburseStore: ReimburseRepository;
  /**
   * 归档物域 repository（ARCH-UNIFY A4；原 PmRepository.ArtifactStore + snapshot.artifacts 读路径）。
   * 由 `/api/artifacts*` 消费（registerArchiveRoutes）+ baseline 证据引用存在性校验（窄口读）。
   */
  artifactRepository: ArtifactRepository;
  /** 跨 repository 写的唯一事务边界；生产必须是 SQLite UoW。 */
  unitOfWork: ApplicationUnitOfWork;
  /** 报账只依赖库存域的窄同步入库 port，不拿完整 repository 做跨域编排。 */
  inventoryStockInPort: InventoryStockInPort;
  /** 报账条目同步读取窄 port，与库存写共享同一 UoW。 */
  reimburseStockInPort: ReimburseStockInPort;
}

// 归档物文件上传上限（50MB）：覆盖机械 CAD（step/stp/sldprt）+ 电路 PDF + 固件，又约束资源耗尽面。
const ARTIFACT_MAX_BYTES = 50 * 1024 * 1024;

// ── 轻身份登录（IDENTITY-LITE，D-083 §4.2）宿主级横切基元 ─────────────────────────────────────
// FastifyRequest.identity：由身份模式下的 onRequest 钩子从 cookie 解析注入（匿名模式恒 null）。
// 写路由据此把客户端自报的 confirmedBy/passedBy 覆盖为 session 身份（服务端注入 actor，替代零校验自报）。
declare module 'fastify' {
  interface FastifyRequest {
    identity: SessionIdentity | null;
  }
}

/**
 * 模块路由注册共享上下文（对应 `ModuleDescriptor.registerRoutes(app, ctx)` 的 Ctx 型参，
 * 在 hub-server 侧收紧为具体 store/clock 依赖）。装配外壳（buildHubServer）按 `TenantConfig.enabledModules`
 * 遍历调用下方各 `registerXxxRoutes`，未启用模块的函数根本不被调用——端点整段不挂，非"挂了但鉴权拒绝"。
 */
interface ModuleRouteCtx {
  store: PmRepository;
  clock: Clock;
  inventoryRead: InventoryReadPort;
  // BASELINE-CORE：S4 起由 registerPmCoreRoutes 的 GET/PATCH /api/baseline + 过门路由消费。
  baselineService: BaselineService;
  // GATE-CHECKLIST-IOU：C3 起由 registerPmCoreRoutes 的 /api/checklist 系列 + 过门硬闸消费（本刀先钉字段）。
  checklistService: ChecklistService;
  artifactMaxBytes: number;
  // IDENTITY-LITE：部署身份模式。pm-core 的 PUT /api/members/:id/pin 据此在匿名模式 404、身份模式行使
  // 「本人会话 / 首次设置」授权。写路由的 actor 注入不看它、只看 request.identity（匿名模式恒 null）。
  identityMode: IdentityMode;
  // PIN-DEADLOCK-RECOVERY：反代信任设置（= BuildHubServerOptions.trustProxy 缺省 false），
  // 供 isLoopbackOperator 决定信裸 socket 还是 request.ip（见该函数注释）。
  trustProxy: boolean | string;
  // SETUP-WIZARD-ROSTER 刀②：内存会话表（匿名模式 null）——POST /api/setup/super-admin 的 bootstrap
  // 路径一笔落库后签发会话 cookie（建人+授旗+设 PIN+登录态），免操作者再登一次。
  sessions: SessionManager | null;
  larkStore?: import('./store/lark-integration-store.js').LarkIntegrationStore;
}
export function buildHubServer(options: BuildHubServerOptions): FastifyInstance {
  // 反代信任（默认 false）：开启后 request.ip 解析为转发的真实客户端 IP，限流才按客户端分桶
  // （见 BuildHubServerOptions.trustProxy；4177 反代部署须开，否则限流塌成全局单桶）。同时供
  // isLoopbackOperator（PIN-DEADLOCK-RECOVERY）决定信裸 socket 还是 request.ip。
  const trustProxy = options.trustProxy ?? false;
  // H3（AUDIT-FIXES）：显式 bodyLimit 收口写端点请求体上限（默认 Fastify 1MB 仍偏大，配合 KB 整文件重写是
  // 低成本资源耗尽面，见 M17）；256KB 足够任务 / 结案录入。
  const app = Fastify({
    logger: false,
    bodyLimit: 256 * 1024,
    trustProxy,
  });

  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 503;
    void reply.code(status).send({ detail: error.message || 'internal error' });
  });

  // 派生 / 时间戳求值时刻。缺省钉在
  // fixture 场景时间 GOVERNANCE_SCENARIO_NOW（演示态冻结钟，与 hub-console mock 同口径）。
  const clock: Clock =
    options.clock ?? new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW));
  const store = options.store;
  // 组合根通常已 ensure；这里保留幂等兜底，确保所有显式注入实现具备默认组树。
  void store.ensureDefaultGroups();
  const knowledgeRepository = options.knowledgeRepository;
  const knowledgeService = new KnowledgeService(knowledgeRepository, store, clock);
  const inventoryRepository = options.inventoryRepository;
  const scheduleRepository = options.scheduleRepository;
  const scheduleService = new ScheduleService(scheduleRepository, store, clock);
  const inventoryService = new InventoryService(inventoryRepository, {
    listResources: () => scheduleRepository.listResources(),
  });
  const baselineRepository = options.baselineRepository;
  const checklistRepository = options.checklistRepository;
  const checklistService = new ChecklistService(
    checklistRepository,
    baselineRepository,
    // GateReviewerPort 窄口：pm 成员表适配（checklist 不反向感知成员实体）。
    { isGateReviewer: async (memberId) => isGateReviewer((await store.getSnapshot()).members, memberId) },
    clock,
  );
  const baselineService = new BaselineService(
    baselineRepository,
    checklistService,
    {
      findMissingArtifactId: async (ids) => {
        const known = new Set((await options.artifactRepository.listArtifacts()).map((artifact) => artifact.id));
        return ids.find((id) => !known.has(id));
      },
    },
  );
  const reimburseStore = options.reimburseStore;
  const reimburseService = new ReimburseService(
    reimburseStore,
    // ReimburseAdminPort 窄口：pm 成员表适配（reimburse 不反向感知成员实体）。
    { isSuperAdmin: async (memberId) => isSuperAdmin((await store.getSnapshot()).members, memberId) },
    options.reimburseStockInPort,
    options.inventoryStockInPort,
    options.unitOfWork,
    options.identityMode,
  );
  const tenantConfig = options.tenantConfig;

  // ── 轻身份登录（IDENTITY-LITE，D-083 §4.2）─────────────────────────────────────────────────
  // identity 模式才建内存会话表 + 挂身份解析钩子 + 写门加会话要求。
  const identityMode: IdentityMode = options.identityMode;
  const sessions =
    identityMode === 'identity' ? new SessionManager(SESSION_TTL_MS) : null;
  // 全请求默认 identity=null（decorate 一次）；身份模式钩子据 cookie 解析覆盖，匿名模式恒 null。
  app.decorateRequest('identity', null);
  if (identityMode === 'identity' && sessions) {
    // 身份解析钩子（**注册在写门钩子之前**，onRequest 按注册序执行，故写门钩子读到已解析的 request.identity）。
    app.addHook('onRequest', async (request) => {
      const token = readSessionCookie(request);
      request.identity = token ? sessions.resolve(token) : null;
    });
  }

  registerWriteGate(app, {
    writeToken: options.writeToken,
    rateLimit: options.writeRateLimit ?? { max: 120, windowMs: 60_000 },
    identityMode,
    trustProxy,
  });

  const ctx: ModuleRouteCtx = {
    store,
    clock,
    inventoryRead: inventoryRepository,
    baselineService,
    checklistService,
    artifactMaxBytes: options.artifactMaxBytes ?? ARTIFACT_MAX_BYTES,
    identityMode,
    trustProxy,
    sessions,
    larkStore: options.larkStore,
  };
  const moduleEnabled = (id: ModuleId): boolean => isModuleEnabled(tenantConfig, id);

  // 文件上传能力（multipart）：**宿主级注册一次**——archive 图纸上传 + pm-core 名册导入共用（K8）。
  // fastify 插件不可重复注册（否则 content-type parser 冲突报错），故从 registerArchiveRoutes 上提到此处。
  // 插件级 fileSize 默认 = 归档物上限（archive `request.file()` 无 per-request limits 时沿用）；名册导入按需
  // per-request 覆盖为 1MB（`request.file({ limits })`）。**全局 bodyLimit(256KB) 不约束 multipart**；
  // 鉴权/限流 onRequest 钩子先于 body 解析跑，故上传仍受 Bearer + 限流 gate。
  void app.register(multipart, {
    limits: { fileSize: ctx.artifactMaxBytes, files: 1 },
  });

  registerSessionRoutes(app, { store, identityMode, sessions });
  registerSetupRoutes(app, { store, identityMode, setupControl: options.setupControl });

  // 装配外壳核心：遍历 enabledModules → 挂载各域路由。未启用模块的函数根本不被调用，端点整段不挂
  // （§3.4-A；游戏工作室等租户可省 presence-schedule，此步无需拆 ScheduleStore——PmRepository 的 schedule
  // 方法对未启用租户单纯不被调用即可，是最便宜实现）。system/pm-core 虽标"核心常装/必装"，装配层仍统一走
  // enabledModules 判断、不写结构性例外——常装与否由 TenantConfig 的内容体现。
  if (moduleEnabled('system')) {
    registerSystemRoutes(app, options.deployment);
  }
  if (moduleEnabled('archive')) {
    registerArchiveRoutes(
      app,
      new ArchiveService(options.artifactRepository, new LocalArtifactFileStorage(), clock),
    );
  }
  if (moduleEnabled('pm-core')) {
    registerPmCoreRoutes(app, ctx);
  }
  if (moduleEnabled('knowledge-base')) {
    registerKnowledgeRoutes(app, {
      service: knowledgeService,
      identityMode,
      requireSuperAdmin: (request, reply) => requireSuperAdmin(store, request, reply),
    });
  }
  if (moduleEnabled('ledger')) {
    registerInventoryRoutes(app, {
      service: inventoryService,
      identityMode,
      requireSuperAdmin: (request, reply) => requireSuperAdmin(store, request, reply),
    });
    // REIMBURSE-PROC：报账域挂 ledger 模块下（采购-报账-入库联动，与库存同支柱同开关）。
    registerReimburseRoutes(app, {
      service: reimburseService,
    });
  }
  if (moduleEnabled('presence-schedule')) {
    registerScheduleRoutes(app, { service: scheduleService });
  }

  registerSearchRoutes(app, { store, knowledgeRead: knowledgeRepository, inventoryRead: inventoryRepository });
  registerExportRoutes(app, { store, inventoryRead: inventoryRepository, scheduleRead: scheduleRepository });
  // GOV-REPORT：项目级汇报导出（拍板=B 文件形态，随 export 族常挂）
  registerGovReportRoutes(app, { store, inventoryRead: inventoryRepository, baselineRepository, scheduleRead: scheduleRepository });

  if (options.larkStore) {
    registerLarkRoutes(app, { store, clock, baselineRepository, larkStore: options.larkStore, trustProxy });
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (await tryServeStaticConsole(request, reply, options.consoleDistDir)) {
      return;
    }

    void reply.code(404).send({ detail: 'Not found' });
  });

  return app;
}
