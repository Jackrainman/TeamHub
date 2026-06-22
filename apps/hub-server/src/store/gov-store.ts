import type {
  ArchiveDocument,
  ArtifactRef,
  Dependency,
  ErrorEntry,
  GovernanceSnapshot,
  InventorySnapshot,
  IssueCard,
  KbSnapshot,
  KnowledgeNode,
  Need,
  PartAction,
  PartActionSource,
  PartType,
  RelayHandoff,
  ResourceSession,
  ResourceStatus,
  SharedResource,
  Task,
  TaskStatus,
} from '@teamhub/hub-contracts';

/**
 * 写方法入参（draft）：调用方只给「人本字段」，Store 实现负责补齐 id / 时间戳 / 派生默认。
 * 接口先行——base 收口刀只钉签名，写入实现 + 路由后置（PM / KB-CORE 落地时各自接，D-042 决策 5）。
 */

/**
 * createTask 入参：title/projectId/groupId/rawSummary/robotTarget/intrinsicComplexity/ownerId/collaboratorIds 等人本字段。
 * status/statusSource 可省略 → 实现默认 `pending` / `'console'`（C5：真实进度优先 git/lark 派生信号，console 录入是兜底）。
 * lastProgressAt 不由调用方给（由 commit/check-in 派生信号回填），故从 draft 剔除。
 */
export type TaskDraft = Omit<
  Task,
  'id' | 'status' | 'statusSource' | 'lastProgressAt' | 'createdAt' | 'updatedAt'
> &
  Partial<Pick<Task, 'status' | 'statusSource'>>;

/**
 * createDependency 入参：人手建的有向边——「卡住 = 在等哪个上游任务」是结构键（G2：blockedBy 由
 * Dependency 边经 toDepGraphView 派生、永不在 Task 上另存）。aiSuggested 边 confirmedBy=null 时只进建议视图。
 * **status 不由调用方给**（D-042 clamp 初始态）：新边 Store 钉 `active`（上游未满足=被卡），satisfied/waived 由
 * 后续派生/人工 waive 转。**confirmedBy（用户拍板 Q1=ActorRef 作内部凭证）**：人建边记 {id:memberId, source}，
 * 仅作内部归因凭证——**永不经读视图对第三方暴露、永不用于排名**（toDepGraphView 不输出 confirmedBy；I0/A4）。
 */
export type DependencyDraft = Omit<
  Dependency,
  'id' | 'status' | 'createdAt' | 'updatedAt'
>;

/**
 * createNeed 入参：前置需求一等公民（G3）。缺口归组 providerGroupId、不归人（A1）；
 * claimedByMemberId 仅本人主动认领才填，非派单（C4 / A2）。
 * **status/openedAt/escalatedAt/claimedByMemberId 不由调用方给**（D-042 clamp 初始态 + A2 反派单）：新 Need
 * Store 钉 `open`、openedAt=now、escalatedAt=null、**claimedByMemberId=null**——新缺口必为「未认领」，
 * 认领是本人后续主动动作（非创建时由队长直接指派=派单，违 A2/C4）；escalated 仅「事持续无人认领」升级
 * （A4：升级的是事不是人）。confirmedBy 同 Dependency=内部凭证。
 */
export type NeedDraft = Omit<
  Need,
  'id' | 'status' | 'openedAt' | 'escalatedAt' | 'claimedByMemberId'
>;

/**
 * closeoutKbNode 入参：KB-CORE 结案派生的知识节点（IssueCard→…→Archive 闭环的源 payload 类型
 * 随 KB-CORE 移植 schema 后补全；本刀先钉派生出口=KnowledgeNode，复用同一 GovernanceSnapshot）。
 */
export type KnowledgeNodeDraft = Omit<KnowledgeNode, 'id' | 'createdAt'>;

