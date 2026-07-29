import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
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
  CreateResourcesBatchRequestSchema,
  CreateResourcesBatchResponseSchema,
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
  LarkConfigSaveRequestSchema,
  LarkPushReminderResponseSchema,
  deriveBaselineDrift,
} from './contracts.js';
import type {
  IssueCard,
  ArchiveDocument,
  KbImportDocIssue,
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
  // 显示 PIN（打磨轮刀⑧② pinPlaintext 唯一透出口）：GET /api/members/:id/pin 响应契约。
  MemberPinResponseSchema,
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
  RosterImportRowsRequestSchema,
  RosterPreviewResponseSchema,
  type RosterImportFailure,
  type RosterImportRow,
  // 库存批量导入（INV-BULK-IMPORT 刀⑪）：模板生成 + 解析器 + preview/JSON 双收 + 报告契约；
  // 编码探测复用 csv-core decodeCsvBytes（与名册 decodeRosterBytes 同一来源）。
  buildInventoryTemplateCsv,
  decodeCsvBytes,
  parseInventoryCsv,
  InventoryImportReportSchema,
  InventoryImportRowsRequestSchema,
  InventoryPreviewResponseSchema,
  type InventoryImportFailure,
  type InventoryImportRow,
  // 车队批量导入（FLEET-CSV-IMPORT）：模板生成 + 解析器 + 预览契约；编码探测复用 csv-core decodeCsvBytes。
  // 落库不新增语义——预览确认后前端拼 CreateResourcesBatchRequest 走既有 POST /api/resources/batch。
  buildFleetTemplateCsv,
  parseFleetCsv,
  FleetPreviewResponseSchema,
  // KB 批量 md 导入（KB-BULK-MD-IMPORT 打磨轮刀⑫）：报告契约 + 归档文档 schema（逐文件预验）+ 标题上限。
  ArchiveDocumentSchema,
  KbImportDocsReportSchema,
  KB_TITLE_MAX,
  // 验收人年级默认派生集合（GRADE-7-TIERS 刀⑥ 起由 contracts 导出，bootstrap 与 CSV 导入同源消费）。
  GATE_REVIEWER_DEFAULT_GRADES,
  // SETUP-WIZARD 刀①：正常模式 setup 状态回执（GET /api/setup/state → initialized:true）。
  SetupStateResponseSchema,
  // SETUP-WIZARD 刀③：部署配置写端点（PUT /api/setup/config 改 identityMode；graduate 转正式）。
  DeployConfigSchema,
  SetupConfigRequestSchema,
  // Hermes 入站命令（HUB-HERMES-ADAPTER 最小链路）：请求/响应契约 + 原始文本规则匹配。
  HermesInboundRequestSchema,
  HermesInboundResponseSchema,
  HermesInvQueryArgsSchema,
  HermesInvRecordArgsSchema,
  parseHermesText,
} from '@teamhub/hub-contracts';
import { ZodError } from 'zod';
import { isGateReviewer, isGroupLeadOf, isSuperAdmin, memberHasPmFlag } from './authz.js';
import { hashPin, verifyPin } from './identity/pin.js';
import { SessionManager } from './identity/session-store.js';
import { deriveErrorCode } from './kb/error-code.js';
import { FixedClock } from './clock.js';
import type { Clock } from './clock.js';
import { sendLarkMessage } from './lark-client.js';
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
import { registerBaselineRoutes } from './routes/baseline.js';
import { registerSearchRoutes } from './routes/search.js';
import { registerExportRoutes } from './routes/export.js';
import { registerKnowledgeBaseRoutes } from './routes/kb.js';
import { registerLedgerRoutes } from './routes/ledger.js';
import { registerPresenceScheduleRoutes } from './routes/schedule.js';
import { registerArchiveRoutes } from './routes/archive.js';
import { registerSystemRoutes } from './routes/system.js';
import { registerPmCoreRoutes } from './routes/pm.js';
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
  /** 飞书集成配置持久化（LARK-INTEG-CONFIG）。给了才注册 /api/integrations/lark + /api/hermes/credential。 */
  larkStore?: import('./store/lark-integration-store.js').LarkIntegrationStore;
}

// 归档物文件上传上限（50MB）：覆盖机械 CAD（step/stp/sldprt）+ 电路 PDF + 固件，又约束资源耗尽面。
const ARTIFACT_MAX_BYTES = 50 * 1024 * 1024;

// 名册导入 CSV 上限（ROSTER-IMPORT，K8）：1MB——纯文本花名册（几十人）绰绰有余，又约束资源耗尽面。
// 由 POST /api/roster/import 的 `request.file({ limits })` per-request 覆盖插件默认（插件默认 = 归档物上限）。
const ROSTER_MAX_BYTES = 1024 * 1024;

