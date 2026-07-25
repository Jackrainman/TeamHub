import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative } from 'node:path';
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
  isBigTask,
  SystemStatusResponseSchema,
  buildCloseoutFromIssue,
  rankSimilarIssues,
  toDepGraphView,
  wouldCreateCycle,
  GroupGapsResponseSchema,
  deriveDirectionGaps,
  GroupsResponseSchema,
  SeasonsResponseSchema,
  CreateGroupRequestSchema,
  RenameGroupRequestSchema,
  GroupResponseSchema,
  deriveLeafGroups,
  CreateSeasonRequestSchema,
  CreateSeasonResponseSchema,
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
  // 门检查单 / 欠条（GATE-CHECKLIST-IOU，C3 路由）：读/写 + querystring 契约 + 过门硬闸判定核。
  ChecklistQuerySchema,
  ChecklistItemsResponseSchema,
  CreateChecklistItemRequestSchema,
  CreateChecklistItemResponseSchema,
  ClearChecklistItemRequestSchema,
  ClearChecklistItemResponseSchema,
  WaiveChecklistItemRequestSchema,
  WaiveChecklistItemResponseSchema,
  ChecklistTemplatesResponseSchema,
  listBlockingChecklistItems,
  // 挂单认领制窄写动作契约（TASK-POST-CLAIM，D-088）：认领/指派/搭档/跨组确认/完成/验收六条 POST
  // 子资源读写契约 + q= 子串搜历史任务的 querystring 契约（大任务判定 isBigTask 已在上方 import）。
  ClaimTaskRequestSchema,
  ClaimTaskResponseSchema,
  AssignTaskRequestSchema,
  AssignTaskResponseSchema,
  SetTaskPartnerRequestSchema,
  SetTaskPartnerResponseSchema,
  ConfirmCrossClaimRequestSchema,
  ConfirmCrossClaimResponseSchema,
  CompleteTaskRequestSchema,
  CompleteTaskResponseSchema,
  ReviewTaskRequestSchema,
  ReviewTaskResponseSchema,
  TasksQuerySchema,
} from './contracts.js';
import type {
  IssueCard,
  ScheduleSnapshot,
  ModuleId,
  TenantConfig,
  ActorRef,
  IdentityMode,
  SessionIdentity,
  DeploymentInfo,
  DeployConfig,
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
  ClearPinResponseSchema,
  // 门验收人名单维护（GATE-CHECKLIST-IOU，D-087 拍板②）：PUT /api/members/:id/gate-reviewer 读/写契约。
  SetGateReviewerRequestSchema,
  SetGateReviewerResponseSchema,
  // 成员角色维护 + 项目管理旗标授/收 + 初始化首个管理员（K1 权限地基 + MEMBER-PM-FLAG 刀②b）：
  // PUT /api/members/:id/role + PUT /api/members/:id/project-manager + POST /api/setup/super-admin。
  SetMemberRoleRequestSchema,
  SetMemberRoleResponseSchema,
  SetProjectManagerRequestSchema,
  SetProjectManagerResponseSchema,
  SetupSuperAdminRequestSchema,
  SetupSuperAdminResponseSchema,
  // 名册导入（ROSTER-IMPORT，K8）：CSV 模板生成 + 编码探测 + 手写零依赖解析器 + 导入报告契约。
  buildRosterTemplateCsv,
  decodeRosterBytes,
  parseRosterCsv,
  RosterImportReportSchema,
  // 验收人年级默认派生集合（GRADE-7-TIERS 刀⑥ 起由 contracts 导出，bootstrap 与 CSV 导入同源消费）。
  GATE_REVIEWER_DEFAULT_GRADES,
  // SETUP-WIZARD 刀①：正常模式 setup 状态回执（GET /api/setup/state → initialized:true）。
  SetupStateResponseSchema,
  // SETUP-WIZARD 刀③：部署配置写端点（PUT /api/setup/config 改 identityMode；graduate 转正式）。
  DeployConfigSchema,
  SetupConfigRequestSchema,
} from '@teamhub/hub-contracts';
import { ZodError } from 'zod';
import { isGateReviewer, isGroupLeadOf, isSuperAdmin, memberHasPmFlag } from './authz.js';
import { hashPin, verifyPin } from './identity/pin.js';
import { SessionManager } from './identity/session-store.js';
import { deriveErrorCode } from './kb/error-code.js';
import { FixedClock } from './clock.js';
import type { Clock } from './clock.js';
import { InMemoryGovStore } from './store/mock-gov-store.js';
import { InMemoryKbStore } from './store/mock-kb-store.js';
import { InMemoryInvStore } from './store/mock-inv-store.js';
import { InMemoryBaselineStore } from './store/mock-baseline-store.js';
import { InMemoryChecklistStore } from './store/mock-checklist-store.js';
import type { GovStore, InvStore, KbStore } from './store/gov-store.js';
import type { BaselineStore } from './store/baseline-store.js';
import type { ChecklistItemDraft, ChecklistStore } from './store/checklist-store.js';
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
// SETUP-WIZARD 刀③：转正式演示数据归档 + exit 42 重启码（与 setup 模式 build-setup-server 同一约定）。
import { archiveDemoData } from './demo-archive.js';
import { RESTART_EXIT_CODE } from './build-setup-server.js';

/**
 * 部署配置写通道运行时依赖（SETUP-WIZARD 刀③，setup-wizard.md §6）：设置页「部署配置」写区背后的
 * `PUT /api/setup/config`（改 identityMode）+ `POST /api/setup/graduate`（转正式）两端点所需。
 * **仅正常模式**（buildHubServer）注册这两端点——setup 模式那条链是 build-setup-server.ts，不进本函数，
 * 故两端点在 setup 模式天然 404。缺省 undefined → 两端点不注册（测试 / 无 config 上下文 → 404），
 * 由 main.ts 在正常模式装配时透传实参。**绝不含密钥**（同 deployment 纪律）。
 */
export interface SetupControl {
  /** config.json 落盘路径（改 identityMode / 转正式后重写这里，随后 exit 42 重启）。 */
  configFile: string;
  /** 当前部署配置（graduate 前置判 dataMode==='demo'；改 identityMode 时保留 dataMode/initializedAt/schemaVersion）。 */
  config: DeployConfig;
  /** 转正式时要归档的五域落盘文件路径（存在的才挪、不存在跳过）。归档落点 = configFile 所在目录 / demo-archive-<时间戳>/。 */
  dataFiles: readonly string[];
  /** 归档物文件目录（转正式时其内容整体挪进 demo-archive/artifacts/）；未配则跳过。 */
  artifactDir?: string;
  /** 时钟（默认真钟）：注入以便测试断言 demo-archive 目录时间戳确定。 */
  now?: () => Date;
  /** 退出函数（默认 process.exit）：注入以便测试断言退出码而不真杀进程。 */
  exit?: (code: number) => void;
  /** 受理后延迟退出的毫秒数（默认 500ms，给回执落地时间）；测试可调 0 免等待。 */
  restartDelayMs?: number;
}

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
   * 门检查单 / 欠条读写出入口（GATE-CHECKLIST-IOU，D-087；本刀 C2 落地、C3 挂路由）。独立于 `GovStore`
   * （`GateChecklistItem` 不进 `GovernanceSnapshot`，checklist.ts 头部红线），故走独立 `ChecklistStore`。
   * 缺省 `InMemoryChecklistStore`（seed `checklistScenarioFixture`——demo 首屏门检查单卡 / 告警区非空，
   * 同 InMemoryBaselineStore 先例）。本刀先钉 options 字段、无消费方；C3 由 `GET/POST /api/checklist` +
   * `POST /api/checklist/:id/{clear,waive}` + `GET /api/checklist/templates` 消费。
   */
  checklistStore?: ChecklistStore;
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
  /**
   * 部署信息（K3 部署信息刀）。main.ts 启动时收集「每域走哪种 store + 路径 / 启用模块 / 图纸开关 /
   * 构建标识 / 身份模式」这批运维定位事实，经此透传，由 `GET /api/system/status` 原样回显——设置页
   * 「部署信息」分区据此判断真实落盘 vs 内存态。**敏感值绝不进来**（WRITE_TOKEN 等）。缺省 undefined
   * （测试 / 内存 dev）→ status 不带 deployment 字段，旧客户端零影响。
   */
  deployment?: DeploymentInfo;
  /**
   * 部署配置写通道（SETUP-WIZARD 刀③）。给了才注册 `PUT /api/setup/config` + `POST /api/setup/graduate`
   * （否则两端点 404）。main.ts 在正常模式装配时透传 configFile / 当前 config / 五域落盘文件 / 归档物目录。
   */
  setupControl?: SetupControl;
}

// 归档物文件上传上限（50MB）：覆盖机械 CAD（step/stp/sldprt）+ 电路 PDF + 固件，又约束资源耗尽面。
const ARTIFACT_MAX_BYTES = 50 * 1024 * 1024;

// 名册导入 CSV 上限（ROSTER-IMPORT，K8）：1MB——纯文本花名册（几十人）绰绰有余，又约束资源耗尽面。
// 由 POST /api/roster/import 的 `request.file({ limits })` per-request 覆盖插件默认（插件默认 = 归档物上限）。
const ROSTER_MAX_BYTES = 1024 * 1024;

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

