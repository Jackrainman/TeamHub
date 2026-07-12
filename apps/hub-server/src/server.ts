import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { readFile, readdir } from 'node:fs/promises';
import { extname, isAbsolute, join, relative } from 'node:path';
import {
  getArtifactDir,
  sha256Of,
  writeArtifactFile,
  deleteArtifactFile,
} from './artifact-storage.js';
import {
  AgentBackendCapabilitiesResponseSchema,
  AgentBackendHealthResponseSchema,
  AgentBackendInvokeRequestSchema,
  AgentBackendInvokeResponseSchema,
  AgentBackendsResponseSchema,
  ArtifactsResponseSchema,
  BotChannelsResponseSchema,
  DataSourcesResponseSchema,
  BridgeMembersResponseSchema,
  DepGraphSchema,
  GitReposResponseSchema,
  GOVERNANCE_SCENARIO_NOW,
  HealthResponseSchema,
  HubEventsResponseSchema,
  KB_SIMILAR_NOTE,
  KbCloseoutRequestSchema,
  KbCloseoutResponseSchema,
  KbSimilarQuerySchema,
  KbSimilarResponseSchema,
  CreateTaskRequestSchema,
  CreateTaskResponseSchema,
  CreateDependencyRequestSchema,
  CreateDependencyResponseSchema,
  CreateNeedRequestSchema,
  CreateNeedResponseSchema,
  TransitionTaskStatusRequestSchema,
  TransitionTaskStatusResponseSchema,
  WaiveDependencyResponseSchema,
  CreateArtifactRequestSchema,
  CreateArtifactResponseSchema,
  UploadArtifactResponseSchema,
  nextArtifactVersionNo,
  deriveArtifactKind,
  TasksResponseSchema,
  SystemStatusResponseSchema,
  buildCloseoutFromIssue,
  rankSimilarIssues,
  toDepGraphView,
  wouldCreateCycle,
  GroupGapsResponseSchema,
  deriveDirectionGaps,
  GroupsResponseSchema,
  SeasonsResponseSchema,
  derivePresenceSchedule,
  PresenceScheduleResponseSchema,
  ResourceSessionsResponseSchema,
  SharedResourcesResponseSchema,
  CreateResourceSessionRequestSchema,
  CreateResourceSessionResponseSchema,
  deriveRelayBoard,
  UpdateResourceSessionRequestSchema,
  UpdateResourceSessionResponseSchema,
  CreateRelayHandoffRequestSchema,
  RelayHandoffResponseSchema,
  RelayBoardResponseSchema,
  CreateResourceRequestSchema,
  CreateResourceResponseSchema,
  UpdateResourceStatusRequestSchema,
  UpdateResourceResponseSchema,
  UpdateResourceDefaultPresetRequestSchema,
  UpdateResourceDefaultPresetResponseSchema,
  CreateResourceSessionsBatchRequestSchema,
  CreateResourceSessionsBatchResponseSchema,
  deriveInventoryLedger,
  deriveShortfalls,
  InvalidPartActionError,
  IDLE_HOLDER,
  InventoryResponseSchema,
  CreatePartTypeRequestSchema,
  CreatePartTypeResponseSchema,
  CreatePartActionRequestSchema,
  CreatePartActionResponseSchema,
  ScheduleQuerySchema,
  apiContractFixtures,
  // 倒排基准线（BASELINE-CORE，S4 路由）：读/写契约 + querystring 契约。
  BaselineResponseSchema,
  UpdateBaselineRequestSchema,
  UpdateBaselineResponseSchema,
  PassMilestoneRequestSchema,
  PassMilestoneResponseSchema,
  BaselineQuerySchema,
} from './contracts.js';
import type {
  IssueCard,
  ScheduleSnapshot,
  ModuleId,
  TenantConfig,
  ActorRef,
  IdentityMode,
  SessionIdentity,
} from '@teamhub/hub-contracts';
import {
  ROBOTICS_TENANT_CONFIG,
  isModuleEnabled,
  MembersResponseSchema,
  MemberPublicSchema,
  SessionRequestSchema,
  SessionResponseSchema,
  SetPinRequestSchema,
  SetPinResponseSchema,
} from '@teamhub/hub-contracts';
import { hashPin, verifyPin } from './identity/pin.js';
import { SessionManager } from './identity/session-store.js';
import { deriveErrorCode } from './kb/error-code.js';
import { FixedClock } from './clock.js';
import type { Clock } from './clock.js';
import { InMemoryGovStore } from './store/mock-gov-store.js';
import { InMemoryKbStore } from './store/mock-kb-store.js';
import { InMemoryInvStore } from './store/mock-inv-store.js';
import { InMemoryBaselineStore } from './store/mock-baseline-store.js';
import type { GovStore, InvStore, KbStore } from './store/gov-store.js';
import type { BaselineStore } from './store/baseline-store.js';
import {
  listMockAgentBackends,
  listMockBotChannels,
  listMockDataSources,
} from './mock-integrations.js';
import {
  getMockAgentBackendCapabilities,
  getMockAgentBackendHealth,
  invokeMockAgentBackend,
  isMockAgentBackendId,
} from './mock-agent-backends.js';
import {
  buildHealthResponse,
  buildSystemStatusResponse,
} from './status.js';
import { tryServeStaticConsole } from './static-console.js';

export interface BuildHubServerOptions {
  consoleDistDir?: string;
  /** 治理读取出入口（默认 InMemoryGovStore，seed 真实锚点场景 fixtures）。可注入 SqliteGovStore 切持久层。 */
  store?: GovStore;
  /**
   * 派生快照求值时刻。mock-first 阶段默认钉在 fixture 场景时间 GOVERNANCE_SCENARIO_NOW，
   * 让 real 模式 /api/dep-graph 与 hub-console mock 同口径；真实数据接入后注入 RealClock。
   */
  clock?: Clock;
  /**
   * 战队知识库相似检索语料读出入口（KB-CORE）。**base 收口刀对抗核实修正已兑现**：相似检索语料
   * （IssueCard/ErrorEntry/ArchiveDocument）不在 GovernanceSnapshot 内，故 kbStore 由 GovStore 收窄为
   * 独立 `KbStore`（getKbSnapshot；见 store/gov-store.ts）。结案派生 KnowledgeNode 那半仍走 `store`
   * （GovStore.closeoutKbNode，复用同一 GovernanceSnapshot）。缺省 InMemoryKbStore(seed kbScenarioFixture)，
   * 由 `GET /api/kb/similar` 消费（见下方路由）。
   */
  kbStore?: KbStore;
  /**
   * 库存 / BOM 读写出入口扩展点（reserved，D-042 决策 4）。INV 是唯一需扩 schema 的支柱（PartStock 不在
   * GovernanceSnapshot 内），故走独立 `InvStore` 而非复用 GovStore。本刀只钉扩展点、不建 PartStock；
   * 缺省 undefined，INV 支柱落地时注入实现 InvStore 的实例（对话记账 / 盘点 / 缺口汇报）。
   */
  invStore?: InvStore;
  /**
   * 倒排基准线读写出入口（BASELINE-CORE，S3 落地/S4 挂路由）。独立于 `GovStore`（`SeasonBaseline`
   * 不进 `GovernanceSnapshot`，baseline-design.md §5 红线3），故走独立 `BaselineStore` 而非扩 GovStore。
   * 缺省 `InMemoryBaselineStore`（seed 空，S6 会补 fixtures）。由 `GET/PATCH /api/baseline` +
   * `POST /api/baseline/milestones/:milestoneId/pass` 消费（registerPmCoreRoutes，与 seasonId 同域）。
   */
  baselineStore?: BaselineStore;
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
  /**
   * 租户模块开关（HUB-MODULARIZATION 第2步，装配契约见 `@teamhub/hub-contracts` 的 `TenantConfig`）。
   * 缺省 = `ROBOTICS_TENANT_CONFIG`（机器人战队全 6 模块启用），与拆分前 master 行为等价。
   * 未启用的模块，其路由整段不挂（见下方 `registerXxxRoutes` 调用点），不是"挂了但拒绝"。
   */
  tenantConfig?: TenantConfig;
  /**
   * 轻身份登录模式（IDENTITY-LITE，D-083 §4.2）。缺省 `'anonymous'` = 今天的形态（**现状零变化**）：
   * 身份模块不启用、session 端点禁用（POST/DELETE → 404）、写路由信客户端自报 actor、写门只认 TEAMHUB_WRITE_TOKEN。
   * `'identity'` = 匿名可读一切 + 登录才能写：session 端点启用、写路由须携有效会话（否则 401）+ actor 服务端注入。
   */
  identityMode?: IdentityMode;
}

// 归档物文件上传上限（50MB）：覆盖机械 CAD（step/stp/sldprt）+ 电路 PDF + 固件，又约束资源耗尽面。
const ARTIFACT_MAX_BYTES = 50 * 1024 * 1024;

