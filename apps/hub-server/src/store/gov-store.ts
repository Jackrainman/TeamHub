import type {
  ArchiveDocument,
  ArtifactRef,
  Dependency,
  ErrorEntry,
  GovernanceSnapshot,
  IssueCard,
  KbSnapshot,
  KnowledgeNode,
  Need,
  ResourceSession,
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

  // --- 差异化在场排班读写（D-029；SCHED-WIRE-EXISTING 接出死代码 derivePresenceSchedule）---
  /**
   * 共享物理资源（实车 / 测试台）只读。**为何独立读口**：SharedResource / ResourceSession 不在
   * GovernanceSnapshot 内（GovernanceSnapshot 是 11 字段、无这两块）、且**不扩**它（扩会牵动 file-gov-store
   * 的 GovernanceSnapshotSchema + GOVERNANCE_ARRAY_FIELDS + clone 列表 + 已落盘 JSON 格式兼容）——故走独立读口，
   * 路由层把 `{...snapshot, resources, resourceSessions}` 拼成 ScheduleSnapshot 喂纯函数。
   */
  listResources(): Promise<SharedResource[]>;
  /** 占用窗口（GET /api/resource-sessions 读视图）。invitedMemberIds 是本窗操作名单（I0 许可），绝不按人聚合。 */
  listResourceSessions(): Promise<ResourceSession[]>;
  /**
   * 占用窗口录入（POST /api/resource-sessions，append-only）。Store 补 id + createdAt、**钉 source=`human`**
   * （C5：来源 seam server 钉，请求不收）。confirmedBy 随 draft 传入（录入即确认拍板）。**I0**：窗口本身
   * 不进派生输出维度；GET /api/schedule 只回 derivePresenceSchedule 的组键建议，绝不回原始 session。
   */
  createResourceSession(draft: ResourceSessionDraft): Promise<ResourceSession>;

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
 * 库存 / BOM 读写出入口契约（reserved，D-042 决策 4）。
 *
 * INV 是三支柱里**唯一需要扩 schema 的根**——`PartStock` 不在 `GovernanceSnapshot` 内，故 INV 不复用
 * `GovStore`、走本独立扩展点（BuildHubServerOptions.invStore?）。base 收口刀只占位、**不建 PartStock**：
 * 盘点 / 对话记账（Hermes「坏了一个 3508」记一笔）/ 缺口主动汇报的读写白名单随 INV 支柱落地补全（实现后置）。
 */
export interface InvStore {
  /** reserved：随 INV 落地补 PartStock 读写（如 getPartStock / recordPartChange / reportShortfall）。 */
  readonly __invStoreReserved?: never;
}