/**
 * appendArtifact 入参：图纸/归档物提交日志的一条新记录（HUB-ARTIFACT-ARCHIVE-V2，append-only）。
 * 调用方给的字段分两类：
 *   - **人填**：mechanism（机构分组键）/ name / uri + v2 新增分组维度 ownerGroup（机械/电路）/
 *     season（赛季）/ robotCode（车代号 R1/R2）/ 电路 subType（drawing/driver）+ 可选 relatedRepo/relatedCommit。
 *   - **路由派生后并入 draft（C5：server 钉，客户端不给）**：kind（ownerGroup+subType 派生）/ versionNo
 *     （四键 ownerGroup+season+robotCode+mechanism 在全量 artifacts 上自增）/ revision（`v${versionNo}`）。
 * Store 仍补 id + createdAt、**钉 submittedVia=`console`**，故从 draft 剔除 id / createdAt / submittedVia
 * （ArtifactDraft 类型本身不随 v2 变——新字段都只是 ArtifactRef 上的字段，draft 自然携带；store body 零逻辑改动）。
 * **I0**：本 draft 无任何 person 字段（ArtifactRef 永无 person 维度），绝不收提交人——
 * 日志主键 = 组 + 赛季 + 车 + 机构 + 版本 + 归档物，永无 memberId。
 */
export type ArtifactDraft = Omit<
  ArtifactRef,
  'id' | 'createdAt' | 'submittedVia'
>;

/**
 * createResourceSession 入参（D-029 差异化在场排班）：队长一拍即录的「占用窗口」。
 * 逐字镜像 NeedDraft/DependencyDraft 范式——Store 补 id/createdAt、钉 `source='human'`（C5 来源 seam server 钉，
 * 客户端不冒充 derived/aiSuggested），故 draft 仅 Omit id/source/createdAt。**confirmedBy 随请求传入**
 * （录入即确认拍板：D-029 队长一拍即录，类比 Dependency/Need 的 confirmedBy 内部凭证），保留在 draft。
 * **I0**：派生输出（PresenceRecommendation，由 derivePresenceSchedule 在路由层算）主键 group/resource/task、
 * 永无 memberId；invitedMemberIds 仅本窗操作名单（合法录入字段），绝不跨窗按人累计（反排名护栏）。
 */
export type ResourceSessionDraft = Omit<
  ResourceSession,
  'id' | 'source' | 'createdAt'
>;

/**
 * updateResourceSession 入参（R1 接力画布编辑）：队长拖卡片排先后 / 选填预估完成时间。
 * 只两字段可改——`orderInWindow`（画布内拖动排序）+ `eta`（可空预估完成时间，nullable）；
 * 都 optional（拖卡只动 order、改 eta 只动 eta）。其余字段不开 update 口子（C3 受限编辑）。
 * 与 resourceSessions 同走内存、不落盘（D-029：占用窗口粗粒度临时，重启回 seed）。
 */
export type ResourceSessionPatch = Partial<
  Pick<ResourceSession, 'orderInWindow' | 'eta'>
>;

/**
 * createRelayHandoff 入参（R1 接力画布拉线）：队长在两卡间拉「接力交接线」——先后交接、**非**任务依赖。
 * Store 补 id/createdAt、钉 `source='console'`（C5 来源 seam server 钉），故 draft 仅 Omit id/source/createdAt。
 * `confirmedBy` 随请求传入（拉线即确认拍板，类比 ResourceSession/Dependency 内部凭证），保留在 draft。
 * 与 session.eta 同样走内存、不落盘（D-029）。**反监视红线**：主键只 session/资源/组，永无 memberId。
 */
export type RelayHandoffDraft = Omit<
  RelayHandoff,
  'id' | 'source' | 'createdAt'
>;

/**
 * createResource 入参（R3 车管理 / D-072 §3.2「车 = 带编号对象」）：建一台共享资源（整车）。
 * 人本字段 = projectId / name / kind / robotTarget（车号位）+ 可选 season / version（极低频代次）。
 * **displayCode 禁手写**（D-072 §3.2 决定 K）：**由 Store 内部经 `deriveDisplayCode(season, robotTarget,
 * version ?? 1)` 派生，调用方绝不传**（如同从不传 status/statusSource——故 ResourceDraft 一并 Omit displayCode）。
 * 给了 season 才派生，否则 undefined（读视图回退 name）。Store 还补 id + updatedAt、**钉 status=`available`**
 * （建车一律空闲可用）/ statusReason=null（建时无事实注释）/ statusSource=`console`（C5：来源 seam server 钉）。
 * 故 draft Omit id/status/statusReason/statusSource/displayCode/updatedAt。
 * **反监视红线**：SharedResource 结构无成员维度，draft 也绝不含 memberId / 出勤。
 */