// 上传后缀白名单 → 规范 contentType。**以后缀为准**（CAD 的浏览器 MIME 多为 octet-stream，不可信）。
// 战队格式：CAD（机械）/ 文档（图纸说明、电路 PDF）/ 图（截图）/ 包（多文件打包）/ 固件（电控/驱动）/
// 视频（BASELINE-CORE 验证门证据：大二提交的整车试跑/破坏性测试视频，走本既有上传链路，不建新链路）。
const ARTIFACT_ALLOWED_EXT = new Map<string, string>([
  ['.step', 'application/step'],
  ['.stp', 'application/step'],
  ['.iges', 'model/iges'],
  ['.igs', 'model/iges'],
  ['.sldprt', 'application/octet-stream'],
  ['.sldasm', 'application/octet-stream'],
  ['.slddrw', 'application/octet-stream'],
  ['.dwg', 'application/acad'],
  ['.f3d', 'application/octet-stream'],
  ['.pdf', 'application/pdf'],
  ['.md', 'text/markdown'],
  ['.txt', 'text/plain'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.zip', 'application/zip'],
  ['.bin', 'application/octet-stream'],
  ['.hex', 'application/octet-stream'],
  ['.mp4', 'video/mp4'],
  ['.mov', 'video/quicktime'],
  ['.webm', 'video/webm'],
]);

// 写路由 safeParse 失败 → 取首条 Zod issue message 作 400 detail（缺省回 fallback）。
// 收口全表单路由重复的 `parsed.error.issues[0]?.message ?? <fallback>` 模式。
function firstZodMsg(err: import('zod').ZodError, fallback = 'invalid body'): string {
  return err.issues[0]?.message ?? fallback;
}

// ── 轻身份登录（IDENTITY-LITE，D-083 §4.2）宿主级横切基元 ─────────────────────────────────────
// FastifyRequest.identity：由身份模式下的 onRequest 钩子从 cookie 解析注入（匿名模式恒 null）。
// 写路由据此把客户端自报的 confirmedBy/passedBy 覆盖为 session 身份（服务端注入 actor，替代零校验自报）。
declare module 'fastify' {
  interface FastifyRequest {
    identity: SessionIdentity | null;
  }
}

const SESSION_COOKIE = 'teamhub_session';
// 会话 TTL（天级，家庭影院级）：重启 = 全员重登（内存态，见 SessionManager）。
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_TTL_SECONDS = Math.floor(SESSION_TTL_MS / 1000);

/** 从 Cookie 头解析 session token（无则 null）。手解析，不引 @fastify/cookie 依赖（单 cookie 足够）。 */
function readSessionCookie(request: { headers: { cookie?: string } }): string | null {
  const raw = request.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === SESSION_COOKIE) {
      const val = part.slice(eq + 1).trim();
      return val.length > 0 ? val : null;
    }
  }
  return null;
}

/** 签发 cookie：httpOnly + SameSite=Lax + Path=/（http 内网/家庭影院级，不假定 TLS 故不加 Secure）。 */
function buildSessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}
/** 清 cookie（登出）：Max-Age=0 立即过期。 */
function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

/** session 身份 → ActorRef（写路由 actor 注入用）：留名归当前登录人，source=console。 */
function sessionActor(identity: SessionIdentity): ActorRef {
  return { id: identity.memberId, displayName: identity.displayName, source: 'console' };
}

// 把治理快照 + 共享资源 + 占用窗口 + 接力交接线拼成 ScheduleSnapshot（GET /api/schedule、/api/relay 共用装配）。
// relayHandoffs 是 ScheduleSnapshot 必填字段（R1 接力画布并入）；在场建议派生不读它，仍带上以满足类型。
// 四次读独立、无依赖 → Promise.all 并发取。
async function buildScheduleSnapshot(store: GovStore): Promise<ScheduleSnapshot> {
  const [snapshot, resources, resourceSessions, relayHandoffs] = await Promise.all([
    store.getSnapshot(),
    store.listResources(),
    store.listResourceSessions(),
    store.listRelayHandoffs(),
  ]);
  return { ...snapshot, resources, resourceSessions, relayHandoffs };
}

/**
 * 模块路由注册共享上下文（对应 `ModuleDescriptor.registerRoutes(app, ctx)` 的 Ctx 型参，
 * 在 hub-server 侧收紧为具体 store/clock 依赖）。装配外壳（buildHubServer）按 `TenantConfig.enabledModules`
 * 遍历调用下方各 `registerXxxRoutes`，未启用模块的函数根本不被调用——端点整段不挂，非"挂了但鉴权拒绝"。
 */
interface ModuleRouteCtx {
  store: GovStore;
  clock: Clock;
  kbStore: KbStore;
  invStore: InvStore;
  // BASELINE-CORE：S4 起由 registerPmCoreRoutes 的 GET/PATCH /api/baseline + 过门路由消费。
  baselineStore: BaselineStore;
  artifactMaxBytes: number;
  // IDENTITY-LITE：部署身份模式。pm-core 的 PUT /api/members/:id/pin 据此在匿名模式 404、身份模式行使
  // 「本人会话 / 首次设置」授权。写路由的 actor 注入不看它、只看 request.identity（匿名模式恒 null）。
  identityMode: IdentityMode;
}

// ============================================================================
// system 模块（核心常装）：健康检查 / 系统状态 / BotChannel·AgentBackend·DataSource / 事件 / 桥接成员 / git repos。
// 完全通用（§3.3），无机器人词汇，任何租户都保留。
// ============================================================================
function registerSystemRoutes(app: FastifyInstance): void {
  app.get('/health', async () => {
    return HealthResponseSchema.parse(buildHealthResponse());
  });

  app.get('/api/system/status', async () => {
    const agentBackends = listMockAgentBackends();
    return SystemStatusResponseSchema.parse(
      buildSystemStatusResponse(agentBackends),
    );
  });

  // 集成模型三分（地基重建）：BotChannel / AgentBackend / DataSource 各自只读端点。
  app.get('/api/bot-channels', async () => {
    return BotChannelsResponseSchema.parse({
      botChannels: listMockBotChannels(),
    });
  });

  app.get('/api/agent-backends', async () => {
    return AgentBackendsResponseSchema.parse({
      agentBackends: listMockAgentBackends(),
    });
  });

  app.get('/api/data-sources', async () => {
    return DataSourcesResponseSchema.parse({
      dataSources: listMockDataSources(),
    });
  });

  // invoke/health/capabilities 是 Agent 后端**专属**契约（其余物种无此动词）。
  app.get('/api/agent-backends/:backendId/health', async (request, reply) => {
    const { backendId } = request.params as { backendId: string };
    if (!isMockAgentBackendId(backendId)) {
      void reply.code(404).send({ detail: 'Agent backend not found' });
      return;
    }
    return AgentBackendHealthResponseSchema.parse(
      getMockAgentBackendHealth(backendId),
    );
  });

  app.get(
    '/api/agent-backends/:backendId/capabilities',
    async (request, reply) => {
      const { backendId } = request.params as { backendId: string };
      if (!isMockAgentBackendId(backendId)) {
        void reply.code(404).send({ detail: 'Agent backend not found' });
        return;
      }
      return AgentBackendCapabilitiesResponseSchema.parse(
        getMockAgentBackendCapabilities(backendId),
      );
    },
  );

  app.post('/api/agent-backends/:backendId/invoke', async (request, reply) => {
    const { backendId } = request.params as { backendId: string };
    if (!isMockAgentBackendId(backendId)) {
      void reply.code(404).send({ detail: 'Agent backend not found' });
      return;
    }
    // 与其余写路由一致：坏 body 走 safeParse → 400（客户端输入错误），不让 ZodError 冒泡成 500
    // （此前唯一仍用抛错 .parse 的 POST；correlationId:'' / 非串都会触发 500 泄漏 Zod 内部、破坏错误契约）。
    const parsed = AgentBackendInvokeRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    return AgentBackendInvokeResponseSchema.parse(
      invokeMockAgentBackend(backendId, parsed.data),
    );
  });

  app.get('/api/events', async () => {
    return HubEventsResponseSchema.parse(apiContractFixtures.events);
  });

  app.get('/api/bridge/members', async () => {
    return BridgeMembersResponseSchema.parse(apiContractFixtures.bridgeMembers);
  });

  app.get('/api/git/repos', async () => {
    return GitReposResponseSchema.parse(apiContractFixtures.gitRepos);
  });
}

