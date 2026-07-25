import { z } from 'zod';
import {
  AgentBackendsResponseSchema,
  ArtifactsResponseSchema,
  BotChannelsResponseSchema,
  BridgeMembersResponseSchema,
  DataSourcesResponseSchema,
  DepGraphSchema,
  GitReposResponseSchema,
  GroupGapsResponseSchema,
  GroupsResponseSchema,
  GroupResponseSchema,
  HubEventsResponseSchema,
  MembersResponseSchema,
  PresenceScheduleResponseSchema,
  ResourceSessionsResponseSchema,
  SeasonsResponseSchema,
  CreateSeasonResponseSchema,
  SessionResponseSchema,
  SharedResourcesResponseSchema,
  TasksResponseSchema,
  BaselineResponseSchema,
  UpdateBaselineResponseSchema,
  ChecklistItemsResponseSchema,
  CreateChecklistItemResponseSchema,
  ClearChecklistItemResponseSchema,
  WaiveChecklistItemResponseSchema,
  SetGateReviewerResponseSchema,
  SetMemberRoleResponseSchema,
  SetProjectManagerResponseSchema,
  ClearPinResponseSchema,
  MemberPinResponseSchema,
  SetupSuperAdminResponseSchema,
  SetupStateResponseSchema,
  SetupInitResponseSchema,
  SetupConfigResponseSchema,
  SetupGraduateResponseSchema,
  RosterImportReportSchema,
  RosterPreviewResponseSchema,
  InventoryImportReportSchema,
  InventoryPreviewResponseSchema,
  FleetPreviewResponseSchema,
  type ChecklistItemsResponse,
  type CreateChecklistItemRequest,
  type CreateChecklistItemResponse,
  type ClearChecklistItemRequest,
  type ClearChecklistItemResponse,
  type WaiveChecklistItemRequest,
  type WaiveChecklistItemResponse,
  type SetGateReviewerRequest,
  type SetGateReviewerResponse,
  type SetMemberRoleRequest,
  type SetMemberRoleResponse,
  type SetProjectManagerRequest,
  type SetProjectManagerResponse,
  type ClearPinResponse,
  type MemberPinResponse,
  type SetupSuperAdminRequest,
  type SetupSuperAdminResponse,
  type SetupStateResponse,
  type SetupInitRequest,
  type SetupInitResponse,
  type SetupConfigRequest,
  type SetupConfigResponse,
  type SetupGraduateResponse,
  type RosterImportReport,
  type RosterImportRow,
  type RosterPreviewResponse,
  type InventoryImportReport,
  type InventoryImportRow,
  type InventoryPreviewResponse,
  type FleetPreviewResponse,
  type ArtifactsResponse,
  type DepGraph,
  type Group,
  type GroupGapsResponse,
  type MemberPublic,
  type PresenceScheduleResponse,
  type CreateSeasonRequest,
  type CreateGroupRequest,
  type RenameGroupRequest,
  type GroupResponse,
  type ResourceSessionsResponse,
  type Season,
  type SessionRequest,
  type SessionResponse,
  type SharedResourcesResponse,
  type TaskWithMeta,
  type TaskStatus,
  type BaselineResponse,
  type UpdateBaselineRequest,
  type UpdateBaselineResponse,
} from '@teamhub/hub-contracts';
import {
  HealthResponseSchema,
  OverviewSnapshotSchema,
  SystemStatusResponseSchema,
  type OverviewSnapshot,
  type SystemStatusResponse,
} from './schemas/system';
import {
  KbSimilarResponseSchema,
  KbCloseoutResponseSchema,
  KbImportDocsReportSchema,
  type KbSimilarParams,
  type KbSimilarResponse,
  type KbCloseoutRequest,
  type KbCloseoutResponse,
  type KbImportDocsReport,
} from './schemas/kb';
import {
  CreateTaskResponseSchema,
  CreateDependencyResponseSchema,
  CreateNeedResponseSchema,
  TransitionTaskStatusResponseSchema,
  WaiveDependencyResponseSchema,
  CreateArtifactResponseSchema,
  UploadArtifactResponseSchema,
  ClaimTaskResponseSchema,
  AssignTaskResponseSchema,
  SetTaskPartnerResponseSchema,
  ConfirmCrossClaimResponseSchema,
  CompleteTaskResponseSchema,
  ReviewTaskResponseSchema,
  type CreateTaskRequest,
  type CreateTaskResponse,
  type CreateDependencyRequest,
  type CreateDependencyResponse,
  type CreateNeedRequest,
  type CreateNeedResponse,
  type TransitionTaskStatusResponse,
  type WaiveDependencyResponse,
  type CreateArtifactRequest,
  type CreateArtifactResponse,
  type UploadArtifactResponse,
  type ClaimTaskRequest,
  type ClaimTaskResponse,
  type AssignTaskRequest,
  type AssignTaskResponse,
  type SetTaskPartnerRequest,
  type SetTaskPartnerResponse,
  type ConfirmCrossClaimRequest,
  type ConfirmCrossClaimResponse,
  type CompleteTaskRequest,
  type CompleteTaskResponse,
  type ReviewTaskRequest,
  type ReviewTaskResponse,
} from './schemas/pm';
import {
  InventoryResponseSchema,
  CreatePartTypeResponseSchema,
  CreatePartActionResponseSchema,
  type InventoryResponse,
  type CreatePartTypeRequest,
  type CreatePartTypeResponse,
  type CreatePartActionRequest,
  type CreatePartActionResponse,
} from './schemas/inv';
import {
  RelayBoardResponseSchema,
  UpdateResourceSessionResponseSchema,
  RelayHandoffResponseSchema,
  CreateResourceSessionResponseSchema,
  UpdateResourceDefaultPresetResponseSchema,
  CreateResourceSessionsBatchResponseSchema,
  type RelayBoardResponse,
  type UpdateResourceSessionRequest,
  type UpdateResourceSessionResponse,
  type CreateRelayHandoffRequest,
  type RelayHandoffResponse,
  type CreateResourceSessionRequest,
  type CreateResourceSessionResponse,
  type UpdateResourceDefaultPresetRequest,
  type UpdateResourceDefaultPresetResponse,
  type CreateResourceSessionsBatchRequest,
  type CreateResourceSessionsBatchResponse,
} from './schemas/schedule';
import {
  CreateResourceResponseSchema,
  CreateResourcesBatchResponseSchema,
  UpdateResourceResponseSchema,
  type CreateResourceRequest,
  type CreateResourceResponse,
  type CreateResourcesBatchRequest,
  type CreateResourcesBatchResponse,
  type UpdateResourceStatusRequest,
  type UpdateResourceResponse,
} from './schemas/resources';