export type ResourceDraft = Omit<
  SharedResource,
  'id' | 'status' | 'statusReason' | 'statusSource' | 'displayCode' | 'updatedAt'
>;

/**
 * updateResourceStatus 入参（R3 改状态 / D-072 §3.3 车生命周期）：既有车的状态迁移
 * （维修 repair / 退役 retired / 拆解 disassembling / 回 available 等）。**退役 = 状态迁移、非物删**
 * （整车留展示——ResourceSession 仍引用 resourceId，物删会悬空；故无 delete 方法）。
 * `statusReason`（"撞坏底盘" 等中性事实注释、非归咎于人）optional+nullable：省略=不动既有 reason、
 * 显式 null=清空、非空串=改写。Store 钉 statusSource=`console`（C5）、bump updatedAt。
 */
export interface ResourceStatusPatch {
  status: ResourceStatus;
  statusReason?: string | null;
}

/**
 * 三支柱共享底座的读写出入口。
 *
 * 读：`getSnapshot()`（D-040 首刀，已实现）。
 * 写（白名单，本刀只定签名、实现后置=throw）：按 frontier#2 KB-CORE / #3 PM 即将需要的**最小集**推导——
 *   - `createTask` / `createDependency` / `createNeed`：PM 项目计划表 C1 兜底录入（任务、依赖图人手建边、缺口暴露）。
 *   - `closeoutKbNode`：KB-CORE 结案派生 `KnowledgeNode`（POST /api/kb/closeout 消费，实现见 InMemoryGovStore）。
 *   - `appendArtifact`：图纸/归档物提交日志追加（V1-FOLLOWUPS ④，POST /api/artifacts 消费）。**append-only**：
 *     只追加、**无 update/delete/list**，不解 ARTIFACT-VERSION-SEMANTICS 进阶语义（revision 是提交者自填的
 *     自由字符串，无自动版本号）。**I0**：日志主键 = 机构(mechanism) + 版本(revision) + 归档物，**永无 memberId**——
 *     ArtifactRef 无任何 person 字段，submittedVia 是来源 seam（git/lark/console）非人，server 钉 `console`（C5）。
 *     **D-042 决策 1（含对抗核实修正，KB-CORE 已兑现）**：结案派生 + `knowledgeNodes/taskKnowledgeTags`
 *     读路径复用同一 `GovernanceSnapshot`、**不必扩本 interface**——这半成立、仍在本接口；相似 bug 检索的
 *     IssueCard 语料**不在本快照内**，已收窄到独立 `KbStore`（见下方）——base 收口刀的「kbStore 暂记 GovStore」
 *     由 KB-CORE 收窄为 KbStore 兑现。INV 的 `PartStock` 仍是唯一需扩 schema 的根（走 invStore? 扩展点）。
 *
 * 宪法护栏（写入实现时必须延续，见 AGENTS §5）：
 *   - **C2 反排名**：白名单永不暴露 memberId 完成量横比维度；Task.ownerId 只表「谁负责」分工（D-041 ② 安全堆）。
 *   - **G2 不双写**：系统库是唯一真相，写入只落本 Store、不回写飞书 Bitable；blockedBy 由 Dependency 边派生、不另存。
 *   - **I0 / confirmedBy**：确认语义记「何时 / 经哪条渠道」（timestamp / ActorRef.source），不退化成可 `groupBy`
 *     的裸 memberId 历史（不能事后算「谁确认最多」）。
 *   - **C1 派生优先**：写入是兜底录入口，不取代 git/lark 派生信号，不得被上层当主录入口退化成新死表。
 *   - **C3 小作坊**：白名单止于三支柱当下所需，不预铺完整 CRUD / RBAC。**五条 append**（四个 create +
 *     `appendArtifact` 图纸日志追加）皆只追加、不开 update/delete/list；另两条**受限状态机迁移**：
 *     `updateTaskStatus`（在既有 TaskStatus 枚举内流转，含 done=标真实完成）与 `waiveDependency`
 *     （转 DependencyStatus 的 waived=人工作废，软删除）。**仍无 list 全家桶 / 物理 delete / RBAC / 任意字段
 *     update**——append 只增不改、状态机两条只在既有枚举上推进文档化的生命周期态，都不开通用 CRUD 口子。
 */
export interface GovStore {
  getSnapshot(): Promise<GovernanceSnapshot>;