// ============================================================================
// archive 模块（可选）：图纸/归档物提交日志 + 版本时间线 + 文件上传下载。
// ============================================================================
function registerArchiveRoutes(app: FastifyInstance, ctx: ModuleRouteCtx): void {
  const { store, clock, artifactMaxBytes } = ctx;

  // 归档物（图纸）文件上传：multipart 流式，单文件。**全局 bodyLimit(256KB) 不约束 multipart**——
  // 故须在此显式钉 fileSize 上限（50MB，覆盖 CAD/PDF 又约束资源耗尽面，与 H3 同源关切）。
  // 注册在写鉴权钩子之后、路由之前；onRequest 钩子先于 body 解析跑，故上传仍受 Bearer + 限流 gate。
  void app.register(multipart, {
    limits: { fileSize: artifactMaxBytes, files: 1 },
  });

  // 图纸提交日志 / 版本时间线（v1，A2）：从治理快照读 artifacts（持久化时由 FileGovStore 落盘累积），
  // 不再读 apiContractFixtures.artifacts。无人维度——记录主键是机构 + 版本 + 归档物（I0/A4）。
  app.get('/api/artifacts', async () => {
    const snapshot = await store.getSnapshot();
    return ArtifactsResponseSchema.parse({ artifacts: snapshot.artifacts });
  });

  // 归档物文件下载：把 txt/md/pdf 放进 TEAMHUB_ARTIFACT_FILES_DIR，文件名 `<artifactId>.<ext>`。
  // GET（读端点，不过写鉴权钩子）。仅服务 snapshot 里真实存在的 artifact id 对应文件——id 先经
  // snapshot 校验（无斜杠/穿越），再 relative 兜底，杜绝路径穿越。I0：文件名用归档物 name，无人维度。
  app.get<{ Params: { id: string } }>(
    '/api/artifacts/:id/download',
    async (request, reply) => {
      const dir = getArtifactDir();
      if (!dir) {
        void reply.code(404).send({ detail: '未配置归档物文件目录' });
        return reply;
      }
      const { id } = request.params;
      const snapshot = await store.getSnapshot();
      const artifact = snapshot.artifacts.find((a) => a.id === id);
      if (!artifact) {
        void reply.code(404).send({ detail: '归档物不存在' });
        return reply;
      }
      const entries = await readdir(dir).catch(() => [] as string[]);
      const match = entries.find((f) => f === id || f.startsWith(`${id}.`));
      if (!match) {
        void reply.code(404).send({ detail: '该归档物暂无可下载文件' });
        return reply;
      }
      const full = join(dir, match);
      const rel = relative(dir, full);
      if (rel.startsWith('..') || isAbsolute(rel)) {
        void reply.code(400).send({ detail: '非法路径' });
        return reply;
      }
      const ext = extname(match);
      const downloadName = `${artifact.name}${ext}`;
      const content = await readFile(full);
      void reply.header(
        'content-disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
      );
      void reply.type(
        ext === '.md'
          ? 'text/markdown; charset=utf-8'
          : ext === '.txt'
            ? 'text/plain; charset=utf-8'
            : 'application/octet-stream',
      );
      return content;
    },
  );

  // 图纸档案 v2 提交（HUB-ARTIFACT-ARCHIVE-V2，append-only）。机构经 UI 记一条新图纸：人填
  // ownerGroup/season/robotCode/mechanism/name/uri（+ 电路 subType、驱动可选 relatedRepo/relatedCommit）。
  // **路由 owns 派生（C5）**：versionNo 按四键 ownerGroup+season+robotCode+mechanism 在全量 snapshot 上自增、
  // kind 由 ownerGroup+subType 派生、revision=`v${versionNo}`——客户端均不给（schema omit）；store 仍钉
  // submittedVia=console、补 id/createdAt（body 不动）。机械时剥掉 subType（superRefine 已拦机械夹带 subType）。
  // POST → 继承 H3 onRequest 鉴权+限流（不另写鉴权）。**I0**：无人维度——主键=组+赛季+车+机构+版本+归档物，无提交人字段。
  // 并发 race（read-then-write 两并发 POST 可能都算同号）：小作坊可接受，append-only 容忍重复、最新即权威。
  app.post('/api/artifacts', async (request, reply) => {
    const parsed = CreateArtifactRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    const { ownerGroup, season, mechanism, subType } = parsed.data;
    const snapshot = await store.getSnapshot();
    // 版本号按三键（组别+赛季+机构）自增——车(robotCode) 不进键，故跨车迭代连续编号。
    const versionNo = nextArtifactVersionNo(snapshot.artifacts, {
      ownerGroup,
      season,
      mechanism,
    });
    const kind = deriveArtifactKind(ownerGroup, subType);
    const revision = `v${versionNo}`;
    // 仅电路组带 subType；机械/电控/视觉剥掉（superRefine 已保证缺省，避免 undefined 落库噪声）。
    const draft =
      ownerGroup !== 'electrical'
        ? (() => {
            const { subType: _drop, ...rest } = parsed.data;
            void _drop;
            return { ...rest, kind, versionNo, revision };
          })()
        : { ...parsed.data, kind, versionNo, revision };
    const artifact = await store.appendArtifact(draft);
    void reply.code(201);
    return CreateArtifactResponseSchema.parse({ artifact });
  });

  // 归档物（图纸）文件上传（HUB-ARTIFACT-STORE-MECH 本地卷版，两步式：先登记元数据再传文件 / 也可登记即传）。
  // 字节落本地卷（artifact-storage 接缝，D-025：不进 git），storedFile 指针经 store.setArtifactFile 落库（覆盖=重传）。
  // POST → 继承 H3 onRequest 鉴权+限流。**I0**：storedFile 无人维度。**安全**：先验归档物存在再写、避免孤儿；
  // 后缀白名单（以后缀为准，CAD 的 MIME 不可信）；fileSize 上限由 multipart limits 钉（全局 bodyLimit 不管 multipart）。
  app.post<{ Params: { id: string } }>(
    '/api/artifacts/:id/upload',
    async (request, reply) => {
      const dir = getArtifactDir();
      if (!dir) {
        // 配置缺失（非 not-found）：用 400 与「归档物不存在」404 区分，便于运维定位。
        void reply.code(400).send({ detail: '未配置归档物文件目录' });
        return reply;
      }
      const { id } = request.params;
      // 先验归档物存在——再消费流写盘，杜绝给不存在 id 留下孤儿文件。
      const snapshot = await store.getSnapshot();
      if (!snapshot.artifacts.some((a) => a.id === id)) {
        void reply.code(404).send({ detail: '归档物不存在' });
        return reply;
      }
      let data;
      try {
        data = await request.file();
      } catch {
        void reply.code(400).send({ detail: '请求体不是 multipart 表单' });
        return reply;
      }
      if (!data) {
        void reply.code(400).send({ detail: '未收到文件' });
        return reply;
      }
      const ext = extname(data.filename ?? '').toLowerCase();
      const contentType = ARTIFACT_ALLOWED_EXT.get(ext);
      if (!contentType) {
        await data.toBuffer().catch(() => {}); // 排空流，避免连接挂起
        void reply.code(415).send({ detail: `不支持的文件类型：${ext || '（无后缀）'}` });
        return reply;
      }
      let buf: Buffer;
      try {
        buf = await data.toBuffer();
      } catch (err) {
        if ((err as { code?: string })?.code === 'FST_REQ_FILE_TOO_LARGE') {
          void reply.code(413).send({ detail: '文件过大（上限 50MB）' });
          return reply;
        }
        void reply.code(400).send({ detail: '读取文件失败' });
        return reply;
      }
      if (data.file.truncated) {
        void reply.code(413).send({ detail: '文件过大（上限 50MB）' });
        return reply;
      }
      const sha256 = sha256Of(buf);
      const sizeBytes = buf.length;
      let filename: string;
      try {
        filename = await writeArtifactFile(dir, id, ext, buf);
      } catch {
        void reply.code(500).send({ detail: '写入文件失败' });
        return reply;
      }
      const meta = {
        filename,
        ext,
        sizeBytes,
        contentType,
        sha256,
        uploadedAt: clock.now().toISOString(),
      };
      let updated;
      try {
        updated = await store.setArtifactFile(id, meta);
      } catch {
        // 落盘指针失败：删刚写的字节，避免「有文件无指针」孤儿。
        await deleteArtifactFile(dir, id).catch(() => {});
        void reply.code(500).send({ detail: '保存文件指针失败' });
        return reply;
      }
      if (!updated) {
        // 竞态：写盘期间归档物消失（append-only 无 delete，理论不至）。清孤儿 + 404。
        await deleteArtifactFile(dir, id).catch(() => {});
        void reply.code(404).send({ detail: '归档物不存在' });
        return reply;
      }
      void reply.code(200);
      return UploadArtifactResponseSchema.parse({ artifact: updated });
    },
  );
}