type FetchLike = typeof fetch;

export interface HubApiClientOptions {
  baseUrl?: string;
  fetcher?: FetchLike;
  // 写入令牌（Bearer）：server 绑非 loopback 时写端点强制鉴权。有则附到所有 POST 的
  // Authorization 头；空则不附（loopback dev 无需）。来源 = 设置页 localStorage。
  writeToken?: string;
}

export interface HubApiClient {
  getOverview(): Promise<OverviewSnapshot>;
  getSystemStatus(): Promise<SystemStatusResponse>;
  getDepGraph(): Promise<DepGraph>;
  // 方向缺口（S2，D-069）：组级缺人方向，只读派生视图。A1：响应无 memberId、永不下钻到人。
  getGroupGaps(): Promise<GroupGapsResponse>;
  // 差异化在场排班（D-029）：按组×窗口派生 present/onCall/free，I0：输出无 memberId/invitedMemberIds。
  getSchedule(windowLabel: string): Promise<PresenceScheduleResponse>;
  getResourceSessions(): Promise<ResourceSessionsResponse>;
  // 共享物理资源（机器人）列表：接力链按机器人并排时取 displayCode ?? name 作列头。无人维度（中性事实）。
  getResources(): Promise<SharedResourcesResponse>;
  // 机器人管理写侧（R3，D-072 §3.2/§3.3）。新建：填 season + robotTarget + version → server 派生 displayCode
  //（禁手写）；改状态：维修 / 退役 / 拆解 / 恢复等状态迁移（**退役 = status→retired、非物删，无 DELETE 口子**）。
  // 反监视红线：SharedResource 结构上无成员维度，写请求绝不含 memberId / 出勤。
  createResource(req: CreateResourceRequest): Promise<CreateResourceResponse>;
  // 车队批量初始化（FLEET-BATCH-INIT 刀⑩）：初始化向导「车队」步一次录全部车——服务端 zod 全量先验，
  // 任一行坏整批 400 一台不落；displayCode 服务端派生（禁手写不变）。
  createResourcesBatch(
    req: CreateResourcesBatchRequest,
  ): Promise<CreateResourcesBatchResponse>;
  // 车队批量导入（FLEET-CSV-IMPORT，照库存刀⑪）：初始化向导「车队」步 CSV 主路径——模板 GET 直链；
  // 上传 → previewFleet 只解析不落库 → 预览表行内编辑 → 确认后拼 CreateResourcesBatchRequest 走既有
  // createResourcesBatch（本簇不新增落库端点）。I0：车队事实回显，无人键。
  fleetTemplateUrl(): string;
  previewFleet(file: File): Promise<FleetPreviewResponse>;
  updateResourceStatus(
    id: string,
    patch: UpdateResourceStatusRequest,
  ): Promise<UpdateResourceResponse>;
  getKbSimilar(params: KbSimilarParams): Promise<KbSimilarResponse>;
  // GET /api/tasks（TASK-POST-CLAIM）：逐任务带 isBig 元信息（TaskWithMeta，大任务判定后端下沉，
  // 体检 D5——前端直接用 task.isBig、不重算）。`query.q` = "看谁做过"子串搜 title/rawSummary（红线：
  // 只回任务列表，永不聚合成技能画像/花名册，也不按人筛选）。缺省 = 全量（现有行为不变）。
  getTasks(query?: { q?: string }): Promise<{ tasks: TaskWithMeta[] }>;
  // 赛季列表（S1）：总览「基准线 vs 实际」按 active 赛季查基准线。无人维度、只读元信息。
  getSeasons(): Promise<{ seasons: Season[] }>;
  // 赛季创建（SEASON-CREATE 补链路）：设置页「赛季」分区消费——新建=宣告新的当前赛季
  // （status 服务端钉 active、旧 active 同笔归档），总览空态"先在设置里建一个赛季"自此不再悬空。
  createSeason(req: CreateSeasonRequest): Promise<{ season: Season }>;
  // 倒排基准线（BASELINE-CORE，S4）。读：某赛季的「基准线 vs 实际」——未生成模板 → { baseline: null }
  // （前端引导「填两锚点→生成模板」）。读视图已剥 passedBy（I0，红线2）。
  getBaseline(seasonId: string): Promise<BaselineResponse>;
  // 写：生成模板 / 队长手写覆盖（PATCH 整段覆盖式合并）。总览「空 baseline 态」按两锚点生成模板后调它落盘。
  updateBaseline(
    seasonId: string,
    req: UpdateBaselineRequest,
  ): Promise<UpdateBaselineResponse>;
  // 组只读列表（PHASE2-CONSOLE-ASSEMBLY）：TodayPlanTable「负责组」下拉的数据源，
  // 替掉原先借 dep-graph 节点反查组名的临时办法（无任务的组不会漏进下拉）。
  // **刀④ PROGRAM-GROUP-ABSTRACT**：响应补派生位 `assignableGroupIds`（叶子组且非哨兵，server 侧
  // deriveLeafGroups 现算）——「可领任务/可挂人」的可选组集合，候选过滤统一消费它；groups 仍全量
  // （组树展示/汇报视角需要非叶子+哨兵在场）。
  getGroups(): Promise<{ groups: Group[]; assignableGroupIds: string[] }>;
  // 组管理最小版（刀④，D-072「设置页可增减组」前置缺口）：新建叶子组 / 改名（仅叶子）/ 删除
  // （仅叶子 + 防孤儿守卫；失败原因经 {detail} 透出）。
  createGroup(req: CreateGroupRequest): Promise<GroupResponse>;
  renameGroup(id: string, req: RenameGroupRequest): Promise<GroupResponse>;
  deleteGroup(id: string): Promise<GroupResponse>;
  // 轻身份（IDENTITY-LITE，I2 console 接线）：GET 两模式均可读（报当前部署模式 + 当前身份，未登录/
  // 匿名模式 session 恒 null）；POST 登录（选人 + 可选 PIN）；DELETE 登出。匿名模式下 POST/DELETE
  // 服务端 404（前端只在 mode==='identity' 才渲染登录入口，不主动调用）。
  getSession(): Promise<SessionResponse>;
  login(req: SessionRequest): Promise<SessionResponse>;
  logout(): Promise<SessionResponse>;
  // 首启动向导（SETUP-WIZARD 刀②，setup-wizard.md §3/§5）。两态启动的前端入口：
  // 读 GET /api/setup/state（initialized:false → 渲染全屏向导；true → 正常 app；dataDirHasData 供升级迁移提示）；
  // 写 POST /api/setup/init（选 dataMode+identityMode → 服务端写 config.json → 回 restarting:true → exit 42 自动重启）。
  // 已初始化后再调 init 恒 409（多标签页幂等），前端当作「已完成」进重启轮询。
  getSetupState(): Promise<SetupStateResponse>;
  initSetup(req: SetupInitRequest): Promise<SetupInitResponse>;
  // 部署配置写通道（SETUP-WIZARD 刀③，setup-wizard.md §6）：设置页「部署配置」写区调用。
  // setConfig = PUT /api/setup/config 改登录方式（identityMode）；graduate = POST /api/setup/graduate
  // 结束试驾转正式（无 body）。两者写完 config.json → 服务端 exit 42 自动重启 → 回 {restarting:true}，
  // 前端据此进重启轮询 → 整页刷新。鉴权：身份模式须持旗管理员（403）、匿名模式走写门（与 init 同 Bearer）。
  setConfig(req: SetupConfigRequest): Promise<SetupConfigResponse>;
  graduate(): Promise<SetupGraduateResponse>;
  // 成员名册只读（登录选人 + 任务 ownerId 选人共同数据源）。剥 pinHash（MemberPublicSchema，密钥纪律）；
  // 两模式均可读（名册非隐私，读侧全开，同 I0 先例）。
  getMembers(): Promise<{ members: MemberPublic[] }>;
  // 图纸提交日志/版本时间线（档案页）：与总览第 7 个 fetch 同源 /api/artifacts，读治理快照。
  getArtifacts(): Promise<ArtifactsResponse>;
  // 写侧（PM 录入簇 + KB 结案）。I0：confirmedBy 随依赖/需求请求传入但读视图永不回显；
  // 创建响应回完整对象（回给录入本人，非第三方）。
  createTask(req: CreateTaskRequest): Promise<CreateTaskResponse>;
  createDependency(
    req: CreateDependencyRequest,
  ): Promise<CreateDependencyResponse>;
  createNeed(req: CreateNeedRequest): Promise<CreateNeedResponse>;
  closeoutKb(req: KbCloseoutRequest): Promise<KbCloseoutResponse>;
  // 受限状态机迁移（非创建）：任务状态流转 + 连线作废（软删除）。POST 子资源动作，命中后端写鉴权钩子。
  updateTaskStatus(
    taskId: string,
    status: TaskStatus,
  ): Promise<TransitionTaskStatusResponse>;
  waiveDependency(depId: string): Promise<WaiveDependencyResponse>;
  // 图纸档案写侧（V1-FOLLOWUPS ④，append-only）。I0：请求无人维度，submittedVia 由 server 钉 console（C5）。
  createArtifact(req: CreateArtifactRequest): Promise<CreateArtifactResponse>;
  // 给既有图纸上传/替换真实文件（multipart，HUB-ARTIFACT-STORE-MECH 本地卷）。字节进本地卷、回带 storedFile 指针。
  uploadArtifactFile(id: string, file: File): Promise<UploadArtifactResponse>;
  // 库存 / BOM（INV-BOM-CORE）。读：零件 + 个体件 + 矩阵派生 + 缺料；I0：返回体无人维度。
  // 写：盘点 / 调整零件 + 一句话快记动作（source 由 server 钉 human，C5；recordedBy 绝无 memberId）。
  getInventory(): Promise<InventoryResponse>;
  upsertPartType(req: CreatePartTypeRequest): Promise<CreatePartTypeResponse>;
  recordPartAction(req: CreatePartActionRequest): Promise<CreatePartActionResponse>;
  // 接力交接画布（R1，D-029）。读：派生「一排接力站 + 站间交接线」（windowLabel）。
  // 写：PATCH 占用窗口受限编辑（队长拖卡片排先后 orderInWindow / 选填 eta）；POST/DELETE 接力交接线。
  // 反监视红线：stages / handoffs / 任何返回体绝不含 memberId / invitedMemberIds / 出勤计数。
  getRelay(windowLabel: string): Promise<RelayBoardResponse>;
  updateResourceSession(
    id: string,
    patch: UpdateResourceSessionRequest,
  ): Promise<UpdateResourceSessionResponse>;
  // A2 加一棒（POST /api/resource-sessions）：队长在画布上新增一条占用窗口（选机器人 + 任务 → 该机器人末棒 +1）。
  // confirmedBy 随请求传入（录入即拍板）；I0：响应剥 confirmedBy，invitedMemberIds 由调用方传空。
  createResourceSession(
    req: CreateResourceSessionRequest,
  ): Promise<CreateResourceSessionResponse>;
  createRelayHandoff(
    req: CreateRelayHandoffRequest,
  ): Promise<RelayHandoffResponse>;
  deleteRelayHandoff(id: string): Promise<{ deleted: string }>;
  // A2 删一棒（DELETE /api/resource-sessions/:id）：删卡，后端级联删引用它的接力交接线（箭头不悬空）。
  deleteResourceSession(id: string): Promise<{ deleted: string }>;
  // 今日计划表格（D-082）。写每车默认阵型（传 null=清除该车预设）；批量原子确认落盘
  // （【确认】按钮一次性 POST，全部校验通过才落盘，避免半成功）。I0：批量请求即便夹带
  // invitedMemberIds，服务端也原地清空——console 侧仍恒传 []（双保险，不依赖信任后端）。
  updateResourceDefaultPreset(
    id: string,
    patch: UpdateResourceDefaultPresetRequest,
  ): Promise<UpdateResourceDefaultPresetResponse>;
  createResourceSessionsBatch(
    req: CreateResourceSessionsBatchRequest,
  ): Promise<CreateResourceSessionsBatchResponse>;
  // 门检查单 / 欠条（GATE-CHECKLIST-IOU，D-087）。读：该赛季基准线下所有检查项 / 欠条——**带名不剥**
  // （clearedBy/waivedBy = D-085 事实层，读契约直回完整 item）。写：现场快记欠条（任何人）/ 标清偿（任何
  // 人，身份模式本人一键、匿名模式 body 供名）/ 书面豁免（仅验收人名单，强制写理由，403 拒非名单人）。
  // seasonId 走 querystring（照 GET/PATCH /api/baseline 同族风格）。红线：本域绝无按人聚合/排行/按人筛选端点。
  getChecklist(seasonId: string): Promise<ChecklistItemsResponse>;
  createChecklistItem(
    seasonId: string,
    req: CreateChecklistItemRequest,
  ): Promise<CreateChecklistItemResponse>;
  clearChecklistItem(
    id: string,
    seasonId: string,
    req: ClearChecklistItemRequest,
  ): Promise<ClearChecklistItemResponse>;
  waiveChecklistItem(
    id: string,
    seasonId: string,
    req: WaiveChecklistItemRequest,
  ): Promise<WaiveChecklistItemResponse>;
  // 验收人名单维护（D-087 拍板②）：设 / 撤该成员的门验收人资格（每年换届更新）。响应剥 pinHash。
  setMemberGateReviewer(
    id: string,
    req: SetGateReviewerRequest,
  ): Promise<SetGateReviewerResponse>;
  // 成员角色维护（K1 权限地基 + MEMBER-PM-FLAG 刀②b）：设成员组织身份（groupAdmin/member 两档）。
  // 匿名=写门即可 / 身份=须持旗管理员（服务端 403）。响应剥 pinHash。
  setMemberRole(id: string, req: SetMemberRoleRequest): Promise<SetMemberRoleResponse>;
  // 项目管理旗标授 / 收（MEMBER-PM-FLAG 刀②b）：原 superAdmin 的正交化写口。匿名=写门即可 /
  // 身份=须持旗管理员（403）；降级保护=不摘最后一个持旗成员（409）。响应剥 pinHash。
  setMemberProjectManager(
    id: string,
    req: SetProjectManagerRequest,
  ): Promise<SetProjectManagerResponse>;
  // 初始化首个管理员（K1 + 旗标化）：身份模式 only（匿名 404）；名册无持旗成员时给登录本人授旗 +
  // 同笔设 pinHash（否则 409）。响应剥 pinHash。
  setupSuperAdmin(req: SetupSuperAdminRequest): Promise<SetupSuperAdminResponse>;
  // 重置成员 PIN（公测余项⑦ PIN-RESET）：身份模式 only（匿名 404）+ 须持旗管理员（服务端 403）。
  // 清目标 pinHash → 成员回免 PIN 态，下次登录经首设流程自行重设（本端点不经手新 PIN 明文）。响应剥 pinHash。
  clearMemberPin(id: string): Promise<ClearPinResponse>;
  // 显示成员 PIN（打磨轮刀⑧② pinPlaintext 唯一透出口）：身份模式 only（匿名 404）；本人或持旗管理员
  // 单条读取（服务端 403 兜底）；未设 / 旧数据无副本 → 404「未设置 PIN」（UI 据此显示「未设置」）。
  getMemberPin(id: string): Promise<MemberPinResponse>;
  // 名册导入（ROSTER-IMPORT，K8）。模板：GET 直链（下载按钮 href，不走 fetch）；导入：上传 CSV（multipart，
  // 引导豁免——身份模式名册为空时免登录）。响应 = 六段导入报告（名单事实回显给操作者本人，I0 无聚合统计）。
  // 刀⑦（ROSTER-IMPORT-PREVIEW）：上传 → previewRoster 只解析不落库 → 预览表编辑 → importRosterRows
  // JSON 提交导入（坏行绝不进提交）。importRoster（multipart 一步导入）保留可用。
  rosterTemplateUrl(): string;
  importRoster(file: File): Promise<RosterImportReport>;
  previewRoster(file: File): Promise<RosterPreviewResponse>;
  importRosterRows(rows: RosterImportRow[]): Promise<RosterImportReport>;
  // 库存批量导入（INV-BULK-IMPORT 刀⑪，结构照名册刀⑦）：模板 GET 直链；上传 → previewInventory
  // 只解析不落库 → 预览表编辑 → importInventoryRows JSON 提交导入。报告 = 三段（created/updated=
  // 件号、failed=行号+原因），库存事实回显（I0 无人键）。
  inventoryTemplateUrl(): string;
  previewInventory(file: File): Promise<InventoryPreviewResponse>;
  importInventoryRows(rows: InventoryImportRow[]): Promise<InventoryImportReport>;
  // KB 批量 md 导入（KB-BULK-MD-IMPORT 打磨轮刀⑫）：初始化向导知识库步——多文件 multipart 上传
  // （.md/.markdown，服务端按 title 幂等去重）。响应 = 三段报告（imported/skipped/failed，文档事实回显，I0 无人键）。
  importKbDocs(files: File[]): Promise<KbImportDocsReport>;
  // 挂单认领制窄写动作（TASK-POST-CLAIM，D-088）。全部 POST 子资源、继承 H3 写门；留名 actor 沿
  // IDENTITY-LITE（身份模式服务端从 session 注入、匿名模式 body 供名）。红线：留名只落单条任务卡，
  // 本簇绝无按人聚合/排行/按人筛选端点。响应统一 { task }（TaskSchema，不带 isBig 元）。
  claimTask(taskId: string, req: ClaimTaskRequest): Promise<ClaimTaskResponse>; // §3 认领：即生效免确认
  assignTask(taskId: string, req: AssignTaskRequest): Promise<AssignTaskResponse>; // §3 指派/转派：组长+强制理由
  setTaskPartner(
    taskId: string,
    req: SetTaskPartnerRequest,
  ): Promise<SetTaskPartnerResponse>; // §4 本组搭档补位
  confirmCrossClaim(
    taskId: string,
    req: ConfirmCrossClaimRequest,
  ): Promise<ConfirmCrossClaimResponse>; // §4 跨组大任务组长事后确认（非启动闸）
  completeTask(
    taskId: string,
    req: CompleteTaskRequest,
  ): Promise<CompleteTaskResponse>; // §5 标完成留名
  reviewTask(taskId: string, req: ReviewTaskRequest): Promise<ReviewTaskResponse>; // §5 验收（accept）/ 打回（reject）
}