  // --- 写方法白名单（接口先行；实现后置=各 Store 当前 throw，见 InMemoryGovStore / SqliteGovStore）---
  createTask(draft: TaskDraft): Promise<Task>;
  createDependency(draft: DependencyDraft): Promise<Dependency>;
  createNeed(draft: NeedDraft): Promise<Need>;
  closeoutKbNode(draft: KnowledgeNodeDraft): Promise<KnowledgeNode>;
  /**
   * 图纸/归档物提交日志追加（POST /api/artifacts，V1-FOLLOWUPS ④）。**append-only**：Store 补 id + createdAt、
   * **钉 submittedVia=`console`**（C5：来源 seam server 钉，请求不收）。**I0**：主键=机构+版本+归档物，永无 memberId。
   */
  appendArtifact(draft: ArtifactDraft): Promise<ArtifactRef>;

  /**
   * 给既有归档物挂上「已上传文件」指针（POST /api/artifacts/:id/upload，HUB-ARTIFACT-STORE-MECH 本地卷版）。
   * **就地 idx 改**（非 append，不新增行、不动 versionNo）——只把 storedFile 换成新文件指针，故重传=覆盖语义。
   * id 不存在回 `null`（路由 → 404）。**I0**：storedFile 无人员维度；字节由路由层先落本地卷，本方法只写索引/校验和。
   */
  setArtifactFile(
    id: string,
    file: NonNullable<ArtifactRef['storedFile']>,
  ): Promise<ArtifactRef | null>;

  // --- 差异化在场排班读写（D-029；SCHED-WIRE-EXISTING 接出死代码 derivePresenceSchedule）---
  /**
   * 共享物理资源（实车 / 测试台）只读。**为何独立读口**：SharedResource / ResourceSession 不在
   * GovernanceSnapshot 内（GovernanceSnapshot 是 11 字段、无这两块）、且**不扩**它（扩会牵动 file-gov-store
   * 的 GovernanceSnapshotSchema + GOVERNANCE_ARRAY_FIELDS + clone 列表 + 已落盘 JSON 格式兼容）——故走独立读口，
   * 路由层把 `{...snapshot, resources, resourceSessions}` 拼成 ScheduleSnapshot 喂纯函数。
   */
  listResources(): Promise<SharedResource[]>;
  /**
   * 建一台共享资源（POST /api/resources，R3 车管理 / D-072 §3.2）。Store 补 id + updatedAt、
   * **钉 status=`available` / statusReason=null / statusSource=`console`**（C5 来源 seam）。
   * displayCode 由 **Store 内部**经 deriveDisplayCode 派生（**禁手写**，调用方绝不传，D-072 §3.2 决定 K）。
   * **持久化（R3 核心）**：FileGovStore 落盘到独立 resources.json（不入 GovernanceSnapshot）；
   * InMemoryGovStore 仅改内存数组。**I0**：SharedResource 无成员维度，绝不引入 memberId / 出勤。
   */
  createResource(resource: ResourceDraft): Promise<SharedResource>;
  /**
   * 既有车状态迁移（PATCH /api/resources/:id/status，R3 改状态 / D-072 §3.3）。在 ResourceStatus 枚举内
   * 流转（维修 / 退役 / 拆解 / 回 available）。**退役 = 改 status→retired、非物删**（整车留展示，
   * ResourceSession 仍引用 resourceId；故无 delete 口子）。statusReason optional+nullable（省略=不动、
   * 显式 null=清空、非空串=改写）；Store 钉 statusSource=`console`（C5）、bump updatedAt。
   * id 不存在 → 返回 null（路由层转 404）。FileGovStore 改 inner 后原子写 resources.json。
   */
  updateResourceStatus(
    id: string,
    patch: ResourceStatusPatch,
  ): Promise<SharedResource | null>;
  /** 占用窗口（GET /api/resource-sessions 读视图）。invitedMemberIds 是本窗操作名单（I0 许可），绝不按人聚合。 */
  listResourceSessions(): Promise<ResourceSession[]>;
  /**
   * 占用窗口录入（POST /api/resource-sessions，append-only）。Store 补 id + createdAt、**钉 source=`human`**
   * （C5：来源 seam server 钉，请求不收）。confirmedBy 随 draft 传入（录入即确认拍板）。**I0**：窗口本身
   * 不进派生输出维度；GET /api/schedule 只回 derivePresenceSchedule 的组键建议，绝不回原始 session。
   */
  createResourceSession(draft: ResourceSessionDraft): Promise<ResourceSession>;
  /**
   * 占用窗口受限编辑（PATCH /api/resource-sessions/:id，R1 接力画布）。只改 orderInWindow / eta
   * （C3 受限编辑、非通用字段 update）。id 不存在 → null（路由层转 404）。与 session 同走内存、不落盘。
   */
  updateResourceSession(
    id: string,
    patch: ResourceSessionPatch,
  ): Promise<ResourceSession | null>;
  /**
   * 删一棒（DELETE /api/resource-sessions/:id，A2 接力画布「删除一棒」）。删该 session 本体，并**级联删除
   * 引用它的接力交接线**（relayHandoffs 中 fromSessionId===id 或 toSessionId===id 的边——避免删卡后悬空箭头）。
   * 命中（删了 session）返回 true、不存在 false（路由转 404）。与 session/handoff 同走内存、不落盘（D-029，
   * 重启回 seed）。**注意**与 deleteResource 不同：ResourceSession 是粗粒度临时占用窗口、可物删；SharedResource
   * 因被 session 引用故只退役不物删（见 updateResourceStatus 注释）。
   */
  deleteResourceSession(id: string): Promise<boolean>;
  /** 接力交接线只读（GET /api/relay 组 ScheduleSnapshot 用）。先后交接、**非**任务依赖；无 memberId。 */
  listRelayHandoffs(): Promise<RelayHandoff[]>;
  /**
   * 接力交接线录入（POST /api/relay-handoffs，R1 画布拉线）。Store 补 id + createdAt、**钉 source=`console`**
   * （C5：来源 seam server 钉，请求不收）。confirmedBy 随 draft 传入（拉线即确认拍板）。自环/成环校验在路由层。
   * 与 session 同走内存、不落盘（D-029，重启回 seed=空）。
   */
  createRelayHandoff(draft: RelayHandoffDraft): Promise<RelayHandoff>;
  /** 删一条接力交接线（DELETE /api/relay-handoffs/:id）。命中删除返回 true，不存在 false（路由转 404）。 */
  deleteRelayHandoff(id: string): Promise<boolean>;