// ============================================================================
// pm-core 模块（核心必装）：DAG 归因读视图 + 方向缺口 + 任务/依赖/前置需求写侧。
// ============================================================================
function registerPmCoreRoutes(app: FastifyInstance, ctx: ModuleRouteCtx): void {
  const { store, clock, baselineStore, identityMode } = ctx;

  // 成员名册只读（IDENTITY-LITE：登录「选人」+ 未来我的视图数据源）。**密钥纪律**：走 MembersResponseSchema
  // （MemberPublicSchema 数组，剥 pinHash）——凭证散列永不过读边界，即便落盘 gov.json 里存在。两模式均挂
  // （匿名模式也可读名册，读侧全开）。
  app.get('/api/members', async () => {
    const snapshot = await store.getSnapshot();
    return MembersResponseSchema.parse({ members: snapshot.members });
  });

  // 设 / 改成员 PIN（PUT /api/members/:id/pin，IDENTITY-LITE 设 PIN 写口）。匿名模式禁用 → 404。
  // 身份模式：写门钩子已确保有有效会话（无则 401）；这里再行使**本人会话或该 member 尚无 pinHash 首次设置**
  // 授权（家庭影院级：首次谁登进来谁能给尚无 PIN 的成员设 PIN——威胁模型可接受，记 deviation）。
  // pin 明文经 hashPin scrypt 散列后落库、绝不回存；响应走 SetPinResponseSchema（MemberPublicSchema 剥 pinHash）。
  app.put<{ Params: { id: string } }>('/api/members/:id/pin', async (request, reply) => {
    if (identityMode !== 'identity') {
      void reply.code(404).send({ detail: '身份模式未启用' });
      return;
    }
    const { id } = request.params;
    const parsed = SetPinRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    const snapshot = await store.getSnapshot();
    const target = snapshot.members.find((m) => m.id === id);
    if (!target) {
      void reply.code(404).send({ detail: 'member not found' });
      return;
    }
    const isSelf = request.identity?.memberId === id;
    const firstSetup = !target.pinHash;
    if (!isSelf && !firstSetup) {
      void reply.code(403).send({ detail: '只能设置本人 PIN' });
      return;
    }
    const updated = await store.setMemberPin(id, hashPin(parsed.data.pin));
    if (!updated) {
      void reply.code(404).send({ detail: 'member not found' });
      return;
    }
    // MemberPublicSchema.parse 剥 pinHash（密钥纪律）——回带公开视图。
    return SetPinResponseSchema.parse({ member: MemberPublicSchema.parse(updated) });
  });

  // 组只读列表（PHASE2-CONSOLE-ASSEMBLY）：console TodayPlanTable 原借 dep-graph 节点反查组名当临时
  // 数据源（节点集合=任务派生视图，没有任务的组不出现在里面、下拉会漏项）；GroupsResponseSchema 早有
  // 契约（pm-core.ts）却零消费方，这里补上语义正确的直读端点。
  app.get('/api/groups', async () => {
    const snapshot = await store.getSnapshot();
    return GroupsResponseSchema.parse({ groups: snapshot.groups });
  });

  // 赛季只读列表（S1 接线，product-redefine-2026-07 §4.1/§9-①）：SeasonSchema/SeasonsResponseSchema
  // 此前是死脚手架（从未接线、无端点）；照 GET /api/groups 先例直读快照，不加 GovStore 写方法
  // （赛季录入待身份/裁剪功能落地时再开写口）。倒排基准线（BASELINE-DESIGN）的 SeasonBaseline.seasonId
  // 未来引用 GET /api/seasons 返回的实体，而非仅裸字符串。
  app.get('/api/seasons', async () => {
    const snapshot = await store.getSnapshot();
    return SeasonsResponseSchema.parse({ seasons: snapshot.seasons });
  });

  // ── 倒排基准线（BASELINE-CORE，S4 路由；docs/design/baseline-design.md §3/§5）─────────────────
  // 同域挂在 pm-core（与 GET /api/seasons 相邻——SeasonBaseline.seasonId 引用 Season 实体）。
  // 三条路由统一走独立 baselineStore（红线3：不碰 GovStore/GovernanceSnapshot），seasonId 走
  // querystring（照 GET /api/schedule?windowLabel= 风格，非嵌进 path——与已落地的 BaselineStore
  // 方法签名 `(seasonId, ...)` 对齐；本步的最小化路由风格决策，记入 deviations）。写路由（PATCH/POST）
  // 继承宿主级 H3 onRequest 钩子（Bearer 鉴权 + 限流），不另写鉴权。

  // GET /api/baseline?seasonId=xxx：读某赛季基准线；未生成模板 → `{ baseline: null }`（非 404——
  // GET 语义上"还没有"是合法状态，见 BaselineStore.getBaseline 注释）。读视图剥 passedBy（红线2/I0）。
  app.get('/api/baseline', async (request, reply) => {
    const parsed = BaselineQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error, 'seasonId required') });
      return;
    }
    const baseline = await baselineStore.getBaseline(parsed.data.seasonId);
    return BaselineResponseSchema.parse({ baseline });
  });

  // PATCH /api/baseline?seasonId=xxx：生成模板 / 队长手写覆盖（baseline-design.md §1 细节2）。
  // 该赛季无基准线时以 patch 字段为初始值创建，已存在时整段覆盖式合并（v1 不做逐字段 diff，C3）。
  // 版次裁剪（红线5：V3 并入 V2）走这条路——patch 里改某里程碑的 robotVersion/mergedFromVersion，
  // 门本身（milestone 记录）不删、验证要求不降低，store 层不提供删除里程碑的方法。
  app.patch('/api/baseline', async (request, reply) => {
    const queryParsed = BaselineQuerySchema.safeParse(request.query ?? {});
    if (!queryParsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(queryParsed.error, 'seasonId required') });
      return;
    }
    const bodyParsed = UpdateBaselineRequestSchema.safeParse(request.body ?? {});
    if (!bodyParsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(bodyParsed.error) });
      return;
    }
    const baseline = await baselineStore.upsertBaseline(queryParsed.data.seasonId, bodyParsed.data);
    return UpdateBaselineResponseSchema.parse({ baseline });
  });

  // POST /api/baseline/milestones/:milestoneId/pass?seasonId=xxx：验证门过门（baseline-design.md
  // §1 细节3："大二提交证据（视频/图片）→ 大三验收留名过门"）。**先验 evidenceRefs 引用的 artifactId
  // 确实存在**（照 POST /api/artifacts/:id/upload 的"先验归档物存在再写"先例，避孤儿引用）——证据字节
  // 走既有上传链路（本路由不接收二进制，D-025 红线4）。milestoneId 未命中 / 该赛季无基准线 → 404。
  app.post<{ Params: { milestoneId: string } }>(
    '/api/baseline/milestones/:milestoneId/pass',
    async (request, reply) => {
      const queryParsed = BaselineQuerySchema.safeParse(request.query ?? {});
      if (!queryParsed.success) {
        void reply.code(400).send({ detail: firstZodMsg(queryParsed.error, 'seasonId required') });
        return;
      }
      const bodyParsed = PassMilestoneRequestSchema.safeParse(request.body ?? {});
      if (!bodyParsed.success) {
        void reply.code(400).send({ detail: firstZodMsg(bodyParsed.error) });
        return;
      }
      const { evidenceRefs } = bodyParsed.data;
      if (evidenceRefs && evidenceRefs.length > 0) {
        const snapshot = await store.getSnapshot();
        const knownArtifactIds = new Set(snapshot.artifacts.map((a) => a.id));
        const orphan = evidenceRefs.find((id) => !knownArtifactIds.has(id));
        if (orphan) {
          void reply.code(400).send({ detail: `证据引用的归档物不存在：${orphan}` });
          return;
        }
      }
      const { milestoneId } = request.params;
      // IDENTITY-LITE actor 注入：身份模式下验收留名 passedBy 由 session 身份覆盖（大三验收人=登录人，
      // 不信客户端自报）；匿名模式沿用请求体 passedBy。读视图仍剥 passedBy（红线2 不变）。
      const passData = request.identity
        ? { ...bodyParsed.data, passedBy: sessionActor(request.identity) }
        : bodyParsed.data;
      const baseline = await baselineStore.passMilestone(
        queryParsed.data.seasonId,
        milestoneId,
        passData,
      );
      if (!baseline) {
        void reply.code(404).send({ detail: '基准线或里程碑不存在' });
        return;
      }
      return PassMilestoneResponseSchema.parse({ baseline });
    },
  );
  // ── 倒排基准线路由结束 ─────────────────────────────────────────────────────────────────────

  // 依赖链 · 阻塞归因视图：治理快照经纯函数 toDepGraphView 实时派生（D-040 首任务收敛）。
  // 解 hub-console real 模式 GET /api/dep-graph 的 404；输出主键为 task/group/dependency，无 memberId 维度（C2）。
  app.get('/api/dep-graph', async () => {
    const snapshot = await store.getSnapshot();
    return DepGraphSchema.parse(toDepGraphView(snapshot, clock.now().toISOString()));
  });

  // 方向缺口（S2，D-069）：治理快照经纯函数 deriveDirectionGaps 实时派生组级缺人方向。
  // A1/I0 安全：响应只含 groupId/能力方向/证据 task·need id，无 memberId/认领人，永不下钻到人。
  app.get('/api/group-gaps', async () => {
    const snapshot = await store.getSnapshot();
    const now = clock.now().toISOString();
    return GroupGapsResponseSchema.parse({
      gaps: deriveDirectionGaps(snapshot, now),
      generatedAt: now,
    });
  });

  // PM 项目计划表：单条任务录入（C1 兜底录入口）。server 补 id/时间戳/派生默认（status=pending/statusSource=console）。
  // 卡住原因走人建 Dependency 边由 toDepGraphView 派生（G2 不在 Task 上另存 blockedBy）；不引入 dueDate（G4）。
  app.post('/api/tasks', async (request, reply) => {
    const parsed = CreateTaskRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    const task = await store.createTask(parsed.data);
    void reply.code(201);
    return CreateTaskResponseSchema.parse({ task });
  });

  // PM 读视图：任务列表（看板列 / 列表双视图的读原语）。Task 无 confirmedBy、ownerId 只表「谁负责」(D-041 安全堆)，
  // 无完成量维度（C2/I0 安全）；依赖/缺口的结构视图走 GET /api/dep-graph（blockedByLabel 上游任务名，不暴露人）。
  app.get('/api/tasks', async () => {
    const snapshot = await store.getSnapshot();
    return TasksResponseSchema.parse({ tasks: snapshot.tasks });
  });

  // PM 任务状态流转（人工标进度，含 inProgress→done 标真实完成）。POST 子资源动作 → 继承 H3 鉴权+限流
  // （写钩子只认 POST；用 PATCH/DELETE 会绕过鉴权）。受限状态机迁移、非通用 update。
  // C5：server 钉 statusSource=console（请求不收 statusSource，结构上杜绝冒充 derived/git/lark）。
  app.post('/api/tasks/:taskId/status', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const parsed = TransitionTaskStatusRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    const task = await store.updateTaskStatus(taskId, parsed.data.status);
    if (!task) {
      void reply.code(404).send({ detail: 'task not found' });
      return;
    }
    // 流转非创建 → 默认 200。
    return TransitionTaskStatusResponseSchema.parse({ task });
  });

  // PM 依赖边录入（人手建有向边）。server clamp status=active（D-042 初始态）；confirmedBy 内部凭证不经读视图暴露。
  app.post('/api/dependencies', async (request, reply) => {
    const parsed = CreateDependencyRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    // H1（AUDIT-FIXES 部署前必修）：落库前拒自环 / 成环。后端原零语义校验——一条成环边会让下次
    // GET /api/dep-graph 的 computeCriticalSet / toDepGraphView 派生死循环、卡死整个 server（单请求 DoS）。
    const snapshot = await store.getSnapshot();
    const { fromTaskId, toTaskId } = parsed.data;
    // 只滤 waived 边（已作废、从 dep-graph 隐藏、不构成真实阻塞路径）。否则 waive 一条 A→B 后想建反向
    // B→A 会被永久误拒——逆向边并不与一条已死的边成环。satisfied 边仍是真实历史路径、必须参与环检测。
    if (
      wouldCreateCycle(
        snapshot.dependencies.filter((d) => d.status !== 'waived'),
        fromTaskId,
        toTaskId,
      )
    ) {
      void reply.code(400).send({
        detail:
          fromTaskId === toTaskId
            ? 'self dependency not allowed'
            : 'dependency would create a cycle',
      });
      return;
    }
    // IDENTITY-LITE actor 注入：身份模式下 confirmedBy 由 session 身份覆盖（不信客户端自报）；
    // 匿名模式 request.identity 恒 null → 沿用请求体 confirmedBy（现状）。
    const draft = request.identity
      ? { ...parsed.data, confirmedBy: sessionActor(request.identity) }
      : parsed.data;
    const dependency = await store.createDependency(draft);
    void reply.code(201);
    return CreateDependencyResponseSchema.parse({ dependency });
  });

  // PM 连线作废（软删除）。POST 子资源动作 → 继承 H3 鉴权+限流。转 waived 后从 dep-graph edges 隐藏
  // （toDepGraphView 跳过 waived），但库里保留 confirmedBy/createdAt（G2 可审计）。无 body 字段。
  // waive 只删边、不可能成环，故无需 wouldCreateCycle 守卫。I0：响应剥 confirmedBy。
  app.post('/api/dependencies/:depId/waive', async (request, reply) => {
    const { depId } = request.params as { depId: string };
    const dependency = await store.waiveDependency(depId);
    if (!dependency) {
      void reply.code(404).send({ detail: 'dependency not found' });
      return;
    }
    return WaiveDependencyResponseSchema.parse({ dependency });
  });

  // PM 前置需求录入（G3 一等公民）。server clamp status=open；A1 缺口归组不归人。
  app.post('/api/needs', async (request, reply) => {
    const parsed = CreateNeedRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    // IDENTITY-LITE actor 注入：身份模式覆盖 confirmedBy 为 session 身份；匿名模式沿用请求体。
    const draft = request.identity
      ? { ...parsed.data, confirmedBy: sessionActor(request.identity) }
      : parsed.data;
    const need = await store.createNeed(draft);
    void reply.code(201);
    return CreateNeedResponseSchema.parse({ need });
  });
}