// ── PIN-DEADLOCK-RECOVERY（公测补强刀①，2026-07-24）：loopback 操作员判定 ─────────────────────
// 「唯一 superAdmin 忘 PIN = 完全死锁」（活体复现见 onboarding-pin-deadlock-2026-07-24.md §2 路径 A）的
// 逃生门：DELETE /api/members/:id/pin 对来自 loopback 的请求豁免 superAdmin 判定。**威胁模型**：宿主
// loopback 操作员本就能直接编辑 gov.json 清 pinHash（DEPLOY §7.1 手工兜底步骤），本豁免只是把手工编文件
// 降级为一条 curl，不引入新权限面；非 loopback 请求行为零变化。
// 判定规则：默认（trustProxy 未开）信**裸 socket 地址**——X-Forwarded-For 等转发头可伪造、坚决不吃；
// trustProxy 开启时裸 socket 是反代地址不可信，退而看 request.ip（此时它解析自转发头，SSH 隧道场景仍可用）。
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
function isLoopbackOperator(
  request: { ip: string; socket: { remoteAddress?: string } },
  trustProxy: boolean | string,
): boolean {
  const addr = trustProxy ? request.ip : request.socket.remoteAddress;
  return addr !== undefined && LOOPBACK_ADDRESSES.has(addr);
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
  // GATE-CHECKLIST-IOU：C3 起由 registerPmCoreRoutes 的 /api/checklist 系列 + 过门硬闸消费（本刀先钉字段）。
  checklistStore: ChecklistStore;
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
}