// 库存导入 CSV 上限（INV-BULK-IMPORT 刀⑪）：1MB——与名册同律（纯文本零件表绰绰有余，又约束资源
// 耗尽面）。由 POST /api/inventory/{preview,import} 的 `request.file({ limits })` per-request 覆盖插件默认。
const INVENTORY_IMPORT_MAX_BYTES = 1024 * 1024;

// 车队导入 CSV 上限（FLEET-CSV-IMPORT）：1MB——与名册/库存同律（纯文本车队表绰绰有余，又约束资源
// 耗尽面）。由 POST /api/resources/preview 的 `request.file({ limits })` per-request 覆盖插件默认。
const FLEET_IMPORT_MAX_BYTES = 1024 * 1024;

async function readCsvUpload(
  request: FastifyRequest,
  reply: FastifyReply,
  opts: { maxBytes: number; decode: (buf: Buffer) => string | null },
): Promise<string | null> {
  let data;
  try {
    data = await request.file({ limits: { fileSize: opts.maxBytes, files: 1 } });
  } catch {
    void reply.code(400).send({ detail: '请求体不是 multipart 表单' });
    return null;
  }
  if (!data) {
    void reply.code(400).send({ detail: '未收到文件' });
    return null;
  }
  let buf: Buffer;
  try {
    buf = await data.toBuffer();
  } catch (err) {
    if ((err as { code?: string })?.code === 'FST_REQ_FILE_TOO_LARGE') {
      void reply.code(413).send({ detail: '文件过大（上限 1MB）' });
      return null;
    }
    void reply.code(400).send({ detail: '读取文件失败' });
    return null;
  }
  if (data.file.truncated) {
    void reply.code(413).send({ detail: '文件过大（上限 1MB）' });
    return null;
  }
  const text = opts.decode(buf);
  if (text === null) {
    void reply.code(400).send({ detail: '编码无法识别，请另存为 CSV UTF-8' });
    return null;
  }
  return text;
}

// KB 批量 md 导入上限（KB-BULK-MD-IMPORT 打磨轮刀⑫）：单文件 1MB（纯文本 md 绰绰有余）+ 单批至多
// 20 个（初始化向导「导入一堆文件」场景；整批峰值 20MB 内存，约束耗尽面）。
// 由 POST /api/kb/import-docs 的 `request.files({ limits })` per-request 覆盖插件默认（files:1 宿主级默认）。
const KB_IMPORT_DOC_MAX_BYTES = 1024 * 1024;
const KB_IMPORT_DOCS_MAX_FILES = 20;

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