// ============================================================================
// knowledge-base 模块（可选）：症状 → 相似历史 bug 召回 + 结案闭环。零机器人词汇（§3.3 generic）。
// ============================================================================
function registerKnowledgeBaseRoutes(app: FastifyInstance, ctx: ModuleRouteCtx): void {
  const { store, clock, kbStore } = ctx;

  // KB-CORE：症状 → top-N 相似历史 bug（跨赛季同类 bug 召回）。纯函数 rankSimilarIssues 在 KbStore 语料上排序。
  // A4 护栏：响应 note 明示「只列候选、不断言同因、由人选用」；返回主键是 issue/errorCode，无人维度（C2）。
  app.get('/api/kb/similar', async (request, reply) => {
    const parsed = KbSimilarQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error, 'invalid query') });
      return;
    }
    const { symptom, tags, projectId, limit, minScore } = parsed.data;
    const kb = await kbStore.getKbSnapshot();
    const now = clock.now().toISOString();
    // 用症状构造一张「当前问题卡」喂排序纯函数；id 不与历史撞、projectId 默认对齐语料库
    const currentIssue: IssueCard = {
      id: 'iss-probe',
      projectId: projectId ?? kb.projectId,
      title: symptom,
      rawInput: symptom,
      normalizedSummary: symptom,
      symptomSummary: symptom,
      suspectedDirections: [],
      suggestedActions: [],
      status: 'open',
      severity: 'medium',
      tags,
      relatedFiles: [],
      relatedCommits: [],
      relatedHistoricalIssueIds: [],
      createdAt: now,
      updatedAt: now,
    };
    const items = rankSimilarIssues({
      currentIssue,
      issues: kb.issueCards,
      errorEntries: kb.errorEntries,
      archives: kb.archiveDocuments,
      limit,
      minScore,
    });
    return KbSimilarResponseSchema.parse({
      query: { symptom, tags },
      items,
      note: KB_SIMILAR_NOTE,
    });
  });

  // KB-CORE：结案闭环（用着就沉淀）。结案输入 → 归档 + 错误表 + 已归档卡 + 结案派生 KnowledgeNode（持久到 store）。
  // I0：errorCode/id 由 clock + issue.id 确定性派生（不记结案人）；派生节点无人维度，来源凭证是结构。
  app.post('/api/kb/closeout', async (request, reply) => {
    const parsed = KbCloseoutRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    const { issue, records, category, rootCause, resolution, prevention, generatedBy } =
      parsed.data;
    const now = clock.now().toISOString();
    // M9（AUDIT-FIXES 部署前必修）：errorCode NNN 用「同日既有 ErrorEntry 数 + 1」的单调序号，
    // 避免哈希 mod 1000 在 ~38 次/日时生日碰撞 → 静默覆盖、污染 kb-similar 跨赛季查找。
    const kbSnapshot = await kbStore.getKbSnapshot();
    const dayPrefix = `DBG-${now.slice(0, 10).replace(/-/g, '')}-`;
    // known-low（不在本批处理）：sameDaySeq 的 read-then-write 是 TOCTOU——两个并发 closeout 可能读到同一
    // count、派生相同 errorCode。需真并发才触发、量小，小作坊（单端口 / 极少并发写）可接受；真要彻底消除得在
    // store 层把序号分配做成原子计数器。本批只修「同一结案重试」的重复主键（见 appendCloseoutInto upsert）。
    const sameDaySeq =
      kbSnapshot.errorEntries.filter((e) => e.errorCode.startsWith(dayPrefix)).length + 1;
    const result = buildCloseoutFromIssue(
      issue,
      records,
      { category, rootCause, resolution, prevention },
      {
        now,
        errorEntryId: `err-${issue.id}`,
        errorCode: deriveErrorCode(now, issue.id, sameDaySeq),
        generatedBy,
      },
    );
    if (!result.ok) {
      // 结案校验失败（如缺 rootCause / 卡已归档）→ 422，不伪造完成（§10）
      void reply.code(422).send({ detail: result.reason });
      return;
    }
    // 结案派生知识节点持久到治理快照（复用同一 GovernanceSnapshot，对抗核实确认成立）。
    // 两步写（GovStore.closeoutKbNode + KbStore.appendCloseout）跨两个独立 store、无分布式事务。
    // 第一步失败 → 整个请求抛错（无副作用，客户端可安全重试）。第二步失败 → 知识节点已落 GovStore、
    // 但相似检索语料没回灌 → 两库分叉（GET /api/kb/similar 查不到本次结案）。这种分叉不能静默吞——
    // app.log.error 记录下来，让运维能发现并补回灌；仍把错误抛给客户端（500，别伪造 201 成功）。
    // 幂等护栏（见 closeoutKbNode 的 dedup / appendCloseoutInto 的 upsert）：重试同一结案不产生重复主键。
    const knowledgeNode = await store.closeoutKbNode(result.knowledgeNodeDraft);
    try {
      // 回灌相似检索语料（AI+知识库闭环）：archived 卡 / 错误表 / 归档写回 kbStore，
      // 否则本次上传后下次 GET /api/kb/similar 查不到（闭环断）。无人维度（C2）：主键 issue/errorCode。
      await kbStore.appendCloseout({
        issueCard: result.updatedIssueCard,
        errorEntry: result.errorEntry,
        archiveDocument: result.archiveDocument,
      });
    } catch (err) {
      app.log.error(
        { err, issueId: issue.id, knowledgeNodeId: knowledgeNode.id, errorCode: result.errorEntry.errorCode },
        'kb closeout two-step diverged: knowledge node persisted but corpus reload failed; retry safe (idempotent upsert)',
      );
      throw err;
    }
    // L4：与其余 create 路由（tasks/dependencies/needs）一致，结案创建归档/错误表/知识节点 → 201。
    void reply.code(201);
    return KbCloseoutResponseSchema.parse({
      archiveDocument: result.archiveDocument,
      errorEntry: result.errorEntry,
      updatedIssueCard: result.updatedIssueCard,
      knowledgeNode,
    });
  });
}