// ============================================================================
// system 模块（核心常装）：健康检查 / 系统状态 / BotChannel·AgentBackend·DataSource / 事件 / 桥接成员 / git repos。
// 完全通用（§3.3），无机器人词汇，任何租户都保留。
// ============================================================================
function registerSystemRoutes(
  app: FastifyInstance,
  deployment?: DeploymentInfo,
): void {
  app.get('/health', async () => {
    return HealthResponseSchema.parse(buildHealthResponse());
  });

  app.get('/api/system/status', async () => {
    const agentBackends = listMockAgentBackends();
    return SystemStatusResponseSchema.parse(
      buildSystemStatusResponse(agentBackends, deployment),
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
  const { store, clock } = ctx;

  // 归档物（图纸）文件上传：multipart 流式，单文件。**multipart 插件已在 buildHubServer 宿主级注册一次**
  // （见下方注册点——archive 图纸上传 + pm-core 名册导入共用，避免重复注册报错）；插件级 fileSize 默认 =
  // 归档物上限（artifactMaxBytes），本模块 `request.file()` 不传 per-request limits 即沿用该默认。
  // 全局 bodyLimit(256KB) 不约束 multipart，故上限靠插件 limits 钉；onRequest 鉴权/限流钩子先于 body 解析跑。

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
  const { store, clock, baselineStore, checklistStore, identityMode } = ctx;

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

  // 重置成员 PIN（DELETE /api/members/:id/pin，公测余项⑦ PIN-RESET）——「忘 PIN」的产品通道：此前连
  // superAdmin 也无重置入口、只能手工清落盘 pinHash（DEPLOY §7.1 的手工步骤即源于此缺口）。**身份模式
  // only**（匿名 → 404，照 PUT pin 先例）；**须 superAdmin**（isSuperAdmin 读实时名册，403——重置他人
  // 口令是敏感动作，匿名演示态无此概念）。**loopback 豁免（PIN-DEADLOCK-RECOVERY，公测补强刀①）**：
  // 请求来自 loopback（isLoopbackOperator）时跳过 superAdmin 判定直接放行——宿主操作员本就能直接编辑
  // gov.json 清 pinHash（DEPLOY §7.1 兜底），豁免只是把手工编文件降级为一条 curl，不引入新权限面；
  // 非 loopback 无变化（无会话仍被写门钩子 401、非 superAdmin 仍 403）。效果 = 清除目标 pinHash
  // （store.setMemberPin null 分支）：成员回到「无 pinHash 免 PIN」态，下次登录后经既有 PUT pin 首设
  // 流程（firstSetup）自行重设——本端点**绝不代收新 PIN 明文**（管理员不经手他人口令，密钥纪律延续）。
  // 响应走 ClearPinResponseSchema（剥 pinHash）。
  app.delete<{ Params: { id: string } }>('/api/members/:id/pin', async (request, reply) => {
    if (identityMode !== 'identity') {
      void reply.code(404).send({ detail: '身份模式未启用' });
      return;
    }
    const { id } = request.params;
    const snapshot = await store.getSnapshot();
    // loopback 操作员豁免 superAdmin（威胁模型见 isLoopbackOperator 注释）。
    if (
      !isLoopbackOperator(request, ctx.trustProxy) &&
      !isSuperAdmin(snapshot.members, request.identity?.memberId ?? '')
    ) {
      void reply.code(403).send({ detail: '该操作需管理员（superAdmin）' });
      return;
    }
    const target = snapshot.members.find((m) => m.id === id);
    if (!target) {
      void reply.code(404).send({ detail: 'member not found' });
      return;
    }
    const updated = await store.setMemberPin(id, null);
    if (!updated) {
      void reply.code(404).send({ detail: 'member not found' });
      return;
    }
    // MemberPublicSchema.parse 剥 pinHash（密钥纪律）——回带公开视图。
    return ClearPinResponseSchema.parse({ member: MemberPublicSchema.parse(updated) });
  });

  // 初始化首个管理员（POST /api/setup/super-admin，K1 权限地基 + MEMBER-PM-FLAG 旗标化 + SETUP-WIZARD-ROSTER
  // 刀② bootstrap 扩展）。**身份模式 only**（匿名 → 404，照 PUT pin 先例）。前置=名册尚无任何持「项目管理」
  // 旗标成员（否则 409——一次性初始化门，已有管理员后授/收旗走 PUT project-manager）。**两路径**：
  //  - 老路径（无 displayName）：须已登录，给 session 本人授旗 + 同笔设 pinHash（先 pin 后旗，防"无 PIN
  //    管理员被免密冒用"）。
  //  - bootstrap 路径（刀② v2「先问你是谁」，给 displayName）：**豁免登录**（写门钩子已放过本路由，
  //    此处自判——解开"名册无管理员 → 无人能登录 → 无法初始化"死锁）。按姓名认领既有成员行，或顺带新建
  //    （groupName 必填、importRoster 单行复用建组+建人；asGroupLead → role:groupAdmin 组长申报；grade 由
  //    初始化门年级下拉传入（GRADE-7-TIERS 刀⑥ 七档），缺省 freshman），一笔落库 = 建人 + 授旗
  //    （projectManager 缺省 true）+ 设 PIN + **签发会话 cookie（登录态）**。操作者由此必在名册（原"操作者
  //    不在 CSV"问题消解；残余 edge = CSV 同名错拼会 upsert 出重名人，导入报告回显 created 可肉眼发现）。
  // 响应经 MemberPublicSchema 剥 pinHash（密钥纪律）。
  app.post('/api/setup/super-admin', async (request, reply) => {
    if (identityMode !== 'identity') {
      void reply.code(404).send({ detail: '身份模式未启用' });
      return;
    }
    const parsed = SetupSuperAdminRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    const snapshot = await store.getSnapshot();
    if (snapshot.members.some((m) => memberHasPmFlag(m))) {
      void reply.code(409).send({ detail: '已存在管理员（项目管理旗标）' });
      return;
    }
    let memberId: string;
    if (parsed.data.displayName) {
      // bootstrap 路径：按姓名认领既有成员（groupName 忽略），或新建成员行。
      const existing = snapshot.members.find(
        (m) => m.displayName === parsed.data.displayName,
      );
      if (existing) {
        memberId = existing.id;
      } else {
        if (!parsed.data.groupName) {
          void reply.code(400).send({ detail: '新建成员需提供所在组' });
          return;
        }
        // 复用 importRoster 单行（组按名 upsert + 建人 role=member）；验收人沿用年级默认派生（刀③ 同律，
        // 刀⑥ 起派生集合直接消费 contracts GATE_REVIEWER_DEFAULT_GRADES，不再手列枚举）。
        const grade = parsed.data.grade ?? 'freshman';
        const reviewer = GATE_REVIEWER_DEFAULT_GRADES.has(grade);
        const importOutcome = await store.importRoster([
          {
            displayName: parsed.data.displayName,
            grade,
            groupName: parsed.data.groupName,
            gateReviewer: reviewer,
            gateReviewerAuto: reviewer,
          },
        ]);
        // 刀④：groupName 命中非叶子/哨兵组（如手填「程序」命中 grp-program）→ importRoster 拒行，
        // 此处转 400 把原因摆给操作者（初始化门组候选本就只列叶子组，这是自由文本兜底的防线）。
        if (importOutcome.failed.length > 0) {
          void reply.code(400).send({ detail: importOutcome.failed[0].reason });
          return;
        }
        const after = await store.getSnapshot();
        const created = after.members.find(
          (m) => m.displayName === parsed.data.displayName,
        );
        if (!created) {
          void reply.code(500).send({ detail: 'bootstrap 建成员失败' });
          return;
        }
        memberId = created.id;
        // 组长申报：新建成员 role→groupAdmin（队长兼组长 = groupAdmin + 旗标，刀②b 正交）。
        if (parsed.data.asGroupLead) {
          await store.setMemberRole(memberId, 'groupAdmin');
        }
      }
    } else {
      // 老路径：须有会话（设置页「初始化管理员」卡——操作登录本人）。
      const selfId = request.identity?.memberId;
      if (!selfId) {
        void reply.code(401).send({ detail: 'login required' });
        return;
      }
      memberId = selfId;
    }
    // 先设 pin（防授旗后 pin 落库失败 → 无 PIN 管理员），再授旗（缺省 true）。
    const pinned = await store.setMemberPin(memberId, hashPin(parsed.data.pin));
    if (!pinned) {
      void reply.code(404).send({ detail: 'member not found' });
      return;
    }
    if (parsed.data.projectManager !== false) {
      // 授旗无并发收旗风险（初始化门前置=名册零持旗成员，本笔是造第一个），不传 guard。
      await store.setProjectManager(memberId, true);
    }
    // 一笔落库最后一环 = 登录态：签发会话 cookie（刀②——操作者无需再登一次）。
    const finalSnap = await store.getSnapshot();
    const member = finalSnap.members.find((m) => m.id === memberId);
    if (!member) {
      void reply.code(404).send({ detail: 'member not found' });
      return;
    }
    if (ctx.sessions) {
      const identity: SessionIdentity = {
        memberId: member.id,
        displayName: member.displayName,
        groupId: member.groupId,
        role: member.role,
        gateReviewer: member.gateReviewer,
        projectManager: member.projectManager,
      };
      const token = ctx.sessions.create(identity);
      void reply.header('set-cookie', buildSessionCookie(token));
    }
    return SetupSuperAdminResponseSchema.parse({
      member: MemberPublicSchema.parse(member),
    });
  });

  // ── 名册批量导入（ROSTER-IMPORT，K8 —— minor v0.25.0）────────────────────────────────────────
  // 名册此前无任何增删通道（唯一来源 = demo seed 落盘）；身份模式 + 空板 = 登录死锁。本对端点解开它。

  // GET /api/roster/template：下载 CSV 模板（读端点、不过写门）。UTF-8 带 BOM（Excel 直开不乱码）+
  // Content-Disposition 附件下载。表头 = 姓名,年级,组（刀③ 三列；仅表头行；列说明放前端文案、不进 CSV）。
  app.get('/api/roster/template', async (_request, reply) => {
    void reply.header(
      'content-disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent('名册模板.csv')}`,
    );
    void reply.type('text/csv; charset=utf-8');
    return buildRosterTemplateCsv();
  });

  // POST /api/roster/import：上传 CSV（multipart，单文件 1MB 上限，照 artifact upload 先例）。
  // **鉴权（引导豁免，K8 拍板⑤）**：匿名模式 = 宿主级写门即可（onRequest 钩子已过 Bearer + 限流）；
  // 身份模式 = 须 superAdmin（isSuperAdmin，403），**但名册完全为空时豁免登录要求**——bootstrap：
  // members.length===0 时免 session 放行（解开空板死锁：无人可选 → 无法登录 → 无法初始化管理员），
  // 一旦有人即恢复须 superAdmin。全局写门钩子已把本路由排除在「须有会话」硬门之外（isRosterBootstrap），
  // 故此处自行做完整鉴权。**编码探测**：decodeRosterBytes（UTF-8 BOM / 无 BOM UTF-8 / 回退 gbk），都失败 → 400。
  // **解析**：parseRosterCsv（手写零依赖，坏行进报告不中断整批）；**应用**：store.importRoster（displayName
  // 幂等 upsert + 自动建组 + role/pinHash/旗标永不动 + missingFromSheet 绝不删）。响应 = 六段导入报告（I0：
  // 全是名单事实回显给操作者本人，不落任何聚合统计）。
  app.post('/api/roster/import', async (request, reply) => {
    const snapshot = await store.getSnapshot();
    const emptyRoster = snapshot.members.length === 0;
    if (identityMode === 'identity' && !emptyRoster) {
      // 名册非空：恢复须 superAdmin（fail-closed，另读实时名册；无会话 → 401，非管理员 → 403）。
      if (!request.identity) {
        void reply.code(401).send({ detail: 'login required' });
        return;
      }
      if (!isSuperAdmin(snapshot.members, request.identity.memberId)) {
        void reply.code(403).send({ detail: '该操作需管理员（superAdmin）' });
        return;
      }
    }
    let data;
    try {
      // per-request limits 覆盖插件默认（宿主级 multipart 插件默认 = 归档物上限），钉名册 1MB。
      data = await request.file({ limits: { fileSize: ROSTER_MAX_BYTES, files: 1 } });
    } catch {
      void reply.code(400).send({ detail: '请求体不是 multipart 表单' });
      return;
    }
    if (!data) {
      void reply.code(400).send({ detail: '未收到文件' });
      return;
    }
    let buf: Buffer;
    try {
      buf = await data.toBuffer();
    } catch (err) {
      if ((err as { code?: string })?.code === 'FST_REQ_FILE_TOO_LARGE') {
        void reply.code(413).send({ detail: '文件过大（上限 1MB）' });
        return;
      }
      void reply.code(400).send({ detail: '读取文件失败' });
      return;
    }
    if (data.file.truncated) {
      void reply.code(413).send({ detail: '文件过大（上限 1MB）' });
      return;
    }
    const text = decodeRosterBytes(buf);
    if (text === null) {
      void reply.code(400).send({ detail: '编码无法识别，请另存为 CSV UTF-8' });
      return;
    }
    const { rows, errors } = parseRosterCsv(text);
    const outcome = await store.importRoster(rows);
    return RosterImportReportSchema.parse({
      created: outcome.created,
      updated: outcome.updated,
      // 坏行 = 解析层 errors + store 侧拒行（刀④：组名命中非叶子/哨兵组，抽象汇报视角不可挂人）。
      failed: [...errors, ...outcome.failed],
      missingFromSheet: outcome.missingFromSheet,
      createdGroups: outcome.createdGroups,
      autoReviewers: outcome.autoReviewers,
    });
  });

  // 组只读列表（PHASE2-CONSOLE-ASSEMBLY）：console TodayPlanTable 原借 dep-graph 节点反查组名当临时
  // 数据源（节点集合=任务派生视图，没有任务的组不出现在里面、下拉会漏项）；GroupsResponseSchema 早有
  // 契约（pm-core.ts）却零消费方，这里补上语义正确的直读端点。
  // **刀④ PROGRAM-GROUP-ABSTRACT**：`groups` 保持全量（组树展示 / 汇报视角需要非叶子组「程序」与哨兵组
  // 「全组联调」在场），响应补派生位 `assignableGroupIds` = 叶子组且非哨兵（deriveLeafGroups 结构派生，
  // 零 Group schema 改动）——写入口校验与前端候选过滤统一消费这个「可选组」集合。
  app.get('/api/groups', async () => {
    const snapshot = await store.getSnapshot();
    return GroupsResponseSchema.parse({
      groups: snapshot.groups,
      assignableGroupIds: deriveLeafGroups(snapshot.groups),
    });
  });

  // ── 组管理最小版（PROGRAM-GROUP-ABSTRACT 刀④，D-072「设置页可增减组」前置缺口）─────────────────
  // 叶子组可新建 / 改名；删除防孤儿（有成员/有子组/有任务 → 409）；非叶子/哨兵组（汇报视角）不可改名
  // 不可删（not-leaf → 409）。守卫全收在 store 方法同一临界区（判与写不分离，照 setProjectManager 先例）。
  // **鉴权**（照 PUT /api/members/:id/role 邻位范式）：匿名模式=宿主级写门即可；身份模式=须持旗管理员
  // （isSuperAdmin 读旗标，403）。写方法 /api/* 天然过 H3 onRequest 写门（Bearer + 限流 + 身份模式须有会话）。

  // POST /api/groups：新建叶子组（只有 name；id/seasonId/parentGroupId=null/kind 由 store 钉）。
  // 同名（含非叶子/哨兵组）→ 409（组名是 importRoster 的匹配键，重名会静默错挂）。
  app.post('/api/groups', async (request, reply) => {
    const parsed = CreateGroupRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    if (identityMode === 'identity') {
      const snapshot = await store.getSnapshot();
      if (!isSuperAdmin(snapshot.members, request.identity?.memberId ?? '')) {
        void reply.code(403).send({ detail: '该操作需管理员（项目管理旗标）' });
        return;
      }
    }
    const result = await store.createGroup({ name: parsed.data.name.trim() });
    if (!result.ok) {
      void reply.code(409).send({ detail: `组「${parsed.data.name}」已存在` });
      return;
    }
    void reply.code(201);
    return GroupResponseSchema.parse({ group: result.group });
  });

  // PUT /api/groups/:id：组改名，**仅叶子组可改**（非叶子/哨兵 = 汇报视角 → 409）；撞同名 → 409；
  // id 不存在 → 404。
  app.put<{ Params: { id: string } }>('/api/groups/:id', async (request, reply) => {
    const { id } = request.params;
    const parsed = RenameGroupRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    if (identityMode === 'identity') {
      const snapshot = await store.getSnapshot();
      if (!isSuperAdmin(snapshot.members, request.identity?.memberId ?? '')) {
        void reply.code(403).send({ detail: '该操作需管理员（项目管理旗标）' });
        return;
      }
    }
    const result = await store.renameGroup(id, parsed.data.name.trim());
    if (!result.ok) {
      if (result.reason === 'not-found') {
        void reply.code(404).send({ detail: 'group not found' });
      } else if (result.reason === 'not-leaf') {
        void reply.code(409).send({ detail: '汇报视角组（含子组或是联调哨兵组）不可改名' });
      } else {
        void reply.code(409).send({ detail: `组「${parsed.data.name}」已存在` });
      }
      return;
    }
    return GroupResponseSchema.parse({ group: result.group });
  });

  // DELETE /api/groups/:id：删组，**仅叶子组可删** + 防孤儿——有成员 / 有子组 / 有任务引用 → 409
  // （先迁走再删，不制造悬空引用）；非叶子/哨兵 → 409；id 不存在 → 404。响应回带被删的组。
  app.delete<{ Params: { id: string } }>('/api/groups/:id', async (request, reply) => {
    const { id } = request.params;
    if (identityMode === 'identity') {
      const snapshot = await store.getSnapshot();
      if (!isSuperAdmin(snapshot.members, request.identity?.memberId ?? '')) {
        void reply.code(403).send({ detail: '该操作需管理员（项目管理旗标）' });
        return;
      }
    }
    const result = await store.deleteGroup(id);
    if (!result.ok) {
      if (result.reason === 'not-found') {
        void reply.code(404).send({ detail: 'group not found' });
      } else {
        const detail =
          result.reason === 'not-leaf'
            ? '汇报视角组（含子组或是联调哨兵组）不可删除'
            : result.reason === 'has-children'
              ? '该组下有子组，不能删除'
              : result.reason === 'has-members'
                ? '该组下还有成员，先迁走成员再删'
                : '该组下还有任务，先迁走任务再删';
        void reply.code(409).send({ detail });
      }
      return;
    }
    return GroupResponseSchema.parse({ group: result.group });
  });

  // 赛季只读列表（S1 接线，product-redefine-2026-07 §4.1/§9-①）：SeasonSchema/SeasonsResponseSchema
  // 此前是死脚手架（从未接线、无端点）；照 GET /api/groups 先例直读快照。倒排基准线
  // （BASELINE-DESIGN）的 SeasonBaseline.seasonId 引用本端点返回的实体，而非仅裸字符串。
  app.get('/api/seasons', async () => {
    const snapshot = await store.getSnapshot();
    return SeasonsResponseSchema.parse({ seasons: snapshot.seasons });
  });

  // 赛季创建（SEASON-CREATE 补链路）：S1 接线时写口曾注记"待身份功能落地再开"——IDENTITY-LITE
  // 已落地（写门禁 onRequest 钩子覆盖所有 POST /api/*，本路由天然被罩），此处兑现。总览页空态
  // 文案"先在设置里建一个赛季"此前指向不存在的入口（悬空承诺），设置页「赛季」分区随本端点补齐。
  // 语义=宣告新的当前赛季：status 恒由服务端钉 active，旧 active 由 store 同笔转 archived
  // （一届一个当前赛季）。同名拒绝（400）；endsAt 早于 startsAt 拒绝（400）。
  app.post('/api/seasons', async (request, reply) => {
    const parsed = CreateSeasonRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    const snapshot = await store.getSnapshot();
    // 敏感门收口（K1）：身份模式下建赛季须 superAdmin（fail-closed，另读实时名册）；匿名模式跳过（写门即可）。
    if (
      identityMode === 'identity' &&
      !isSuperAdmin(snapshot.members, request.identity?.memberId ?? '')
    ) {
      void reply.code(403).send({ detail: '该操作需管理员（superAdmin）' });
      return;
    }
    const { name, startsAt, endsAt } = parsed.data;
    if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      void reply.code(400).send({ detail: 'endsAt must be after startsAt' });
      return;
    }
    if (snapshot.seasons.some((s) => s.name === name)) {
      void reply.code(400).send({ detail: `season name already exists: ${name}` });
      return;
    }
    const season = await store.createSeason({ name, startsAt, endsAt: endsAt ?? null });
    void reply.code(201);
    return CreateSeasonResponseSchema.parse({ season });
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
      // ── 过门硬闸（GATE-CHECKLIST-IOU 设计 §2 唯一硬闸；D-087）─────────────────────────────────
      // 门判定只有一条规则：挂该门的检查项 / 欠条全部非 pending，门才可过。落在 evidenceRefs 孤儿校验之后、
      // passMilestone 调用之前，照 evidenceRefs「读另一 store、命中即 400」同形先例。**仅 status==='passed'
      // 才拦**：status==='missed'（记录验收失败）不拦——门没过，欠条自然还挂着，硬闸只防「凑合的雷带着过门」
      // 而非阻止如实记录失败（架构裁定，记入 deviations）。该赛季无基准线时 baseline 为 null，跳过硬闸交由
      // passMilestone 返回 null → 404 处理。
      if (bodyParsed.data.status === 'passed') {
        const baseline = await baselineStore.getBaseline(queryParsed.data.seasonId);
        if (baseline) {
          const items = await checklistStore.listItems(baseline.id);
          const blocking = listBlockingChecklistItems(items, milestoneId);
          if (blocking.length > 0) {
            const titles = blocking.map((it) => it.title).join('、');
            void reply.code(400).send({ detail: `检查项未清：${titles}` });
            return;
          }
        }
      }
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
  // **刀④ PROGRAM-GROUP-ABSTRACT**：groupId 命中组表里的非叶子/哨兵组（如 grp-program / grp-convergence，
  // deriveLeafGroups 结构派生）→ 400——任务只能挂具体叶子组（汇报视角组不可领任务）；组表里**不存在**的
  // id 维持既有宽松（历史任务可引用未入表的组，PmCreatePanel 兜底合并同律）。
  app.post('/api/tasks', async (request, reply) => {
    const parsed = CreateTaskRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    const snapshot = await store.getSnapshot();
    const knownGroup = snapshot.groups.find((g) => g.id === parsed.data.groupId);
    if (knownGroup && !deriveLeafGroups(snapshot.groups).includes(knownGroup.id)) {
      void reply
        .code(400)
        .send({ detail: `组「${knownGroup.name}」是汇报视角（含子组或是联调哨兵组），任务请挂到其下的具体小组` });
      return;
    }
    const task = await store.createTask(parsed.data);
    void reply.code(201);
    return CreateTaskResponseSchema.parse({ task });
  });

  // PM 读视图：任务列表（看板列 / 列表双视图的读原语）。Task 无 confirmedBy、ownerId 只表「谁负责」(D-041 安全堆)，
  // 无完成量维度（C2/I0 安全）；依赖/缺口的结构视图走 GET /api/dep-graph（blockedByLabel 上游任务名，不暴露人）。
  // **q= 子串搜历史任务**（TASK-POST-CLAIM §3 "看谁做过这个问题"）：大小写不敏感搜 title/rawSummary，搜到
  // 后自己去联系做过的人（ownerLabel/ownerId 本就公开）。**红线**：只做子串过滤返回任务列表，**永不聚合
  // 成"技能画像/花名册"、永不按人筛选**（唯一例外=我的视图，不在此）。缺省 q → 返回全部（向后兼容）。
  app.get('/api/tasks', async (request, reply) => {
    const parsed = TasksQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error, 'invalid query') });
      return;
    }
    const snapshot = await store.getSnapshot();
    const q = parsed.data.q?.toLowerCase();
    const matched = q
      ? snapshot.tasks.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.rawSummary.toLowerCase().includes(q),
        )
      : snapshot.tasks;
    // 大任务判定下沉后端（体检 D5，TASK-POST-CLAIM）：逐任务带 isBig——board 视图不查依赖图边
    // （边只在 dep-graph 查询可见），故判定后端用 isBigTask(task, dependencies) 算好吐前端。
    // isBig 用**全量** dependencies 算（q 过滤只作用于展示、不改结构判定）。
    const tasks = matched.map((task) => ({
      ...task,
      isBig: isBigTask(task, snapshot.dependencies),
    }));
    return TasksResponseSchema.parse({ tasks });
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

  // ── 挂单认领制窄写路由（TASK-POST-CLAIM，D-088 / docs/design/task-post-claim.md）──────────────────
  // 六条 POST 子资源动作（claim/assign/partner/confirm-cross-claim/complete/review）——POST 继承 H3 写门
  // （Bearer 鉴权 + 限流；用 PATCH/DELETE 会绕过）。actor 注入照 sessionActor 6 处先例：身份模式
  // request.identity → sessionActor（本人 / 组长 / 验收人 = 登录人，不信客户端自报），匿名模式取 body 留名
  // 字段，二者皆缺 → 400「必须留名」。**红线（D-085）**：留名只落**单条任务卡**，本簇绝不派生任何按人
  // 聚合/排行/按人筛选（唯一例外 = 我的视图本人过滤，不在此）。

  // POST /api/tasks/:taskId/claim（§3 认领）：登录本人一键领挂单，**即生效零审批**（唯一硬闸在门上）。
  // 认领人 = identity.memberId 或 body.memberId（缺 → 400）；须命中名册（防孤儿 → 400）；已有主 → 409
  //（不覆盖他人的活）。store.claimTask 置 ownerId + claimedAt + pending→inProgress。
  app.post('/api/tasks/:taskId/claim', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const parsed = ClaimTaskRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    const memberId = request.identity?.memberId ?? parsed.data.memberId;
    if (!memberId) {
      void reply.code(400).send({ detail: '认领必须留名（memberId）' });
      return;
    }
    const snapshot = await store.getSnapshot();
    const task = snapshot.tasks.find((t) => t.id === taskId);
    if (!task) {
      void reply.code(404).send({ detail: 'task not found' });
      return;
    }
    if (!snapshot.members.some((m) => m.id === memberId)) {
      void reply.code(400).send({ detail: '认领人不在名册' });
      return;
    }
    if (task.ownerId !== null) {
      void reply.code(409).send({ detail: '任务已有负责人（挂单已被认领）' });
      return;
    }
    const claimed = await store.claimTask(taskId, memberId, clock.now().toISOString());
    if (!claimed) {
      void reply.code(404).send({ detail: 'task not found' });
      return;
    }
    return ClaimTaskResponseSchema.parse({ task: claimed });
  });

  // POST /api/tasks/:taskId/assign（§3 指派 / 转派，**同路由**）：组长选人 + 强制理由（schema min1）。鉴权 =
  // actor 须为该任务 groupId 的组长（isGroupLeadOf，403）；两模式统一按名册核（同阶段1 waive 先例）。
  // store.assignTask 置 ownerId + assignReason + assignedBy，清 claimedAt / 搭档 / 跨组确认（换主失效）。
  app.post('/api/tasks/:taskId/assign', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const parsed = AssignTaskRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    const actor: ActorRef | undefined = request.identity
      ? sessionActor(request.identity)
      : parsed.data.assignedBy;
    if (!actor) {
      void reply.code(400).send({ detail: '指派必须留名（assignedBy）' });
      return;
    }
    const snapshot = await store.getSnapshot();
    const task = snapshot.tasks.find((t) => t.id === taskId);
    if (!task) {
      void reply.code(404).send({ detail: 'task not found' });
      return;
    }
    if (!isGroupLeadOf(snapshot.members, actor.id, task.groupId)) {
      void reply.code(403).send({ detail: '指派权属该组组长' });
      return;
    }
    // 防孤儿 ownerId（与 claim / partner 的名册校验对称）：组长虽已过 403 授权门，但指派对象
    // 若不在名册会落一个永远无人认账的 ownerId（复审 nit 收口）。
    if (!snapshot.members.some((m) => m.id === parsed.data.ownerId)) {
      void reply.code(400).send({ detail: '指派对象不在名册' });
      return;
    }
    const assigned = await store.assignTask(
      taskId,
      parsed.data.ownerId,
      parsed.data.reason,
      actor,
      clock.now().toISOString(),
    );
    if (!assigned) {
      void reply.code(404).send({ detail: 'task not found' });
      return;
    }
    return AssignTaskResponseSchema.parse({ task: assigned });
  });

  // POST /api/tasks/:taskId/partner（§4 本组搭档位）：外组认领后本组补位（师傅 / 对接人）。partnerMemberId
  // 须命中名册且与 task 同组（"本组"搭档，否则 400）。**不设发起人鉴权**（组长默认可自任 / 本组自愿补位，
  // 写门即可——记 deviations）。显式缺口黄标，不硬阻塞（A1 先例）。
  app.post('/api/tasks/:taskId/partner', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const parsed = SetTaskPartnerRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    const snapshot = await store.getSnapshot();
    const task = snapshot.tasks.find((t) => t.id === taskId);
    if (!task) {
      void reply.code(404).send({ detail: 'task not found' });
      return;
    }
    const partner = snapshot.members.find((m) => m.id === parsed.data.partnerMemberId);
    if (!partner) {
      void reply.code(400).send({ detail: '搭档不在名册' });
      return;
    }
    if (partner.groupId !== task.groupId) {
      void reply.code(400).send({ detail: '搭档须为本组成员（跨组是学习通道，不是甩锅通道）' });
      return;
    }
    const updated = await store.setTaskPartner(
      taskId,
      parsed.data.partnerMemberId,
      clock.now().toISOString(),
    );
    if (!updated) {
      void reply.code(404).send({ detail: 'task not found' });
      return;
    }
    return SetTaskPartnerResponseSchema.parse({ task: updated });
  });

  // POST /api/tasks/:taskId/confirm-cross-claim（§4 跨组大任务组长事后确认）：**非启动闸**（认领已即生效），
  // 仅事实卡留名 crossClaimConfirmedBy。鉴权 = actor 须为该任务 groupId 的组长（isGroupLeadOf，403）。
  // actor 注入同 assign（身份模式 sessionActor / 匿名模式 body.confirmedBy）。
  app.post('/api/tasks/:taskId/confirm-cross-claim', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const parsed = ConfirmCrossClaimRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    const actor: ActorRef | undefined = request.identity
      ? sessionActor(request.identity)
      : parsed.data.confirmedBy;
    if (!actor) {
      void reply.code(400).send({ detail: '确认必须留名（confirmedBy）' });
      return;
    }
    const snapshot = await store.getSnapshot();
    const task = snapshot.tasks.find((t) => t.id === taskId);
    if (!task) {
      void reply.code(404).send({ detail: 'task not found' });
      return;
    }
    if (!isGroupLeadOf(snapshot.members, actor.id, task.groupId)) {
      void reply.code(403).send({ detail: '跨组确认权属该组组长' });
      return;
    }
    const updated = await store.confirmCrossClaim(taskId, actor, clock.now().toISOString());
    if (!updated) {
      void reply.code(404).send({ detail: 'task not found' });
      return;
    }
    return ConfirmCrossClaimResponseSchema.parse({ task: updated });
  });

  // POST /api/tasks/:taskId/complete（§5 标完成）：本人标完成 + 留名（简单活即算完；大活标完成后验收态仍
  // 是 awaitingReview，须学长 review 才 accepted——deriveTaskAcceptance 派生）。**无鉴权**（本人标完成，
  // 写门即可）。actor = completedBy。
  app.post('/api/tasks/:taskId/complete', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const parsed = CompleteTaskRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    const actor: ActorRef | undefined = request.identity
      ? sessionActor(request.identity)
      : parsed.data.completedBy;
    if (!actor) {
      void reply.code(400).send({ detail: '完成必须留名（completedBy）' });
      return;
    }
    const updated = await store.completeTask(taskId, actor, clock.now().toISOString());
    if (!updated) {
      void reply.code(404).send({ detail: 'task not found' });
      return;
    }
    return CompleteTaskResponseSchema.parse({ task: updated });
  });

  // POST /api/tasks/:taskId/review（§5 学长验收 / 抽查）：鉴权 = actor 须在**验收人名单**（isGateReviewer，
  // 403——**验收人名单与欠条豁免名单同一张** `Member.gateReviewer`，D-087 拍板② 语义一致，记 deviations）。
  // accept = 验收留名（status 保持 done，deriveTaskAcceptance→accepted）；reject（打回）= status→inProgress +
  // reviewNote 打回理由。actor 注入同 assign（身份模式 sessionActor / 匿名模式 body.reviewedBy）。
  app.post('/api/tasks/:taskId/review', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const parsed = ReviewTaskRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    const actor: ActorRef | undefined = request.identity
      ? sessionActor(request.identity)
      : parsed.data.reviewedBy;
    if (!actor) {
      void reply.code(400).send({ detail: '验收必须留名（reviewedBy）' });
      return;
    }
    // 验收鉴权（与欠条豁免同一张 gateReviewer 名册）：fail-closed，非验收人 → 403。
    const snapshot = await store.getSnapshot();
    if (!isGateReviewer(snapshot.members, actor.id)) {
      void reply.code(403).send({ detail: '验收权属验收人名单（大三）' });
      return;
    }
    // 前置判：验收/抽查只对已标完成（done）的任务有意义（§5 两档都发生在完成之后）。放开会让
    // 验收人对从未 done 的任务盖章打回——TaskDetailDrawer 的「被打回」派生会呈现从未发生过的事实
    //（复审 nit 收口）。非 done → 409（资源状态冲突，照 checklist clear/waive 先例）。
    const target = snapshot.tasks.find((t) => t.id === taskId);
    if (!target) {
      void reply.code(404).send({ detail: 'task not found' });
      return;
    }
    if (target.status !== 'done') {
      void reply.code(409).send({ detail: '任务尚未标完成，无法验收/打回（先 complete）' });
      return;
    }
    const updated = await store.reviewTask(
      taskId,
      actor,
      parsed.data.outcome,
      parsed.data.note,
      clock.now().toISOString(),
    );
    if (!updated) {
      void reply.code(404).send({ detail: 'task not found' });
      return;
    }
    return ReviewTaskResponseSchema.parse({ task: updated });
  });
  // ── 挂单认领制窄写路由结束 ───────────────────────────────────────────────────────────────────────

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

  // ── 门检查单 / 欠条（GATE-CHECKLIST-IOU，C3 路由；docs/design/gate-checklist-iou.md §2/§3，D-087）──────
  // 同域挂在 pm-core（与 baseline 三路由相邻——检查项挂在 SeasonBaseline 的门/里程碑下）。seasonId 走
  // querystring（照 GET/PATCH /api/baseline 同族风格）。写路由（POST/PUT）继承宿主级 H3 onRequest 写门钩子
  // （Bearer 鉴权 + 限流 + 身份模式登录要求），不另写鉴权底座；豁免的「验收人名单」授权是本域业务门、另做。
  // 红线：读契约带名不剥（clearedBy/waivedBy = D-085 事实层）；本域绝不建按人聚合/排行/按人筛选端点。

  // clear/waive 返回 null 时的 404 / 409 判别（store 层 null 不区分「不存在」与「非 pending」——C2 交接）：
  // 按赛季基准线 listItems 找该 id，存在 = 已非 pending（已清 / 已豁免）→ 409 Conflict；不存在 → 404。
  // 409 是本域首次引入（库里此前无 409 先例）——语义正确的「资源状态冲突」，记入 deviations。
  const replyClearWaiveNotApplied = async (
    reply: import('fastify').FastifyReply,
    itemId: string,
    seasonId: string,
    action: string,
  ): Promise<void> => {
    const baseline = await baselineStore.getBaseline(seasonId);
    const exists = baseline
      ? (await checklistStore.listItems(baseline.id)).some((it) => it.id === itemId)
      : false;
    if (exists) {
      void reply.code(409).send({ detail: `检查项已非 pending（已清偿 / 已豁免），无法${action}` });
    } else {
      void reply.code(404).send({ detail: '检查项不存在' });
    }
  };

  // GET /api/checklist?seasonId=xxx：读该赛季基准线下所有检查项 / 欠条。无基准线 → `{ items: [] }`
  // （GET 语义上"还没有"合法，照 GET /api/baseline 的 `{ baseline: null }` 先例）。
  // **响应带名不剥**：ChecklistItemsResponseSchema 直回完整 item（含 clearedBy/waivedBy）——D-085 第三版口径
  // "事实层永远带名"，欠条清偿/豁免留名正是单条事实卡，与 baseline 读视图剥 passedBy **刻意不同**。
  app.get('/api/checklist', async (request, reply) => {
    const parsed = ChecklistQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error, 'seasonId required') });
      return;
    }
    const baseline = await baselineStore.getBaseline(parsed.data.seasonId);
    if (!baseline) return ChecklistItemsResponseSchema.parse({ items: [] });
    const items = await checklistStore.listItems(baseline.id);
    return ChecklistItemsResponseSchema.parse({ items });
  });

  // POST /api/checklist?seasonId=xxx：现场快记欠条 / 模板实例化（30 秒动线，任何人可记——§3）。
  // 该赛季须有基准线（欠条挂在其门/里程碑或自选到期日下）→ 无基准线 404。挂门欠条（anchorMilestoneId）
  // 须命中该 baseline 的真实里程碑 id，否则 400（照 evidenceRefs 孤儿校验先例，防孤儿引用）。server 补
  // id/createdAt、钉 status=pending（store 层管）、origin 由 CreateChecklistItemRequestSchema.default('iou') 带入。
  app.post('/api/checklist', async (request, reply) => {
    const queryParsed = ChecklistQuerySchema.safeParse(request.query ?? {});
    if (!queryParsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(queryParsed.error, 'seasonId required') });
      return;
    }
    const bodyParsed = CreateChecklistItemRequestSchema.safeParse(request.body ?? {});
    if (!bodyParsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(bodyParsed.error) });
      return;
    }
    const baseline = await baselineStore.getBaseline(queryParsed.data.seasonId);
    if (!baseline) {
      void reply.code(404).send({ detail: '该赛季无基准线，无法挂检查项 / 欠条' });
      return;
    }
    // 孤儿校验：挂门欠条须命中该 baseline 的真实里程碑 id（避孤儿引用，照 evidenceRefs 同形先例）。
    // 自选到期日欠条（anchorDueAt）不涉里程碑、跳过本校验。
    const { anchorMilestoneId } = bodyParsed.data;
    if (anchorMilestoneId !== undefined) {
      const knownMilestoneIds = new Set(baseline.milestones.map((m) => m.id));
      if (!knownMilestoneIds.has(anchorMilestoneId)) {
        void reply.code(400).send({ detail: `挂接的门 / 里程碑不存在：${anchorMilestoneId}` });
        return;
      }
    }
    // draft：人填字段 + server 注入 seasonBaselineId（从 baseline.id）+ createdAt（clock）。store 补 id、钉 pending。
    const draft: ChecklistItemDraft = {
      seasonBaselineId: baseline.id,
      title: bodyParsed.data.title,
      anchorMilestoneId: bodyParsed.data.anchorMilestoneId,
      anchorDueAt: bodyParsed.data.anchorDueAt,
      origin: bodyParsed.data.origin,
      note: bodyParsed.data.note,
      createdAt: clock.now().toISOString(),
    };
    try {
      const item = await checklistStore.createItem(draft);
      void reply.code(201);
      return CreateChecklistItemResponseSchema.parse({ item });
    } catch (err) {
      // createItem 内部 GateChecklistItemSchema.parse fail-closed（挂接二选一 superRefine 等）→ ZodError 映射 400。
      if (err instanceof ZodError) {
        void reply.code(400).send({ detail: firstZodMsg(err) });
        return;
      }
      throw err;
    }
  });

  // POST /api/checklist/:id/clear?seasonId=xxx：标清偿（pending→passed，任何人可标——§3）。
  // actor 注入照 sessionActor 6 处既有范式（身份模式用会话身份、匿名模式用 body.clearedBy）；二者皆无 → 400
  // "清偿必须留名"（D-085 事实层带名，清偿留名进事实卡）。仅 pending 可清：非 pending → 409、不存在 → 404
  // （store 返回 null 不区分二者，路由用 listItems 找 id 判存在性——照 C2 交接）。
  app.post<{ Params: { id: string } }>('/api/checklist/:id/clear', async (request, reply) => {
    const queryParsed = ChecklistQuerySchema.safeParse(request.query ?? {});
    if (!queryParsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(queryParsed.error, 'seasonId required') });
      return;
    }
    const bodyParsed = ClearChecklistItemRequestSchema.safeParse(request.body ?? {});
    if (!bodyParsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(bodyParsed.error) });
      return;
    }
    const actor: ActorRef | undefined = request.identity
      ? sessionActor(request.identity)
      : bodyParsed.data.clearedBy;
    if (!actor) {
      void reply.code(400).send({ detail: '清偿必须留名（clearedBy）' });
      return;
    }
    const { id } = request.params;
    const result = await checklistStore.clearItem(id, actor);
    if (result) {
      // 带名不剥：ClearChecklistItemResponseSchema 直回完整 item（含 clearedBy）——事实层带名。
      return ClearChecklistItemResponseSchema.parse({ item: result });
    }
    // null：区分 404（不存在）与 409（非 pending，已清 / 已豁免）——先按赛季基准线找该 id 判存在性。
    await replyClearWaiveNotApplied(reply, id, queryParsed.data.seasonId, '清偿');
  });

  // POST /api/checklist/:id/waive?seasonId=xxx：书面豁免（pending→waived，仅**验收人名单**——§3）。
  // waiveReason 强制非空（WaiveChecklistItemRequestSchema 已管）；actor 注入同 clear。**豁免鉴权（D3 债，
  // 本刀接线）**：两模式统一走名册校验——身份模式校验会话身份 id、匿名模式校验 body.waivedBy.id，非验收人
  // → 403（比"匿名放行"诚实，记入 deviations）。名单 = Member.gateReviewer（isGateReviewer helper，体检 D6）。
  app.post<{ Params: { id: string } }>('/api/checklist/:id/waive', async (request, reply) => {
    const queryParsed = ChecklistQuerySchema.safeParse(request.query ?? {});
    if (!queryParsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(queryParsed.error, 'seasonId required') });
      return;
    }
    const bodyParsed = WaiveChecklistItemRequestSchema.safeParse(request.body ?? {});
    if (!bodyParsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(bodyParsed.error) });
      return;
    }
    const actor: ActorRef | undefined = request.identity
      ? sessionActor(request.identity)
      : bodyParsed.data.waivedBy;
    if (!actor) {
      void reply.code(400).send({ detail: '豁免必须留名（waivedBy）' });
      return;
    }
    // 豁免鉴权：actor 须在验收人名单（Member.gateReviewer=true）上。fail-closed（无资格默认拒绝）。
    const snapshot = await store.getSnapshot();
    if (!isGateReviewer(snapshot.members, actor.id)) {
      void reply.code(403).send({ detail: '豁免权属验收人名单（大三）' });
      return;
    }
    const { id } = request.params;
    const result = await checklistStore.waiveItem(id, actor, bodyParsed.data.waiveReason);
    if (result) {
      // 带名不剥：直回完整 item（含 waivedBy/waiveReason）——事实层带名 + 书面豁免记录。
      return WaiveChecklistItemResponseSchema.parse({ item: result });
    }
    await replyClearWaiveNotApplied(reply, id, queryParsed.data.seasonId, '豁免');
  });

  // GET /api/checklist/templates：跨赛季检查单模板清单（seed 留空、等复盘导入——§4）。与赛季解耦，无 querystring。
  app.get('/api/checklist/templates', async () => {
    const templates = await checklistStore.listTemplates();
    return ChecklistTemplatesResponseSchema.parse({ templates });
  });

  // PUT /api/members/:id/gate-reviewer：验收人名单维护（GATE-CHECKLIST-IOU，D-087 拍板②）。设 / 撤该成员的
  // 门验收人资格（每年换届更新，换届交接门的一项）。**权限收口（K1）**：**匿名模式=写门即可**（现状不变，
  // 演示态零门槛）；**身份模式=须 superAdmin**（isSuperAdmin，403——原 v1"写门即可"在 K1 收紧，敏感设置须
  // 管理员）。响应经 MemberPublicSchema 剥 pinHash（密钥纪律）。id 不存在 → 404。
  app.put<{ Params: { id: string } }>('/api/members/:id/gate-reviewer', async (request, reply) => {
    const { id } = request.params;
    const parsed = SetGateReviewerRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    const snapshot = await store.getSnapshot();
    if (
      identityMode === 'identity' &&
      !isSuperAdmin(snapshot.members, request.identity?.memberId ?? '')
    ) {
      void reply.code(403).send({ detail: '该操作需管理员（superAdmin）' });
      return;
    }
    const updated = await store.setMemberGateReviewer(id, parsed.data.gateReviewer);
    if (!updated) {
      void reply.code(404).send({ detail: 'member not found' });
      return;
    }
    return SetGateReviewerResponseSchema.parse({ member: MemberPublicSchema.parse(updated) });
  });

  // PUT /api/members/:id/role：成员组织身份维护（K1 权限地基 + MEMBER-PM-FLAG 刀②b 收窄）。role 现为
  // groupAdmin/member 两档（组织身份），项目管理权限不再经本写口（授/收旗走下方 project-manager 写口）。
  // **匿名模式=写门即可**（v1，与 gate-reviewer 对称，演示态零门槛）；**身份模式=须持旗管理员**
  // （isSuperAdmin 读旗标，403）。role 不再承载管理员权限，故本写口无降级保护（随权限移到 project-manager）。
  // 响应剥 pinHash。id 不存在 → 404。
  app.put<{ Params: { id: string } }>('/api/members/:id/role', async (request, reply) => {
    const { id } = request.params;
    const parsed = SetMemberRoleRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
      return;
    }
    const snapshot = await store.getSnapshot();
    // 身份模式鉴权：仅持旗管理员可改角色（fail-closed，另读实时名册）；匿名模式跳过（写门即可）。
    if (
      identityMode === 'identity' &&
      !isSuperAdmin(snapshot.members, request.identity?.memberId ?? '')
    ) {
      void reply.code(403).send({ detail: '该操作需管理员（项目管理旗标）' });
      return;
    }
    const updated = await store.setMemberRole(id, parsed.data.role);
    if (!updated) {
      void reply.code(404).send({ detail: 'member not found' });
      return;
    }
    return SetMemberRoleResponseSchema.parse({
      member: MemberPublicSchema.parse(updated),
    });
  });

  // PUT /api/members/:id/project-manager：项目管理旗标授 / 收（MEMBER-PM-FLAG 公测补强刀②b）——原
  // superAdmin 角色的正交化写口，与 role 拆分（队长兼组长 = groupAdmin + 旗标，天然不冲突）。
  // **匿名模式=写门即可**；**身份模式=须持旗管理员**（isSuperAdmin 读旗标，403）。**降级保护**（两模式
  // 统一）：目标是最后一个持旗成员且新值=false → 409（防摘掉唯一管理员把全队锁死；判与写收进
  // store.setProjectManager 同一临界区 guardLastProjectManager，照余项⑥ nit③ TOCTOU 修复先例）。响应剥
  // pinHash。id 不存在 → 404。
  app.put<{ Params: { id: string } }>(
    '/api/members/:id/project-manager',
    async (request, reply) => {
      const { id } = request.params;
      const parsed = SetProjectManagerRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
        return;
      }
      const snapshot = await store.getSnapshot();
      // 身份模式鉴权：仅持旗管理员可授/收旗（fail-closed，另读实时名册）；匿名模式跳过（写门即可）。
      if (
        identityMode === 'identity' &&
        !isSuperAdmin(snapshot.members, request.identity?.memberId ?? '')
      ) {
        void reply.code(403).send({ detail: '该操作需管理员（项目管理旗标）' });
        return;
      }
      // 降级保护（两模式统一）收进 store 同一临界区：判「至多 1 个持旗成员」与写不分离，并发收旗无法双放行。
      const result = await store.setProjectManager(id, parsed.data.projectManager, {
        guardLastProjectManager: true,
      });
      if (!result.ok) {
        if (result.reason === 'last-projectmanager') {
          void reply.code(409).send({ detail: '不能撤销最后一个项目管理成员' });
        } else {
          void reply.code(404).send({ detail: 'member not found' });
        }
        return;
      }
      return SetProjectManagerResponseSchema.parse({
        member: MemberPublicSchema.parse(result.member),
      });
    },
  );
  // ── 门检查单 / 欠条路由结束 ───────────────────────────────────────────────────────────────────
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
  // 派生 / 时间戳求值时刻（先于默认 store 定义——默认内存 store 复用同一 clock，见下）。缺省钉在
  // fixture 场景时间 GOVERNANCE_SCENARIO_NOW（演示态冻结钟，与 hub-console mock 同口径）。
  const clock: Clock =
    options.clock ?? new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW));
  // K6（时钟与空板刀）：未注入 store 走默认内存 store 时，**复用上面的 clock** 而非各自 new FixedClock——
  // 否则 main.ts 在 dataMode='real' 无落盘 env 时注入 RealClock 到 options.clock，路由层（claim/
  // assign/baseline/artifact/schedule now）走真钟，但默认 InMemoryGovStore 的 createTask 仍回退假钟 6/11
  // （"server options 有真钟、默认 store 仍假钟"缺口）。缺省态 clock=FixedClock(GOVERNANCE_SCENARIO_NOW)、
  // 与原 `new InMemoryGovStore()` 逐字等价，演示 / 测试零变化。
  const store: GovStore = options.store ?? new InMemoryGovStore(undefined, clock);
  // 打磨轮刀⑤ 空板默认组树兜底：main.ts 正常模式已对落盘 store（file/sqlite）await 过
  // ensureDefaultGroups()；这里覆盖「未注入 store → 默认内存 store」路径（内存 store 路径也调用）。
  // InMemoryGovStore 实现无 await、同步生效（listen 前完成）；groups 非空（demo seed / 既有数据）天然 no-op。
  void store.ensureDefaultGroups();
  // KB-CORE：知识库相似检索语料读出入口（缺省 InMemoryKbStore seed kbScenarioFixture），由 GET /api/kb/similar 消费。
  // invStore 仍只钉 options 字段、无消费方（INV 支柱落地时透传），符合 base 收口刀「扩展点先行、路由后置」节奏。
  const kbStore: KbStore = options.kbStore ?? new InMemoryKbStore();
  // INV-BOM-CORE：库存 / BOM 读写出入口（缺省 InMemoryInvStore seed inventoryScenarioFixture），由
  // GET /api/inventory + POST /api/inventory/{part-types,actions} 消费。独立于 GovStore（InventorySnapshot
  // 不在 GovernanceSnapshot 内）；车列复用 GovStore.listResources 的资源（显示 displayCode ?? name）。
  // 默认内存 store 同样复用上面的 clock（K6，与 store 同理——真实态 createdAt 走真钟）。
  const invStore: InvStore = options.invStore ?? new InMemoryInvStore(undefined, clock);
  // BASELINE-CORE：倒排基准线读写出入口（缺省 InMemoryBaselineStore seed baselineScenarioFixture，
  // 同 InMemoryInvStore 先例——demo 首屏「基准线 vs 实际」非空）。由 GET/PATCH /api/baseline +
  // POST /api/baseline/milestones/:id/pass 消费（S4）。
  const baselineStore: BaselineStore = options.baselineStore ?? new InMemoryBaselineStore();
  // GATE-CHECKLIST-IOU：门检查单 / 欠条读写出入口（缺省 InMemoryChecklistStore seed checklistScenarioFixture，
  // 同 InMemoryBaselineStore 先例——demo 首屏门检查单卡 / 告警区欠条非空）。本刀先钉字段、C3 挂路由消费。
  const checklistStore: ChecklistStore = options.checklistStore ?? new InMemoryChecklistStore();
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
    // SETUP-WIZARD 刀①：正常模式 POST /api/setup/init 恒 409（多标签页幂等），不做任何写、无副作用，
    // 故豁免写门（鉴权 / 限流）直达处理器——身份模式 / 配 token 下也稳定 409，不因缺会话 / 缺 Bearer 变 401。
    if (request.url.split('?')[0] === '/api/setup/init') return;
    const path = request.url.split('?')[0];
    // 四条例外路径（对 Bearer 硬门与「须有会话」硬门同享，鉴权收敛在各路由一处判）：
    //  - session 认证端点（POST/DELETE /api/session）：登录/登出入口，不能要求先有会话或令牌——
    //    否则配了 writeToken 的部署里**登录本身**就被 401 锁死（令牌要进设置页，设置页要先登录）。
    //  - 名册导入引导豁免（ROSTER-IMPORT，K8）：身份模式 + 空板 = 登录死锁。路由内自判：名册为空放行、
    //    一旦有人即恢复须持旗管理员会话。
    //  - 初始化 bootstrap 豁免（SETUP-WIZARD-ROSTER 刀②）：POST /api/setup/super-admin——名册无持旗成员时
    //    无人能登录，向导第一步发生在任何会话/令牌配置之前。路由内自判：已有持旗成员 → 409；老路径
    //    （无 displayName）→ 仍须会话 401。
    //  - PIN 死锁恢复豁免（PIN-DEADLOCK-RECOVERY）：loopback 的 DELETE /api/members/:id/pin——唯一管理员
    //    忘 PIN 时操作者只能在部署机上 curl，不会先持有令牌/会话。非 loopback 不在此列。
    const isSessionAuthEndpoint =
      path === '/api/session' &&
      (request.method === 'POST' || request.method === 'DELETE');
    const isRosterBootstrap =
      path === '/api/roster/import' && request.method === 'POST';
    const isSetupBootstrap =
      path === '/api/setup/super-admin' && request.method === 'POST';
    const isPinRecovery =
      request.method === 'DELETE' &&
      /^\/api\/members\/[^/]+\/pin$/.test(path) &&
      isLoopbackOperator(request, trustProxy);
    // 鉴权（配了 token 才强制 Bearer；未配=loopback dev 放行）。
    // **身份模式下有效会话即已鉴权**（会话 = 本人 PIN 登录，httpOnly + SameSite=Lax，强度不低于共享令牌；
    // main.ts 本就不要求身份模式配 writeToken 才能非 loopback 启动——令牌在此只是匿名客户端的写闸）。
    // 否则配了令牌的部署里整个首启动向导（bootstrap → 导 CSV → 确认组长）与日常浏览器写操作全被 401 锁死。
    // 匿名模式无会话概念、行为不变（仍只认 Bearer）。
    const sessionAuthed = identityMode === 'identity' && request.identity != null;
    if (
      writeToken &&
      !isSessionAuthEndpoint &&
      !isRosterBootstrap &&
      !isSetupBootstrap &&
      !isPinRecovery &&
      !sessionAuthed &&
      request.headers.authorization !== `Bearer ${writeToken}`
    ) {
      void reply.code(401).send({ detail: 'unauthorized' });
      return reply;
    }
    // IDENTITY-LITE：身份模式下，写方法一律须携有效会话（否则 401）——例外即上面四条例外路径。
    // 匿名模式此段整段跳过。
    if (identityMode === 'identity') {
      if (
        !isSessionAuthEndpoint &&
        !isRosterBootstrap &&
        !isSetupBootstrap &&
        !isPinRecovery &&
        !request.identity
      ) {
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
    checklistStore,
    artifactMaxBytes: options.artifactMaxBytes ?? ARTIFACT_MAX_BYTES,
    identityMode,
    trustProxy,
    sessions,
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
    // role/gateReviewer/projectManager 快照（K1 + MEMBER-PM-FLAG）：登录当刻定格，改角色/名单/旗标后须重登
    // 才刷新（服务端敏感门另读实时名册）。
    const identity: SessionIdentity = {
      memberId: member.id,
      displayName: member.displayName,
      groupId: member.groupId,
      role: member.role,
      gateReviewer: member.gateReviewer,
      projectManager: member.projectManager,
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

  // ── Setup 端点（SETUP-WIZARD 刀①，setup-wizard.md §3/§4）：宿主级横切，两模式都挂 ──────────────
  // 正常模式（config.json 已存在，才走 buildHubServer）：GET 恒报 initialized:true（前端据此渲染正常 app
  // 而非向导）；POST 恒 409（多标签页 / 重复提交幂等——不再接受初始化，改配置走设置页刀③的写 API）。
  // dataDirHasData 在正常模式已无意义（仅升级迁移提示用），恒 true。setup 模式的 initialized:false 版本由
  // build-setup-server.ts 提供（那条链根本不建 store / 不进本函数）。
  app.get('/api/setup/state', async () => {
    return SetupStateResponseSchema.parse({ initialized: true, dataDirHasData: true });
  });
  app.post('/api/setup/init', async (_request, reply) => {
    void reply.code(409).send({ detail: '已初始化（config.json 已存在）' });
    return reply;
  });

  // ── 部署配置写通道（SETUP-WIZARD 刀③，setup-wizard.md §6）：设置页「部署配置」写区背后的两写端点 ──────
  // 仅当装配层给了 setupControl 才注册（缺省 → 404；setup 模式那条链不进本函数 → 也 404，满足「setup 模式
  // 不注册」）。两端点都是写方法，天然被上面的写门 onRequest 钩子罩：匿名模式=宿主级写门即可（Bearer + 限流，
  // 与现有敏感门非对称裁决一致，§10 拍板③）；身份模式=钩子先保证有会话（否则 401），路由内再判 superAdmin
  // （否则 403，照 createSeason 敏感门先例、另读实时名册 fail-closed）。改配置后写 config.json → exit 42
  // 自动重启（start 脚本循环 / compose restart:on-failure 拉起）→ 前端轮询复活刷新。
  const setupControl = options.setupControl;
  if (setupControl) {
    const setupExit =
      setupControl.exit ?? ((code: number) => process.exit(code));
    const setupNow = setupControl.now ?? (() => new Date());
    const setupRestartDelayMs = setupControl.restartDelayMs ?? 500;

    // PUT /api/setup/config：改登录方式（identityMode）。保留 dataMode/initializedAt/schemaVersion，
    // 落盘前 DeployConfigSchema.parse 自校验产物合法（对称 fail-closed，绝不落坏 config 让下次启动拒起）。
    app.put('/api/setup/config', async (request, reply) => {
      // 身份模式 superAdmin 门（匿名模式跳过，走写门即可）。
      if (identityMode === 'identity') {
        const snapshot = await store.getSnapshot();
        if (!isSuperAdmin(snapshot.members, request.identity?.memberId ?? '')) {
          void reply.code(403).send({ detail: '该操作需管理员（superAdmin）' });
          return reply;
        }
      }
      const parsed = SetupConfigRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
        return reply;
      }
      const next = DeployConfigSchema.parse({
        ...setupControl.config,
        identityMode: parsed.data.identityMode,
      });
      await mkdir(dirname(setupControl.configFile), { recursive: true });
      await writeFile(
        setupControl.configFile,
        `${JSON.stringify(next, null, 2)}\n`,
        'utf8',
      );
      setTimeout(() => setupExit(RESTART_EXIT_CODE), setupRestartDelayMs);
      void reply.code(200).send({ restarting: true });
      return reply;
    });

    // POST /api/setup/graduate：结束试驾转正式（单向门）。仅 dataMode==='demo' 可调（否则 409）。
    // 先归档五域 JSON + 归档物目录内容到 <数据目录>/demo-archive-<时间戳>/（只挪不删、可手工找回）；
    // 任一步失败即中止——不写 config、不重启（数据完好，报错给操作者，§6.2 / §9）；成功后写 dataMode=real
    // → exit 42 重启进真空板。
    app.post('/api/setup/graduate', async (request, reply) => {
      if (identityMode === 'identity') {
        const snapshot = await store.getSnapshot();
        if (!isSuperAdmin(snapshot.members, request.identity?.memberId ?? '')) {
          void reply.code(403).send({ detail: '该操作需管理员（superAdmin）' });
          return reply;
        }
      }
      // 前置：只有演示态可转正式（真空板已是正式，无反向门——防误触清库，§1 非目标）。
      if (setupControl.config.dataMode !== 'demo') {
        void reply
          .code(409)
          .send({ detail: '当前已是正式（real）部署，转正式门只在演示（demo）态可用' });
        return reply;
      }
      // 归档目录时间戳（冒号 / 点在多数文件系统合法，仍规范成 `-` 求跨平台稳妥）。
      const stamp = setupNow().toISOString().replace(/[:.]/g, '-');
      const archiveDir = join(
        dirname(setupControl.configFile),
        `demo-archive-${stamp}`,
      );
      try {
        await archiveDemoData({
          archiveDir,
          dataFiles: setupControl.dataFiles,
          artifactDir: setupControl.artifactDir,
        });
      } catch (err) {
        // 任一步失败即中止：不写 config、不重启。只移动不删除故数据完好（部分在归档、部分在原位，均可找回）。
        void reply.code(500).send({
          detail: `演示数据归档失败，已中止转正式（未改配置、未重启，数据完好）：${(err as Error).message}`,
        });
        return reply;
      }
      const next = DeployConfigSchema.parse({
        ...setupControl.config,
        dataMode: 'real',
      });
      await mkdir(dirname(setupControl.configFile), { recursive: true });
      await writeFile(
        setupControl.configFile,
        `${JSON.stringify(next, null, 2)}\n`,
        'utf8',
      );
      setTimeout(() => setupExit(RESTART_EXIT_CODE), setupRestartDelayMs);
      void reply.code(200).send({ restarting: true });
      return reply;
    });
  }

  // 装配外壳核心：遍历 enabledModules → 挂载各域路由。未启用模块的函数根本不被调用，端点整段不挂
  // （§3.4-A；游戏工作室等租户可省 presence-schedule，此步无需拆 ScheduleStore——GovStore 的 schedule
  // 方法对未启用租户单纯不被调用即可，是最便宜实现）。system/pm-core 虽标"核心常装/必装"，装配层仍统一走
  // enabledModules 判断、不写结构性例外——常装与否由 TenantConfig 的内容体现。
  if (moduleEnabled('system')) {
    registerSystemRoutes(app, options.deployment);
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