  // --- 受限状态机迁移（非 CRUD：只在既有枚举内推进生命周期态）---
  /**
   * 任务状态流转（POST /api/tasks/:id/status）。在既有 TaskStatus 枚举内迁移（含 done=标真实完成）。
   * **statusSource 由 Store 钉 `console`**（C5：人工流转是最低优先源，git/lark/derived 派生信号可覆盖）。
   * bump updatedAt；lastProgressAt 不动（仅派生信号回填）。id 不存在 → 返回 null（路由层转 404）。
   */
  updateTaskStatus(taskId: string, status: TaskStatus): Promise<Task | null>;
  /**
   * 软删除依赖边（POST /api/dependencies/:id/waive）。转 status=`waived`（人工判定作废），bump updatedAt，
   * **保留** confirmedBy/createdAt（G2 单一真相可审计）。waived 边经 toDepGraphView 从图隐藏，但仍留库
   * （区别于物理 delete）。id 不存在 → 返回 null（路由层转 404）。
   */
  waiveDependency(depId: string): Promise<Dependency | null>;
}

/**
 * 战队知识库读出入口契约（KB-CORE；承接 base 收口刀 4-opus 对抗核实结论）。
 *
 * **为何独立于 GovStore**：相似 bug 检索（`GET /api/kb/similar` 走 `rankSimilarIssues`）的排序语料是
 * IssueCard / ErrorEntry / ArchiveDocument，**不在 `GovernanceSnapshot` 内**——base 收口刀把 kbStore
 * 暂记为 `GovStore`，对抗核实标注该处过早收窄、应在 KB-CORE 落地时收窄为独立 `KbStore`（仅触本字段、
 * 不动 GovStore / 路由签名，PM 不受影响）。本刀兑现：kbStore 类型 GovStore → KbStore。
 *
 * 注意：结案派生 `KnowledgeNode` + `knowledgeNodes/taskKnowledgeTags` 读路径**仍复用同一
 * `GovernanceSnapshot`**（经 `GovStore.closeoutKbNode`）——那半对抗核实确认成立、不在本接口；本接口只管
 * 相似检索所需的 IssueCard 语料快照（`KbSnapshot`）。
 *
 * 写（`appendCloseout`，AI+知识库闭环 MVP）：结案的三件派生物（archived 卡 / 错误表 / 归档）**回灌进检索语料**——
 * 否则 closeout 上传后下次 `GET /api/kb/similar` 查不到（闭环断）。仍**无人维度**（C2）：写入主键是 issue/errorCode，
 * 不引入「谁结的案」（I0：generatedBy=ai/manual/hybrid 非人名）。
 *
 * 护栏（AGENTS §5）：语料无人维度（C2）；相似检索只列候选不断言同因（A4，见 rankSimilarIssues）。
 */