// ============================================================================
// ledger 模块（可选）：零件/个体件/库存总表读视图 + 缺料告警 + 录入。
// ============================================================================
function registerLedgerRoutes(app: FastifyInstance, ctx: ModuleRouteCtx): void {
  const { store, invStore } = ctx;

  // 库存 / BOM 读视图（INV-BOM-CORE）：零件 + 个体件 + 库存总表派生（零件×车 矩阵）+ 缺料告警。
  // 车列复用 GovStore.listResources（显示 displayCode ?? name，与 PRESENCE 解耦）。**I0**：返回体无任何
  // memberId / 按人聚合——PartAction.recordedBy 只到 source，矩阵主键是零件×车。
  app.get('/api/inventory', async () => {
    const snapshot = await invStore.getInventorySnapshot();
    const resources = await store.listResources();
    const ledger = deriveInventoryLedger(snapshot, resources);
    const shortfalls = deriveShortfalls(snapshot);
    return InventoryResponseSchema.parse({
      partTypes: snapshot.partTypes,
      trackedParts: snapshot.trackedParts,
      ledger,
      shortfalls,
      actions: snapshot.actions,
    });
  });

  // 库存零件录入 / 调整（POST /api/inventory/part-types，盘点建底 / 补料 / 调阈值）。带 id 命中即更新。
  // POST → 继承 H3 onRequest 鉴权 + 限流。store 补 lastCountedAt / updatedAt（C5 来源 seam server 钉）。
  app.post('/api/inventory/part-types', async (request, reply) => {
    const parsed = CreatePartTypeRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    const partType = await invStore.upsertPartType(parsed.data);
    void reply.code(201);
    return CreatePartTypeResponseSchema.parse({ partType });
  });

  // 库存动作记一笔（POST /api/inventory/actions）：一句话快记=damage、拆装=mount/dismount、预留=reserve/release。
  // **recordedBy 不收客户端**——server 钉 source=human（C5；I0 绝无 memberId）。Hermes 将来调同一接口自动填。
  // 校验两层：① 未知 resourceId（toHolder/fromHolder 不是 idle 也不在 listResources）→ 400；
  // ② 非法迁移（负库存 / used 超 total / 缺持有者）由 store 抛 InvalidPartActionError → 400（不静默吞）。
  app.post('/api/inventory/actions', async (request, reply) => {
    const parsed = CreatePartActionRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    const validResourceIds = new Set(
      (await store.listResources()).map((r) => r.id),
    );
    for (const holder of [parsed.data.fromHolder, parsed.data.toHolder]) {
      if (holder && holder !== IDLE_HOLDER && !validResourceIds.has(holder)) {
        void reply.code(400).send({ detail: `未知 resourceId: ${holder}` });
        return;
      }
    }
    try {
      const action = await invStore.recordPartAction({ ...parsed.data, source: 'human' });
      void reply.code(201);
      return CreatePartActionResponseSchema.parse({ action });
    } catch (err) {
      if (err instanceof InvalidPartActionError) {
        void reply.code(400).send({ detail: err.message });
        return;
      }
      throw err;
    }
  });
}