export function createHubApiClient(options: HubApiClientOptions = {}): HubApiClient {
  // 单一真实后端：baseUrl 为空 / '/' → 同源相对路径；否则用给定绝对地址。
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetcher = options.fetcher ?? fetch;
  const writeToken = options.writeToken?.trim() || undefined;
  return {
    async getOverview() {
      const [
        health,
        system,
        botChannels,
        agentBackends,
        dataSources,
        events,
        bridgeMembers,
        gitRepos,
        artifacts,
      ] = await Promise.all([
        fetchJson(`${baseUrl}/health`, HealthResponseSchema, fetcher),
        fetchJson(
          `${baseUrl}/api/system/status`,
          SystemStatusResponseSchema,
          fetcher,
        ),
        fetchJson(
          `${baseUrl}/api/bot-channels`,
          BotChannelsResponseSchema,
          fetcher,
        ),
        fetchJson(
          `${baseUrl}/api/agent-backends`,
          AgentBackendsResponseSchema,
          fetcher,
        ),
        fetchJson(
          `${baseUrl}/api/data-sources`,
          DataSourcesResponseSchema,
          fetcher,
        ),
        fetchJson(`${baseUrl}/api/events`, HubEventsResponseSchema, fetcher),
        fetchJson(
          `${baseUrl}/api/bridge/members`,
          BridgeMembersResponseSchema,
          fetcher,
        ),
        fetchJson(`${baseUrl}/api/git/repos`, GitReposResponseSchema, fetcher),
        fetchJson(`${baseUrl}/api/artifacts`, ArtifactsResponseSchema, fetcher),
      ]);

      return OverviewSnapshotSchema.parse({
        health,
        system,
        botChannels,
        agentBackends,
        dataSources,
        events,
        bridgeMembers,
        gitRepos,
        artifacts,
      });
    },
    async getSystemStatus() {
      return fetchJson(
        `${baseUrl}/api/system/status`,
        SystemStatusResponseSchema,
        fetcher,
      );
    },
    async getDepGraph() {
      return fetchJson(`${baseUrl}/api/dep-graph`, DepGraphSchema, fetcher);
    },
    async getGroupGaps() {
      return fetchJson(
        `${baseUrl}/api/group-gaps`,
        GroupGapsResponseSchema,
        fetcher,
      );
    },
    async getSchedule(windowLabel: string) {
      return fetchJson(
        `${baseUrl}/api/schedule?windowLabel=${encodeURIComponent(windowLabel)}`,
        PresenceScheduleResponseSchema,
        fetcher,
      );
    },
    async getResourceSessions() {
      return fetchJson(
        `${baseUrl}/api/resource-sessions`,
        ResourceSessionsResponseSchema,
        fetcher,
      );
    },
    async getResources() {
      return fetchJson(
        `${baseUrl}/api/resources`,
        SharedResourcesResponseSchema,
        fetcher,
      );
    },
    async createResource(req: CreateResourceRequest) {
      return postJson(
        `${baseUrl}/api/resources`,
        req,
        CreateResourceResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async createResourcesBatch(req: CreateResourcesBatchRequest) {
      return postJson(
        `${baseUrl}/api/resources/batch`,
        req,
        CreateResourcesBatchResponseSchema,
        fetcher,
        writeToken,
      );
    },
    fleetTemplateUrl() {
      // 模板下载 = 直链 GET（浏览器原生下载，不走 fetch/Bearer——读端点无鉴权）。
      return `${baseUrl}/api/resources/template`;
    },
    async previewFleet(file: File) {
      return postFormData(
        `${baseUrl}/api/resources/preview`,
        file,
        FleetPreviewResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async updateResourceStatus(id: string, patch: UpdateResourceStatusRequest) {
      return sendJson(
        'PATCH',
        `${baseUrl}/api/resources/${encodeURIComponent(id)}/status`,
        patch,
        UpdateResourceResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async getKbSimilar(params: KbSimilarParams) {
      const qs = new URLSearchParams();
      qs.set('symptom', params.symptom);
      if (params.projectId) qs.set('projectId', params.projectId);
      if (params.tags && params.tags.length > 0) {
        qs.set('tags', params.tags.join(','));
      }
      if (params.limit != null) qs.set('limit', String(params.limit));
      if (params.minScore != null) qs.set('minScore', String(params.minScore));
      return fetchJson(
        `${baseUrl}/api/kb/similar?${qs.toString()}`,
        KbSimilarResponseSchema,
        fetcher,
      );
    },
    async getTasks(query?: { q?: string }) {
      const q = query?.q?.trim();
      const qs = q ? `?q=${encodeURIComponent(q)}` : '';
      return fetchJson(`${baseUrl}/api/tasks${qs}`, TasksResponseSchema, fetcher);
    },
    async getSeasons() {
      return fetchJson(`${baseUrl}/api/seasons`, SeasonsResponseSchema, fetcher);
    },
    async createSeason(req: CreateSeasonRequest) {
      return postJson(
        `${baseUrl}/api/seasons`,
        req,
        CreateSeasonResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async getBaseline(seasonId: string) {
      return fetchJson(
        `${baseUrl}/api/baseline?seasonId=${encodeURIComponent(seasonId)}`,
        BaselineResponseSchema,
        fetcher,
      );
    },
    async updateBaseline(seasonId: string, req: UpdateBaselineRequest) {
      return sendJson(
        'PATCH',
        `${baseUrl}/api/baseline?seasonId=${encodeURIComponent(seasonId)}`,
        req,
        UpdateBaselineResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async getGroups() {
      return fetchJson(`${baseUrl}/api/groups`, GroupsResponseSchema, fetcher);
    },
    // 组管理最小版（PROGRAM-GROUP-ABSTRACT 刀④）：设置页「组」分区消费——新建叶子组 / 改名 / 删除
    // （守卫在服务端 store 同一临界区：非叶子/哨兵 409、防孤儿 409、同名 409，detail 透出给表单）。
    async createGroup(req: CreateGroupRequest) {
      return postJson(
        `${baseUrl}/api/groups`,
        req,
        GroupResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async renameGroup(id: string, req: RenameGroupRequest) {
      return sendJson(
        'PUT',
        `${baseUrl}/api/groups/${encodeURIComponent(id)}`,
        req,
        GroupResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async deleteGroup(id: string): Promise<GroupResponse> {
      return sendJson(
        'DELETE',
        `${baseUrl}/api/groups/${encodeURIComponent(id)}`,
        undefined,
        GroupResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async getSession() {
      return fetchJson(`${baseUrl}/api/session`, SessionResponseSchema, fetcher);
    },
    async login(req: SessionRequest) {
      return postJson(
        `${baseUrl}/api/session`,
        req,
        SessionResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async logout() {
      return sendJson(
        'DELETE',
        `${baseUrl}/api/session`,
        undefined,
        SessionResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async getSetupState() {
      return fetchJson(
        `${baseUrl}/api/setup/state`,
        SetupStateResponseSchema,
        fetcher,
      );
    },
    async initSetup(req: SetupInitRequest) {
      return postJson(
        `${baseUrl}/api/setup/init`,
        req,
        SetupInitResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async setConfig(req: SetupConfigRequest) {
      return sendJson(
        'PUT',
        `${baseUrl}/api/setup/config`,
        req,
        SetupConfigResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async graduate() {
      // 无 body（当前部署即目标）：sendJson body=undefined → 不发请求体、不设 content-type。
      return sendJson(
        'POST',
        `${baseUrl}/api/setup/graduate`,
        undefined,
        SetupGraduateResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async getMembers() {
      return fetchJson(`${baseUrl}/api/members`, MembersResponseSchema, fetcher);
    },
    async getArtifacts() {
      return fetchJson(
        `${baseUrl}/api/artifacts`,
        ArtifactsResponseSchema,
        fetcher,
      );
    },
    async createTask(req: CreateTaskRequest) {
      return postJson(
        `${baseUrl}/api/tasks`,
        req,
        CreateTaskResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async createDependency(req: CreateDependencyRequest) {
      return postJson(
        `${baseUrl}/api/dependencies`,
        req,
        CreateDependencyResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async createNeed(req: CreateNeedRequest) {
      return postJson(
        `${baseUrl}/api/needs`,
        req,
        CreateNeedResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async closeoutKb(req: KbCloseoutRequest) {
      return postJson(
        `${baseUrl}/api/kb/closeout`,
        req,
        KbCloseoutResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async updateTaskStatus(taskId: string, status: TaskStatus) {
      return postJson(
        `${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/status`,
        { status },
        TransitionTaskStatusResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async waiveDependency(depId: string) {
      return postJson(
        `${baseUrl}/api/dependencies/${encodeURIComponent(depId)}/waive`,
        {},
        WaiveDependencyResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async createArtifact(req: CreateArtifactRequest) {
      return postJson(
        `${baseUrl}/api/artifacts`,
        req,
        CreateArtifactResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async uploadArtifactFile(id: string, file: File) {
      return postFormData(
        `${baseUrl}/api/artifacts/${encodeURIComponent(id)}/upload`,
        file,
        UploadArtifactResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async getInventory() {
      return fetchJson(
        `${baseUrl}/api/inventory`,
        InventoryResponseSchema,
        fetcher,
      );
    },
    async upsertPartType(req: CreatePartTypeRequest) {
      return postJson(
        `${baseUrl}/api/inventory/part-types`,
        req,
        CreatePartTypeResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async recordPartAction(req: CreatePartActionRequest) {
      return postJson(
        `${baseUrl}/api/inventory/actions`,
        req,
        CreatePartActionResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async getRelay(windowLabel: string) {
      return fetchJson(
        `${baseUrl}/api/relay?windowLabel=${encodeURIComponent(windowLabel)}`,
        RelayBoardResponseSchema,
        fetcher,
      );
    },
    async updateResourceSession(
      id: string,
      patch: UpdateResourceSessionRequest,
    ) {
      return sendJson(
        'PATCH',
        `${baseUrl}/api/resource-sessions/${encodeURIComponent(id)}`,
        patch,
        UpdateResourceSessionResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async createResourceSession(req: CreateResourceSessionRequest) {
      return postJson(
        `${baseUrl}/api/resource-sessions`,
        req,
        CreateResourceSessionResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async createRelayHandoff(req: CreateRelayHandoffRequest) {
      return postJson(
        `${baseUrl}/api/relay-handoffs`,
        req,
        RelayHandoffResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async deleteRelayHandoff(id: string) {
      return sendJson(
        'DELETE',
        `${baseUrl}/api/relay-handoffs/${encodeURIComponent(id)}`,
        undefined,
        DeletedResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async deleteResourceSession(id: string) {
      return sendJson(
        'DELETE',
        `${baseUrl}/api/resource-sessions/${encodeURIComponent(id)}`,
        undefined,
        DeletedResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async updateResourceDefaultPreset(
      id: string,
      patch: UpdateResourceDefaultPresetRequest,
    ) {
      return sendJson(
        'PATCH',
        `${baseUrl}/api/resources/${encodeURIComponent(id)}/preset`,
        patch,
        UpdateResourceDefaultPresetResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async createResourceSessionsBatch(req: CreateResourceSessionsBatchRequest) {
      return postJson(
        `${baseUrl}/api/resource-sessions/batch`,
        req,
        CreateResourceSessionsBatchResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async getChecklist(seasonId: string) {
      return fetchJson(
        `${baseUrl}/api/checklist?seasonId=${encodeURIComponent(seasonId)}`,
        ChecklistItemsResponseSchema,
        fetcher,
      );
    },
    async createChecklistItem(seasonId: string, req: CreateChecklistItemRequest) {
      return postJson(
        `${baseUrl}/api/checklist?seasonId=${encodeURIComponent(seasonId)}`,
        req,
        CreateChecklistItemResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async clearChecklistItem(
      id: string,
      seasonId: string,
      req: ClearChecklistItemRequest,
    ) {
      return postJson(
        `${baseUrl}/api/checklist/${encodeURIComponent(id)}/clear?seasonId=${encodeURIComponent(seasonId)}`,
        req,
        ClearChecklistItemResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async waiveChecklistItem(
      id: string,
      seasonId: string,
      req: WaiveChecklistItemRequest,
    ) {
      return postJson(
        `${baseUrl}/api/checklist/${encodeURIComponent(id)}/waive?seasonId=${encodeURIComponent(seasonId)}`,
        req,
        WaiveChecklistItemResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async setMemberGateReviewer(id: string, req: SetGateReviewerRequest) {
      return sendJson(
        'PUT',
        `${baseUrl}/api/members/${encodeURIComponent(id)}/gate-reviewer`,
        req,
        SetGateReviewerResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async setMemberRole(id: string, req: SetMemberRoleRequest) {
      return sendJson(
        'PUT',
        `${baseUrl}/api/members/${encodeURIComponent(id)}/role`,
        req,
        SetMemberRoleResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async setMemberProjectManager(id: string, req: SetProjectManagerRequest) {
      return sendJson(
        'PUT',
        `${baseUrl}/api/members/${encodeURIComponent(id)}/project-manager`,
        req,
        SetProjectManagerResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async setupSuperAdmin(req: SetupSuperAdminRequest) {
      return postJson(
        `${baseUrl}/api/setup/super-admin`,
        req,
        SetupSuperAdminResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async clearMemberPin(id: string) {
      return sendJson(
        'DELETE',
        `${baseUrl}/api/members/${encodeURIComponent(id)}/pin`,
        undefined,
        ClearPinResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async getMemberPin(id: string) {
      return fetchJson(
        `${baseUrl}/api/members/${encodeURIComponent(id)}/pin`,
        MemberPinResponseSchema,
        fetcher,
      );
    },
    rosterTemplateUrl() {
      // 模板下载 = 直链 GET（浏览器原生下载，不走 fetch/Bearer——读端点无鉴权）。
      return `${baseUrl}/api/roster/template`;
    },
    async importRoster(file: File) {
      return postFormData(
        `${baseUrl}/api/roster/import`,
        file,
        RosterImportReportSchema,
        fetcher,
        writeToken,
      );
    },
    async previewRoster(file: File) {
      return postFormData(
        `${baseUrl}/api/roster/preview`,
        file,
        RosterPreviewResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async importRosterRows(rows: RosterImportRow[]) {
      return postJson(
        `${baseUrl}/api/roster/import`,
        { rows },
        RosterImportReportSchema,
        fetcher,
        writeToken,
      );
    },
    inventoryTemplateUrl() {
      // 模板下载 = 直链 GET（浏览器原生下载，不走 fetch/Bearer——读端点无鉴权）。
      return `${baseUrl}/api/inventory/template`;
    },
    async previewInventory(file: File) {
      return postFormData(
        `${baseUrl}/api/inventory/preview`,
        file,
        InventoryPreviewResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async importInventoryRows(rows: InventoryImportRow[]) {
      return postJson(
        `${baseUrl}/api/inventory/import`,
        { rows },
        InventoryImportReportSchema,
        fetcher,
        writeToken,
      );
    },
    async importKbDocs(files: File[]) {
      return postMultiFormData(
        `${baseUrl}/api/kb/import-docs`,
        files,
        KbImportDocsReportSchema,
        fetcher,
        writeToken,
      );
    },
    async claimTask(taskId: string, req: ClaimTaskRequest) {
      return postJson(
        `${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/claim`,
        req,
        ClaimTaskResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async assignTask(taskId: string, req: AssignTaskRequest) {
      return postJson(
        `${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/assign`,
        req,
        AssignTaskResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async setTaskPartner(taskId: string, req: SetTaskPartnerRequest) {
      return postJson(
        `${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/partner`,
        req,
        SetTaskPartnerResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async confirmCrossClaim(taskId: string, req: ConfirmCrossClaimRequest) {
      return postJson(
        `${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/confirm-cross-claim`,
        req,
        ConfirmCrossClaimResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async completeTask(taskId: string, req: CompleteTaskRequest) {
      return postJson(
        `${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/complete`,
        req,
        CompleteTaskResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async reviewTask(taskId: string, req: ReviewTaskRequest) {
      return postJson(
        `${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/review`,
        req,
        ReviewTaskResponseSchema,
        fetcher,
        writeToken,
      );
    },
  };
}

// DELETE /api/relay-handoffs/:id 命中返回 { deleted: id }（server.ts:541）。
const DeletedResponseSchema = z.object({ deleted: z.string().min(1) });

function normalizeBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim();
  // 空或 '/' → 同源相对路径（dev 走 vite proxy，同源部署直接命中 /api）。
  if (!trimmed || trimmed === '/') {
    return '';
  }
  return trimmed.replace(/\/+$/, '');
}

async function fetchJson<T>(
  url: string,
  schema: { parse(value: unknown): T },
  fetcher: FetchLike,
): Promise<T> {
  const response = await fetcher(url);
  if (!response.ok) {
    // 读侧也透出后端 { detail }（与 sendJson 对称）：否则只剩 "Hub API 400: url"、真实原因丢失。
    const detail = await readDetail(response);
    throw new Error(
      detail ? `${response.status}: ${detail}` : `Hub API ${response.status}: ${url}`,
    );
  }
  return schema.parse(await response.json());
}

function postJson<T>(
  url: string,
  body: unknown,
  schema: { parse(value: unknown): T },
  fetcher: FetchLike,
  writeToken?: string,
): Promise<T> {
  return sendJson('POST', url, body, schema, fetcher, writeToken);
}

// 写侧通用发送（POST/PATCH/DELETE 共用）。R1 引入 PATCH 占用窗口 / DELETE 接力线，与 POST
// 同走 Bearer 写鉴权 + { detail } 错误透出。body=undefined 时不发请求体（DELETE 无体）。
async function sendJson<T>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  body: unknown,
  schema: { parse(value: unknown): T },
  fetcher: FetchLike,
  writeToken?: string,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (writeToken) headers.authorization = `Bearer ${writeToken}`;
  const response = await fetcher(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    // 后端校验失败（400/422）带 { detail }：透出给表单错误条，便于人看清缺了什么。
    const detail = await readDetail(response);
    throw new Error(
      detail ? `${response.status}: ${detail}` : `Hub API ${response.status}: ${url}`,
    );
  }
  return schema.parse(await response.json());
}

// 文件上传（multipart）：不能走 sendJson（它 JSON.stringify body）。用 FormData，**不手设 content-type**——
// 浏览器自带 multipart boundary；写鉴权 Bearer 同 sendJson；错误同走 { detail } 透出。
async function postFormData<T>(
  url: string,
  file: File,
  schema: { parse(value: unknown): T },
  fetcher: FetchLike,
  writeToken?: string,
): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const headers: Record<string, string> = {};
  if (writeToken) headers.authorization = `Bearer ${writeToken}`;
  const response = await fetcher(url, { method: 'POST', headers, body: form });
  if (!response.ok) {
    const detail = await readDetail(response);
    throw new Error(
      detail ? `${response.status}: ${detail}` : `Hub API ${response.status}: ${url}`,
    );
  }
  return schema.parse(await response.json());
}

// 多文件上传（KB-BULK-MD-IMPORT 刀⑫）：与 postFormData 同律，同名字段 'files' 逐文件 append——
// 服务端 request.files() 收全部文件 part（字段名不拘，'files' 与读取方式对齐语义）。
async function postMultiFormData<T>(
  url: string,
  files: readonly File[],
  schema: { parse(value: unknown): T },
  fetcher: FetchLike,
  writeToken?: string,
): Promise<T> {
  const form = new FormData();
  for (const file of files) form.append('files', file);
  const headers: Record<string, string> = {};
  if (writeToken) headers.authorization = `Bearer ${writeToken}`;
  const response = await fetcher(url, { method: 'POST', headers, body: form });
  if (!response.ok) {
    const detail = await readDetail(response);
    throw new Error(
      detail ? `${response.status}: ${detail}` : `Hub API ${response.status}: ${url}`,
    );
  }
  return schema.parse(await response.json());
}

async function readDetail(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    return typeof body.detail === 'string' ? body.detail : null;
  } catch {
    return null;
  }
}