function parseBody<T>(
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: import('zod').ZodError } },
  request: FastifyRequest,
  reply: FastifyReply,
): T | null {
  const parsed = schema.safeParse(request.body ?? {});
  if (!parsed.success) {
    void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
    return null;
  }
  return parsed.data;
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
  larkStore?: import('./store/lark-integration-store.js').LarkIntegrationStore;
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

  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 503;
    void reply.code(status).send({ detail: error.message || 'internal error' });
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
    //    一旦有人即恢复须持旗管理员会话。刀⑦ preview（只解析不落库）同律——同一路由内鉴权、同一豁免面。
    //  - 初始化 bootstrap 豁免（SETUP-WIZARD-ROSTER 刀②）：POST /api/setup/super-admin——名册无持旗成员时
    //    无人能登录，向导第一步发生在任何会话/令牌配置之前。路由内自判：已有持旗成员 → 409；老路径
    //    （无 displayName）→ 仍须会话 401。
    //  - PIN 死锁恢复豁免（PIN-DEADLOCK-RECOVERY）：loopback 的 DELETE /api/members/:id/pin——唯一管理员
    //    忘 PIN 时操作者只能在部署机上 curl，不会先持有令牌/会话。非 loopback 不在此列。
    const isSessionAuthEndpoint =
      path === '/api/session' &&
      (request.method === 'POST' || request.method === 'DELETE');
    const isRosterBootstrap =
      (path === '/api/roster/import' || path === '/api/roster/preview') &&
      request.method === 'POST';
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
    const parsed = parseBody(SessionRequestSchema, request, reply);
    if (!parsed) return;
    const { memberId, pin } = parsed;
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
    registerArchiveRoutes(app, { store, clock });
  }
  if (moduleEnabled('pm-core')) {
    registerPmCoreRoutes(app, ctx);
  }
  if (moduleEnabled('knowledge-base')) {
    registerKnowledgeBaseRoutes(app, { store, clock, kbStore, identityMode });
  }
  if (moduleEnabled('ledger')) {
    registerLedgerRoutes(app, { store, invStore, identityMode });
  }
  if (moduleEnabled('presence-schedule')) {
    registerPresenceScheduleRoutes(app, { store, clock });
  }

  registerSearchRoutes(app, { store, kbStore, invStore });
  registerExportRoutes(app, { store, invStore });

  // ── 飞书集成配置（LARK-INTEG-CONFIG）────────────────────────────────────────────────────────────
  const larkStore = options.larkStore;
  if (larkStore) {
    app.get('/api/integrations/lark', async () => {
      const config = larkStore.getConfig();
      if (!config || !config.appId) {
        return { configured: false, status: 'unconfigured' };
      }
      const masked = config.appSecret
        ? `****${config.appSecret.slice(-4)}`
        : undefined;
      return {
        configured: true,
        appId: config.appId,
        appSecretMasked: masked,
        chatId: config.chatId,
        status: config.status,
        lastCheckedAt: config.lastCheckedAt,
        error: config.error,
      };
    });

    app.put('/api/integrations/lark', async (request, reply) => {
      const parsed = LarkConfigSaveRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        void reply.code(400).send({ detail: firstZodMsg(parsed.error) });
        return;
      }
      const { appId, appSecret, chatId } = parsed.data;
      const checkedAt = new Date().toISOString();
      try {
        const tokenRes = await fetch(
          'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
            signal: AbortSignal.timeout(10_000),
          },
        );
        const tokenJson = (await tokenRes.json()) as { code?: number; msg?: string };
        if (tokenJson.code !== 0) {
          larkStore.saveConfig({ appId, appSecret, chatId, status: 'error', lastCheckedAt: checkedAt, error: tokenJson.msg ?? 'auth failed' });
          return { ok: false, status: 'error' as const, error: tokenJson.msg ?? 'auth failed' };
        }
        larkStore.saveConfig({ appId, appSecret, chatId, status: 'connected', lastCheckedAt: checkedAt });
        return { ok: true, status: 'connected' as const };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'network error';
        larkStore.saveConfig({ appId, appSecret, chatId, status: 'error', lastCheckedAt: checkedAt, error: msg });
        return { ok: false, status: 'error' as const, error: msg };
      }
    });

    app.delete('/api/integrations/lark', async () => {
      larkStore.clearConfig();
      larkStore.rotateWriteToken();
      return { ok: true };
    });

    app.get('/api/hermes/credential', async (request, reply) => {
      if (!isLoopbackOperator(request, trustProxy)) {
        void reply.code(403).send({ detail: 'forbidden' });
        return;
      }
      return { token: larkStore.getWriteToken() };
    });

    app.post('/api/integrations/lark/push-reminder', async (request, reply) => {
      const cfg = larkStore.getConfig();
      if (!cfg || cfg.status !== 'connected') {
        void reply.code(400).send({ detail: '飞书未配置或未连接' });
        return;
      }
      const snapshot = await store.getSnapshot();
      const now = clock.now();
      let redCount = 0;
      let yellowCount = 0;
      const lines: string[] = [];
      for (const season of snapshot.seasons) {
        const baseline = await baselineStore.getBaseline(season.id);
        if (!baseline) continue;
        const drifts = deriveBaselineDrift(baseline, snapshot.tasks, now);
        for (const d of drifts) {
          if (d.level === 'green') continue;
          const ms = baseline.milestones.find((m) => m.id === d.milestoneId);
          if (!ms) continue;
          if (d.level === 'red') redCount++;
          else yellowCount++;
          const icon = d.level === 'red' ? '🔴' : '🟡';
          lines.push(`${icon} ${ms.title}（挂接任务 ${d.attachedDone}/${d.attachedTotal} 完成）`);
        }
      }
      if (lines.length === 0) {
        return LarkPushReminderResponseSchema.parse({ ok: true, pushed: false, redCount: 0, yellowCount: 0 });
      }
      const text = `[里程碑提醒]\n${lines.join('\n')}`;
      const result = await sendLarkMessage(cfg.appId, cfg.appSecret, cfg.chatId, text);
      if (!result.ok) {
        void reply.code(502).send({ detail: result.error ?? 'send failed' });
        return;
      }
      return LarkPushReminderResponseSchema.parse({ ok: true, pushed: true, redCount, yellowCount });
    });
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (await tryServeStaticConsole(request, reply, options.consoleDistDir)) {
      return;
    }

    void reply.code(404).send({ detail: 'Not found' });
  });

  return app;
}