// ============================================================================
// presence-schedule 模块（robotics 垂直专属，游戏工作室等租户不注册）：
// 差异化在场排班 / 车（SharedResource）管理 / 接力交接画布。
// ============================================================================
function registerPresenceScheduleRoutes(app: FastifyInstance, ctx: ModuleRouteCtx): void {
  const { store, clock } = ctx;

  // 差异化在场排班（D-029，SCHED-WIRE-EXISTING）：把治理快照 + 共享资源 + 占用窗口拼成 ScheduleSnapshot，
  // 经纯函数 derivePresenceSchedule 实时派生「按组×窗口 谁在场/随叫/可不来」。now 用 clock（与 dep-graph/
  // group-gaps 同口径 GOVERNANCE_SCENARIO_NOW，否则视觉组落不到 blockedFree）。windowLabel 走 query、必填。
  // **I0**：输出 recommendations 主键 group/resource/task，**无 memberId 维度**（纯函数结构保证 + PresenceScheduleResponseSchema
  // 二次 fail-closed 把关：PresenceRecommendationSchema 无 memberId 字段，任何夹带会被 parse 拒）；路由绝不回原始
  // session 或 snapshot.members，更不回 invitedMemberIds（那是单窗录入名单，按人聚合即退化成出勤排名，反排名红线）。
  app.get('/api/schedule', async (request, reply) => {
    const parsed = ScheduleQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      void reply
        .code(400)
        .send({ detail: firstZodMsg(parsed.error, 'windowLabel required') });
      return;
    }
    const { windowLabel } = parsed.data;
    const scheduleSnapshot = await buildScheduleSnapshot(store);
    const recommendations = derivePresenceSchedule(
      scheduleSnapshot,
      clock.now().toISOString(),
      windowLabel,
    );
    return PresenceScheduleResponseSchema.parse({ windowLabel, recommendations });
  });

  // 在场排班读视图：占用窗口列表（录入面板回显 / 调试）。原始 ResourceSession（含 invitedMemberIds 单窗操作名单，
  // I0 注释已许可「单窗名单合法」）——但**绝不**在此或任何端点按成员跨窗聚合/计数（反排名护栏，见 SchedulePage 渲染纪律）。
  app.get('/api/resource-sessions', async () => {
    const sessions = await store.listResourceSessions();
    return ResourceSessionsResponseSchema.parse({ sessions });
  });

  // 在场排班读视图：共享物理资源列表（录入面板选资源用）。无人维度——资源状态是中性事实（"撞坏维修中"非归咎于人）。
  app.get('/api/resources', async () => {
    const resources = await store.listResources();
    return SharedResourcesResponseSchema.parse({ resources });
  });

  // 建车（POST /api/resources，R3 车管理 / D-072 §3.2「车 = 带编号对象」）。镜像 POST /api/resource-sessions：
  // safeParse→400/201。**displayCode 禁手写 / store 内派生**——draft 只传人工输入字段（如同从不传 status）；
  // store.createResource 内经 deriveDisplayCode(season, robotTarget, version??1) 派生（给了 season 才有）+ 钉
  // status=available / statusReason=null / statusSource=console、补 id/updatedAt。POST /api/* → 继承 H3 onRequest
  // 鉴权 + 限流。**I0**：SharedResource 无成员维度。
  app.post('/api/resources', async (request, reply) => {
    const parsed = CreateResourceRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    const { projectId, name, kind, robotTarget, season, version } = parsed.data;
    const resource = await store.createResource({
      projectId,
      name,
      kind,
      robotTarget,
      season,
      version,
    });
    void reply.code(201);
    return CreateResourceResponseSchema.parse({ resource });
  });

  // 改状态（PATCH /api/resources/:id/status，R3 / D-072 §3.3 车生命周期）。镜像 PATCH /api/resource-sessions/:id：
  // safeParse→400；updateResourceStatus 返回 null（id 不存在）→ 404；否则 200 {resource}。**退役 = status→retired、
  // 非物删**（无 DELETE 路由——整车留展示，ResourceSession 仍引用 resourceId）。statusSource 由 store 钉 console（C5）。
  app.patch('/api/resources/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateResourceStatusRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    const resource = await store.updateResourceStatus(id, parsed.data);
    if (!resource) {
      void reply.code(404).send({ detail: 'resource not found' });
      return;
    }
    return UpdateResourceResponseSchema.parse({ resource });
  });

  // 默认阵型写回（PATCH /api/resources/:id/preset，D-082 daily-plan-presets §6 D2「使用预设」铺底基线）。
  // 逐字镜像上方 PATCH /api/resources/:id/status：safeParse→400；setResourceDefaultPreset 返回 null
  // （id 不存在）→ 404；否则 200 {resource}。`defaultPreset` 传对象=整体替换、传 `null`=清除该车预设。
  app.patch('/api/resources/:id/preset', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateResourceDefaultPresetRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    const resource = await store.setResourceDefaultPreset(id, parsed.data.defaultPreset);
    if (!resource) {
      void reply.code(404).send({ detail: 'resource not found' });
      return;
    }
    return UpdateResourceDefaultPresetResponseSchema.parse({ resource });
  });

  // 在场排班录入（POST /api/resource-sessions，D-029 队长一拍即录）。镜像 POST /api/needs：safeParse→400/201。
  // server 钉 source=human、补 id/createdAt；confirmedBy 随请求传入（录入即确认拍板）。
  // POST /api/* → 继承 H3 onRequest 鉴权+限流（不另写鉴权）。I0：响应剥 confirmedBy（ActorRef 永不过读边界）。
  app.post('/api/resource-sessions', async (request, reply) => {
    const parsed = CreateResourceSessionRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    // IDENTITY-LITE actor 注入：身份模式覆盖 confirmedBy 为 session 身份；匿名模式沿用请求体。
    const draft = request.identity
      ? { ...parsed.data, confirmedBy: sessionActor(request.identity) }
      : parsed.data;
    const session = await store.createResourceSession(draft);
    void reply.code(201);
    return CreateResourceSessionResponseSchema.parse({ session });
  });

  // 今日计划批量确认落盘（POST /api/resource-sessions/batch，D-082 §5 表格页【确认】）。
  // safeParse 之外还须做四类跨表校验（resource/group/task 存在、同车同窗 orderInWindow 不冲突）——
  // **全部通过才调用 store 原子批量创建**；任一条不过 → 整批 400、不落一条（避免半成功，见 gov-store.ts
  // createResourceSessionsBatch 注释）。confirmedBy 请求整体一层，落盘前逐条注入每条草稿；
  // invitedMemberIds 无论请求传什么，这里一律清空（I0 双保险，store 侧再清一次）。
  app.post('/api/resource-sessions/batch', async (request, reply) => {
    const parsed = CreateResourceSessionsBatchRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    const { windowLabel, sessions } = parsed.data;
    // IDENTITY-LITE actor 注入：身份模式下整批 confirmedBy 由 session 身份覆盖（不信请求体自报）；
    // 匿名模式沿用请求体 confirmedBy。
    const confirmedBy = request.identity
      ? sessionActor(request.identity)
      : parsed.data.confirmedBy;

    const [snapshot, resources, existingSessions] = await Promise.all([
      store.getSnapshot(),
      store.listResources(),
      store.listResourceSessions(),
    ]);
    const resourceIds = new Set(resources.map((r) => r.id));
    const groupIds = new Set(snapshot.groups.map((g) => g.id));
    const taskIds = new Set(snapshot.tasks.map((t) => t.id));

    // 同车同窗 orderInWindow 冲突键：resourceId|windowLabel|orderInWindow。先纳入既有 sessions 起底，
    // 再逐条校验本批（批内相互冲突、或撞已落盘的 session，皆拒）。
    const orderKeys = new Set(
      existingSessions.map((s) => `${s.resourceId}|${s.windowLabel}|${s.orderInWindow}`),
    );

    for (const [index, draft] of sessions.entries()) {
      if (draft.windowLabel !== windowLabel) {
        void reply.code(400).send({
          detail: `sessions[${index}].windowLabel 须与请求 windowLabel 一致`,
        });
        return;
      }
      if (!resourceIds.has(draft.resourceId)) {
        void reply.code(400).send({ detail: `sessions[${index}]: 未知 resourceId ${draft.resourceId}` });
        return;
      }
      if (!groupIds.has(draft.holderGroupId)) {
        void reply.code(400).send({
          detail: `sessions[${index}]: 未知 holderGroupId ${draft.holderGroupId}`,
        });
        return;
      }
      if (draft.holderTaskId !== null && !taskIds.has(draft.holderTaskId)) {
        void reply.code(400).send({ detail: `sessions[${index}]: 未知 holderTaskId ${draft.holderTaskId}` });
        return;
      }
      const orderKey = `${draft.resourceId}|${draft.windowLabel}|${draft.orderInWindow}`;
      if (orderKeys.has(orderKey)) {
        void reply.code(400).send({
          detail: `sessions[${index}]: 该车该窗口 orderInWindow=${draft.orderInWindow} 已被占用`,
        });
        return;
      }
      orderKeys.add(orderKey);
    }

    const drafts = sessions.map((draft) => ({
      projectId: draft.projectId,
      resourceId: draft.resourceId,
      windowLabel: draft.windowLabel,
      orderInWindow: draft.orderInWindow,
      holderGroupId: draft.holderGroupId,
      holderTaskId: draft.holderTaskId,
      // I0 双保险：无论请求体传什么，批量落盘一律清空（store 侧 createResourceSessionsBatch 再清一次）。
      invitedMemberIds: [],
      note: draft.note,
      eta: draft.eta,
      confirmedBy,
    }));
    const created = await store.createResourceSessionsBatch(drafts);
    void reply.code(201);
    return CreateResourceSessionsBatchResponseSchema.parse({ sessions: created });
  });

  // 接力画布·占用窗口受限编辑（PATCH /api/resource-sessions/:id，R1）。队长拖卡片排先后（orderInWindow）/
  // 选填预估完成时间（eta）。镜像写路由 safeParse→400；只开 orderInWindow/eta 两字段（C3 受限编辑）；
  // updateResourceSession 返回 null（id 不存在）→ 404；否则 200 {session}。I0：响应剥 confirmedBy。
  app.patch('/api/resource-sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateResourceSessionRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    const session = await store.updateResourceSession(id, parsed.data);
    if (!session) {
      void reply.code(404).send({ detail: 'resource session not found' });
      return;
    }
    return UpdateResourceSessionResponseSchema.parse({ session });
  });

  // 删一棒（DELETE /api/resource-sessions/:id，A2 接力画布「删除一棒」）。镜像 DELETE /api/relay-handoffs/:id：
  // 命中删除 → 200 { deleted: id }；不存在 → 404。store.deleteResourceSession 内**级联删引用它的接力交接线**
  // （删卡后箭头不悬空）。POST/PATCH/DELETE → 继承 H3 onRequest 鉴权 + 限流（R1 已把写钩子扩到含 DELETE）。
  app.delete('/api/resource-sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = await store.deleteResourceSession(id);
    if (!ok) {
      void reply.code(404).send({ detail: 'resource session not found' });
      return;
    }
    return { deleted: id };
  });

  // 接力交接画布读视图（GET /api/relay?windowLabel=，R1）。组 ScheduleSnapshot（含 listRelayHandoffs）→
  // deriveRelayBoard 纯函数派生「一排接力站 + 站间交接线」。复用 ScheduleQuerySchema（windowLabel 必填）。
  // **反监视红线**：RelayStage 结构无人维度；handoffs 经 RelayBoardResponseSchema 剥 confirmedBy（ActorRef
  // 永不过读边界）+ schema 无 memberId 字段 → 二次 fail-closed 把关，返回体绝不含成员/出勤维度。
  app.get('/api/relay', async (request, reply) => {
    const parsed = ScheduleQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      void reply
        .code(400)
        .send({ detail: firstZodMsg(parsed.error, 'windowLabel required') });
      return;
    }
    const { windowLabel } = parsed.data;
    const scheduleSnapshot = await buildScheduleSnapshot(store);
    const board = deriveRelayBoard(scheduleSnapshot, windowLabel);
    return RelayBoardResponseSchema.parse(board);
  });

  // 接力交接线录入（POST /api/relay-handoffs，R1 画布拉线）。镜像 POST /api/dependencies 的自环/成环守卫：
  // ① from/to session 必须都存在 → 否则 400；② from===to（自环）→ 400；③ 成环（参照 wouldCreateCycle，
  // 把 relayHandoffs 当 fromSession→toSession 有向边）→ 400。server 钉 source=console、补 id/createdAt。
  // **接力交接 ≠ 任务依赖**：环检测只在本窗接力线集合内做，绝不掺 Dependency 边（井水不犯河水）。
  app.post('/api/relay-handoffs', async (request, reply) => {
    const parsed = CreateRelayHandoffRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    const { fromSessionId, toSessionId, windowLabel } = parsed.data;
    const sessionsById = new Map(
      (await store.listResourceSessions()).map((s) => [s.id, s] as const),
    );
    const fromSession = sessionsById.get(fromSessionId);
    const toSession = sessionsById.get(toSessionId);
    if (!fromSession || !toSession) {
      void reply.code(400).send({ detail: 'from/to session not found' });
      return;
    }
    if (fromSession.windowLabel !== windowLabel || toSession.windowLabel !== windowLabel) {
      void reply.code(400).send({
        detail: 'from/to sessions must belong to the same windowLabel as the handoff',
      });
      return;
    }
    // 自环 + 成环守卫：把已有接力线映射成 wouldCreateCycle 期望的 {fromTaskId,toTaskId} 边形（session id 入位）。
    // 接力交接 ≠ 任务依赖，故只取 relayHandoffs（不掺 Dependency）；成环会让接力画布派生 / 前端布局陷死循环。
    const existingEdges = (await store.listRelayHandoffs()).map((h) => ({
      fromTaskId: h.fromSessionId,
      toTaskId: h.toSessionId,
    }));
    if (wouldCreateCycle(existingEdges, fromSessionId, toSessionId)) {
      void reply.code(400).send({
        detail:
          fromSessionId === toSessionId
            ? 'self handoff not allowed'
            : 'relay handoff would create a cycle',
      });
      return;
    }
    // windowLabel 由 schema .min(1) 校验、经上方 cross-window 检查后随 parsed.data 整体落 createRelayHandoff。
    // IDENTITY-LITE actor 注入：身份模式覆盖 confirmedBy 为 session 身份；匿名模式沿用请求体。
    const handoffDraft = request.identity
      ? { ...parsed.data, confirmedBy: sessionActor(request.identity) }
      : parsed.data;
    const handoff = await store.createRelayHandoff(handoffDraft);
    void reply.code(201);
    return RelayHandoffResponseSchema.parse({ handoff });
  });

  // 接力交接线删除（DELETE /api/relay-handoffs/:id，R1）。命中删除 → 200；不存在 → 404。
  // POST/DELETE → 继承 H3 onRequest 鉴权 + 限流。删线只减边、不可能成环，无需守卫。
  app.delete('/api/relay-handoffs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = await store.deleteRelayHandoff(id);
    if (!ok) {
      void reply.code(404).send({ detail: 'relay handoff not found' });
      return;
    }
    return { deleted: id };
  });
}