export interface KbStore {
  getKbSnapshot(): Promise<KbSnapshot>;
  /**
   * 结案回灌：把一次 `POST /api/kb/closeout` 派生的三件物追加进相似检索语料。
   * issueCard 按 id upsert（结案后是 `archived` 版，替换原卡）；errorEntry / archiveDocument 追加。
   */
  appendCloseout(input: KbCloseoutAppend): Promise<void>;
}

/**
 * `KbStore.appendCloseout` 入参：一次结案派生的三件物（来自 `buildCloseoutFromIssue` 结果）。
 * issueCard = `updatedIssueCard`（status=archived）。
 */
export interface KbCloseoutAppend {
  issueCard: IssueCard;
  errorEntry: ErrorEntry;
  archiveDocument: ArchiveDocument;
}

/**
 * upsertPartType 入参（盘点建底 / 补料 / 调阈值）：人本字段；Store 补 lastCountedAt / updatedAt。
 * 带 `id` 命中既有 → 更新；否则创建（Store 钉 `parttype-new-N`）。
 */
export type PartTypeDraft = Omit<PartType, 'id' | 'lastCountedAt' | 'updatedAt'> & {
  id?: string;
};

/**
 * recordPartAction 入参（一句话快记 / 拆装 / 预留）：人本字段 + `source`（来源 seam，路由钉 human，
 * 客户端不冒充 hermes/derived，C5）。Store 补 id / recordedAt + 把 source 包成 `recordedBy={source,at}`
 * （**I0：绝无 memberId**）。
 */
export type PartActionDraft = Omit<
  PartAction,
  'id' | 'recordedAt' | 'recordedBy'
> & { source: PartActionSource };

/**
 * 库存 / BOM 读写出入口契约（INV-BOM-CORE，D-042 决策 4 / D-072 §3.4）。
 *
 * INV 是三支柱里**唯一需要扩 schema 的根**——`InventorySnapshot` 不在 `GovernanceSnapshot` 内，故 INV 不复用
 * `GovStore`、走本独立扩展点（BuildHubServerOptions.invStore?，缺省 InMemoryInvStore seed inventoryScenarioFixture）。
 *
 * 写白名单仅 `upsertPartType / recordPartAction`（C3：无通用 delete / list 全家桶）。**红线**：
 *  - **I0**：recordPartAction 的 recordedBy 永无 memberId（只 source）；无按人聚合视图。
 *  - **G2**：INV 自有真相、不回写飞书 Bitable。
 *  - **C3 / D-072 §3.4**：个体件拆装只移 currentHolder、绝不删 TrackedPart（保血缘）。
 *  - 非法迁移（负库存 / used 超 total / 缺持有者）→ recordPartAction 抛 InvalidPartActionError（路由转 400）。
 */
export interface InvStore {
  getInventorySnapshot(): Promise<InventorySnapshot>;
  /** 盘点建底 / 补料 / 调阈值（POST /api/inventory/part-types）。带 id 命中即更新，否则创建。 */
  upsertPartType(draft: PartTypeDraft): Promise<PartType>;
  /**
   * 记一条动作并应用其效果（POST /api/inventory/actions）。append-only 落 PartAction +
   * 按动作语义改 PartType.allocations/totalQuantity（+ 个体件 currentHolder/status）。
   * 非法迁移抛 `InvalidPartActionError`。
   */
  recordPartAction(draft: PartActionDraft): Promise<PartAction>;
  /** 缺料告警列表（闲置 < lowStockThreshold 的 PartType；deriveShortfalls 派生）。 */
  listShortfalls(): Promise<PartType[]>;
}