export function buildHubServer(options: BuildHubServerOptions = {}): FastifyInstance {
  // H3（AUDIT-FIXES）：显式 bodyLimit 收口写端点请求体上限（默认 Fastify 1MB 仍偏大，配合 KB 整文件重写是
  // 低成本资源耗尽面，见 M17）；256KB 足够任务 / 结案录入。
  const app = Fastify({
    logger: false,
    bodyLimit: 256 * 1024,
    // 反代信任（默认 false）：开启后 request.ip 解析为转发的真实客户端 IP，限流才按客户端分桶
    // （见 BuildHubServerOptions.trustProxy；4177 反代部署须开，否则限流塌成全局单桶）。
    trustProxy: options.trustProxy ?? false,
  });
  const store: GovStore = options.store ?? new InMemoryGovStore();
  const clock: Clock =
    options.clock ?? new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW));
  // KB-CORE：知识库相似检索语料读出入口（缺省 InMemoryKbStore seed kbScenarioFixture），由 GET /api/kb/similar 消费。
  // invStore 仍只钉 options 字段、无消费方（INV 支柱落地时透传），符合 base 收口刀「扩展点先行、路由后置」节奏。
  const kbStore: KbStore = options.kbStore ?? new InMemoryKbStore();
  // INV-BOM-CORE：库存 / BOM 读写出入口（缺省 InMemoryInvStore seed inventoryScenarioFixture），由
  // GET /api/inventory + POST /api/inventory/{part-types,actions} 消费。独立于 GovStore（InventorySnapshot
  // 不在 GovernanceSnapshot 内）；车列复用 GovStore.listResources 的资源（显示 displayCode ?? name）。
  const invStore: InvStore = options.invStore ?? new InMemoryInvStore();
  // BASELINE-CORE：倒排基准线读写出入口（缺省 InMemoryBaselineStore seed baselineScenarioFixture，
  // 同 InMemoryInvStore 先例——demo 首屏「基准线 vs 实际」非空）。由 GET/PATCH /api/baseline +
  // POST /api/baseline/milestones/:id/pass 消费（S4）。
  const baselineStore: BaselineStore = options.baselineStore ?? new InMemoryBaselineStore();
  // 装配外壳（HUB-MODULARIZATION 第2步）：租户模块开关，缺省 = 机器人战队全 6 模块启用（与拆分前等价）。
  const tenantConfig: TenantConfig = options.tenantConfig ?? ROBOTICS_TENANT_CONFIG;

  // ── 轻身份登录（IDENTITY-LITE，D-083 §4.2）─────────────────────────────────────────────────
  // 缺省 anonymous = 现状零变化。identity 模式才建内存会话表 + 挂身份解析钩子 + 写门加会话要求。
  const identityMode: IdentityMode = options.identityMode ?? 'anonymous';
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

  // H3（AUDIT-FIXES 部署前必修）：写端点信任边界 = 共享密钥鉴权 + 每 IP 限流。
  // 作用于全部**写方法** /api/*（POST/PATCH/PUT/DELETE；读路由 GET/HEAD / 静态站 / health 不受影响）。
  // R1 接力画布引入 PATCH /api/resource-sessions/:id 与 DELETE /api/relay-handoffs/:id——若仍只认 POST，
  // 这两条会绕过鉴权 + 限流（旧注释「用 PATCH/DELETE 会绕过鉴权」正是此缺口）。这是让 I0 泄漏 / 环卡死 /
  // KB 撑爆被第三方真正触达的边界——未鉴权客户端不能刷爆全队要读的 dep-graph、不能猛打 closeout 撑爆 KB 文件。
  // 该钩子是宿主级横切关切（鉴权/限流），对全部模块统一生效，不随 enabledModules 变化。
  const writeToken = options.writeToken;
  const rateLimit = options.writeRateLimit ?? { max: 120, windowMs: 60_000 };
  const rateHits = new Map<string, { count: number; resetAt: number }>();
  const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
  app.addHook('onRequest', async (request, reply) => {
    if (!WRITE_METHODS.has(request.method) || !request.url.startsWith('/api/')) return;
    // 鉴权（配了 token 才强制 Bearer；未配=loopback dev 放行）
    if (writeToken && request.headers.authorization !== `Bearer ${writeToken}`) {
      void reply.code(401).send({ detail: 'unauthorized' });
      return reply;
    }
    // IDENTITY-LITE：身份模式下，写方法一律须携有效会话（否则 401）——**例外 = session 认证端点本身**
    // （POST/DELETE /api/session 是登录/登出入口，不能要求先有会话，否则永远登不进来）。匿名模式此段整段跳过。
    if (identityMode === 'identity') {
      const path = request.url.split('?')[0];
      const isSessionAuthEndpoint =
        path === '/api/session' &&
        (request.method === 'POST' || request.method === 'DELETE');
      if (!isSessionAuthEndpoint && !request.identity) {
        void reply.code(401).send({ detail: 'login required' });
        return reply;
      }
    }
    // 限流（真实墙钟 Date.now，与派生用的 clock 解耦；每实例独立、重启即重置）。
    // 分桶键 = request.ip：直连=源 IP；反代后须开 trustProxy（见上）才是真实客户端 IP，否则塌成全局单桶。
    const ip = request.ip;
    const nowMs = Date.now();
    const hit = rateHits.get(ip);
    if (!hit || nowMs >= hit.resetAt) {
      // 懒驱逐：rateHits 无 TTL 清理、按 IP 无界增长（长跑 / IP 轮换 / 扫描会撑大内存）。
      // 仅在 Map 超过阈值时一次性清掉已过窗口的死条目（O(n) 但极少触发），不引新依赖 / 不开后台定时器。
      if (rateHits.size > 10_000) {
        for (const [k, v] of rateHits) if (v.resetAt <= nowMs) rateHits.delete(k);
      }
      rateHits.set(ip, { count: 1, resetAt: nowMs + rateLimit.windowMs });
    } else if (hit.count >= rateLimit.max) {
      void reply.code(429).send({ detail: 'rate limit exceeded' });
      return reply;
    } else {
      hit.count += 1;
    }
  });

  const ctx: ModuleRouteCtx = {
    store,
    clock,
    kbStore,
    invStore,
    baselineStore,
    artifactMaxBytes: options.artifactMaxBytes ?? ARTIFACT_MAX_BYTES,
    identityMode,
  };
  const moduleEnabled = (id: ModuleId): boolean => isModuleEnabled(tenantConfig, id);

  // ── 会话端点（IDENTITY-LITE）：宿主级横切（非模块域），两模式均挂——GET 报模式+身份，
  // POST/DELETE 在匿名模式 404（明确禁用态）、身份模式行使登录/登出。────────────────────────────
  // GET /api/session：报当前部署模式 + 当前身份（未登录 / 匿名模式 → session:null）。读端点、不过写门。
  app.get('/api/session', async (request) => {
    return SessionResponseSchema.parse({
      mode: identityMode,
      session: request.identity ?? null,
    });
  });

  // POST /api/session（登录）：选人 + 可选 PIN。有 pinHash 须验 PIN（常量时间）；无 pinHash 免 PIN。
  // **防枚举**：人不存在 / PIN 错 / 该给 PIN 没给 → 统一 401「登录失败」，不区分原因。登录尝试受写门
  // 限流（POST /api/* 已过限流桶）。成功 → 签发 httpOnly cookie + 回带身份。匿名模式 → 404。
  app.post('/api/session', async (request, reply) => {
    if (identityMode !== 'identity' || !sessions) {
      void reply.code(404).send({ detail: '身份模式未启用' });
      return;
    }
    const parsed = SessionRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    const { memberId, pin } = parsed.data;
    const snapshot = await store.getSnapshot();
    const member = snapshot.members.find((m) => m.id === memberId);
    // 认证判定：无此人 → 失败；有 pinHash → 须给 pin 且 verifyPin 通过；无 pinHash → 免 PIN 直过。
    const authOk = member
      ? member.pinHash
        ? pin !== undefined && verifyPin(pin, member.pinHash)
        : true
      : false;
    if (!authOk || !member) {
      void reply.code(401).send({ detail: '登录失败' });
      return;
    }
    const identity: SessionIdentity = {
      memberId: member.id,
      displayName: member.displayName,
      groupId: member.groupId,
      role: member.role,
    };
    const token = sessions.create(identity);
    void reply.header('set-cookie', buildSessionCookie(token));
    return SessionResponseSchema.parse({ mode: 'identity', session: identity });
  });

  // DELETE /api/session（登出）：销毁会话 + 清 cookie（幂等，会话已过期也 200）。匿名模式 → 404。
  app.delete('/api/session', async (request, reply) => {
    if (identityMode !== 'identity' || !sessions) {
      void reply.code(404).send({ detail: '身份模式未启用' });
      return;
    }
    const token = readSessionCookie(request);
    if (token) sessions.destroy(token);
    void reply.header('set-cookie', clearSessionCookie());
    return SessionResponseSchema.parse({ mode: 'identity', session: null });
  });

  // 装配外壳核心：遍历 enabledModules → 挂载各域路由。未启用模块的函数根本不被调用，端点整段不挂
  // （§3.4-A；游戏工作室等租户可省 presence-schedule，此步无需拆 ScheduleStore——GovStore 的 schedule
  // 方法对未启用租户单纯不被调用即可，是最便宜实现）。system/pm-core 虽标"核心常装/必装"，装配层仍统一走
  // enabledModules 判断、不写结构性例外——常装与否由 TenantConfig 的内容体现。
  if (moduleEnabled('system')) {
    registerSystemRoutes(app);
  }
  if (moduleEnabled('archive')) {
    registerArchiveRoutes(app, ctx);
  }
  if (moduleEnabled('pm-core')) {
    registerPmCoreRoutes(app, ctx);
  }
  if (moduleEnabled('knowledge-base')) {
    registerKnowledgeBaseRoutes(app, ctx);
  }
  if (moduleEnabled('ledger')) {
    registerLedgerRoutes(app, ctx);
  }
  if (moduleEnabled('presence-schedule')) {
    registerPresenceScheduleRoutes(app, ctx);
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (await tryServeStaticConsole(request, reply, options.consoleDistDir)) {
      return;
    }

    void reply.code(404).send({ detail: 'Not found' });
  });

  return app;
}
