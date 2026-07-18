import {
  GOVERNANCE_SCENARIO_NOW,
  GOVERNANCE_SNAPSHOT_ARRAY_KEYS,
  deriveDisplayCode,
  governanceScenarioFixture,
  scheduleScenarioFixture,
} from '@teamhub/hub-contracts';
import type {
  ActorRef,
  ArtifactRef,
  Dependency,
  GovernanceSnapshot,
  Group,
  KnowledgeNode,
  Member,
  MemberRole,
  Need,
  RelayHandoff,
  ResourceSession,
  RosterImportRow,
  Season,
  SharedResource,
  Task,
  TaskStatus,
} from '@teamhub/hub-contracts';
import { FixedClock } from '../clock.js';
import type { Clock } from '../clock.js';
import {
  ARTIFACT_SUBMITTED_VIA,
  DEPENDENCY_INITIAL_STATUS,
  DEPENDENCY_WAIVED_STATUS,
  MANUAL_TASK_STATUS_SOURCE,
  MEMBER_GATE_REVIEWER_UPDATED_BY,
  MEMBER_PIN_UPDATED_BY,
  MEMBER_ROLE_UPDATED_BY,
  MEMBER_ROSTER_UPDATED_BY,
  NEED_INITIAL_STATUS,
  RELAY_HANDOFF_SOURCE,
  RESOURCE_DEFAULT_STATUS,
  RESOURCE_SESSION_SOURCE,
  RESOURCE_STATUS_SOURCE,
  ROSTER_IMPORT_GROUP_KIND,
  ROSTER_IMPORT_MEMBER_STATUS,
  TASK_DEFAULT_STATUS,
  TASK_DEFAULT_STATUS_SOURCE,
} from './clamp-defaults.js';
import { cloneArrayFields } from './clone-snapshot.js';
import type {
  ArtifactDraft,
  DependencyDraft,
  GovStore,
  KnowledgeNodeDraft,
  NeedDraft,
  RelayHandoffDraft,
  ResourceDefaultPresetPatch,
  ResourceDraft,
  ResourceSessionDraft,
  ResourceSessionPatch,
  ResourceStatusPatch,
  RosterImportOutcome,
  SeasonDraft,
  TaskDraft,
} from './gov-store.js';
import { createIdSequence, nextSequentialId } from './id-sequence.js';
import type { IdSequence } from './id-sequence.js';

/**
 * 治理快照全数组字段键（写方法可能 push/splice 的集合）——构造期克隆隔离 + getSnapshot 浅拷贝共用。
 * 键表已**单源于 contracts**（GOVERNANCE_SNAPSHOT_ARRAY_KEYS，见 attribution.ts SYNC 注释：增删数组字段须同步那处）；
 * 本地以可变副本承接（cloneArrayFields 形参要 mutable keyof[]，而单源常量是 ReadonlyArray）。
 */
const GOVERNANCE_ARRAY_FIELDS: (keyof GovernanceSnapshot)[] = [
  ...GOVERNANCE_SNAPSHOT_ARRAY_KEYS,
];

/**
 * 内存实现：默认 seed 真实锚点场景 fixtures，让 real 路由从第一个请求起就有可派生的真实场景
 * （进程重启丢失为预期行为，SQLite/Postgres 持久层见 SqliteGovStore）。
 *
 * 写白名单全部已落地：createTask/createDependency/createNeed（PM 录入簇）+ closeoutKbNode（KB-CORE）。
 * 每个写方法 Store 负责补 id/时间戳/派生默认 + clamp 初始态（C1 兜底录入、不取代 git/lark 派生信号）。
 */
export class InMemoryGovStore implements GovStore {
  private readonly snapshot: GovernanceSnapshot;
  private readonly clock: Clock;
  // 差异化在场排班（D-029）的两块数据**不在 GovernanceSnapshot 内**（见 gov-store.ts listResources 注释），
  // 故存独立可变数组。**seed 来源 = scheduleScenarioFixture**（=governanceScenarioFixture + res-r1/res-r2 +
  // sess-tonight-ec[今晚] + sess-convergence-day-r1/r2[总联调日]）——默认 governanceScenarioFixture 不含这两块，会让 GET /api/schedule
  // 第一请求即空、被误判「功能没接通」。引 schedule fixture 取这两块、克隆隔离（写方法 push 不污染共享 fixture）。
  private readonly resources: SharedResource[];
  private readonly resourceSessions: ResourceSession[];
  // 接力交接线（R1）：与 resourceSessions 同走内存、不落盘（D-029）。seed=空（队长在画布拉线产生）。
  private readonly relayHandoffs: RelayHandoff[];
  // L1：单调自增计数器（构造期初始化为对应 seed 数组 length），实现抽到 id-sequence.ts（STORE-SPLIT-SQLITE，
  // 纯函数模块，mock/file/sqlite 三实现共享同一份策略）。createX 用 `nextSequentialId(prefix, seq)` 生成 id，
  // 替代 `数组.length + 1`——后者在未来加 delete 后会复用已删 id、静默撞 FK；单调计数器永不回退、杜绝此脆弱性。
  // 当前无 delete 故纯防御性；纯内部 id 派生，响应 / 落盘格式不变。
  private readonly taskSeq: IdSequence;
  private readonly dependencySeq: IdSequence;
  private readonly needSeq: IdSequence;
  private readonly knowledgeNodeSeq: IdSequence;
  private readonly artifactSeq: IdSequence;
  private readonly seasonSeq: IdSequence;
  // 名册导入（ROSTER-IMPORT，K8）：members/groups 是 GovernanceSnapshot 字段、随 seed 传入构造，
  // 故计数器从 seed 长度起步即已含已加载数据（无 delete、单调增），无需 FileGovStore 载入后 resync
  // （resources/sessions 才需 resync——它们不在 GovernanceSnapshot、构造后才 splice 进 live）。
  private readonly memberSeq: IdSequence;
  private readonly groupSeq: IdSequence;
  // 非 readonly：resyncResourceSeq() / resyncScheduleSeqs() 载入磁盘文件后需换成新起点的序列（见该方法）。
  private resourceSeq: IdSequence;
  private resourceSessionSeq: IdSequence;
  private relayHandoffSeq: IdSequence;

  constructor(
    seed: GovernanceSnapshot = governanceScenarioFixture,
    clock: Clock = new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW)),
    // K6（时钟与空板刀）：演示态 = 演示锚点、真实态 = 真空板。demoSeed=true（默认）从 scheduleScenarioFixture
    // seed 资源/占用窗口/接力交接线；demoSeed=false（main.ts 在 config.dataMode='real' 时透传）→ 空数组。
    demoSeed = true,
  ) {
    // 浅克隆 + 克隆全部 8 个数组（M13）：写方法追加时不污染共享 fixture。复用 cloneArrayFields（与
    // FileGovStore.cloneSnapshot 同一份实现，零漂移）——groups/members/taskKnowledgeTags 当前无写方法触及，
    // 但一并克隆保证隔离一致性（防未来写入串台污染共享 fixture，进而影响后续实例与依赖 fixture 的测试）；
    // artifacts 同理（图纸版本日志当前只读）。
    this.snapshot = cloneArrayFields(seed, GOVERNANCE_ARRAY_FIELDS);
    this.clock = clock;
    // 资源 / 占用窗口锚点数据：**受 demoSeed 管**（K6 时钟与空板刀）。与 seed 治理快照解耦——这两块锚点
    // 不在 GovernanceSnapshot 里、无从随 seed 传，故此前恒钉演示数据；空板走查坐实：真实态（demoSeed=false）
    // 若仍 seed 演示车，空板会见两台虚构车 + 演示排班（浏览器真钟 − 服务端假钟 → stalenessDays 秒破 14 天）。
    // 故演示态（默认）seed scheduleScenarioFixture 锚点、真实态给空数组（真空板）。元素浅拷贝即可
    // （invitedMemberIds 数组当前无原地 mutate；createResourceSession 只 push 整条新对象）。
    this.resources = demoSeed
      ? scheduleScenarioFixture.resources.map((r) => ({ ...r }))
      : [];
    this.resourceSessions = demoSeed
      ? scheduleScenarioFixture.resourceSessions.map((s) => ({ ...s }))
      : [];
    // 接力交接线 seed（R1）：fixture 默认空，重启回此空态（D-029 内存态）；demoSeed=false 同样空。元素浅拷贝隔离。
    this.relayHandoffs = demoSeed
      ? scheduleScenarioFixture.relayHandoffs.map((h) => ({ ...h }))
      : [];
    // L1：计数器从 seed 数组 length 起步——首条 create 得 `…-new-${length+1}`，与原 length+1 派生
    // 在零删除时逐字等价（无 id 格式回归），但此后只增不减。
    this.taskSeq = createIdSequence(this.snapshot.tasks.length);
    this.dependencySeq = createIdSequence(this.snapshot.dependencies.length);
    this.needSeq = createIdSequence(this.snapshot.needs.length);
    this.knowledgeNodeSeq = createIdSequence(this.snapshot.knowledgeNodes.length);
    this.artifactSeq = createIdSequence(this.snapshot.artifacts.length);
    this.seasonSeq = createIdSequence(this.snapshot.seasons.length);
    this.memberSeq = createIdSequence(this.snapshot.members.length);
    this.groupSeq = createIdSequence(this.snapshot.groups.length);
    this.resourceSeq = createIdSequence(this.resources.length);
    this.resourceSessionSeq = createIdSequence(this.resourceSessions.length);
    this.relayHandoffSeq = createIdSequence(this.relayHandoffs.length);
  }

  async getSnapshot(): Promise<GovernanceSnapshot> {
    // M7：返回浅拷贝（顶层对象 + 全 8 数组字段克隆，与构造期同一份克隆纪律），
    // 防外部读到 live 引用后 push/splice 绕过写白名单 mutate live store。
    // 标量字段沿用浅拷贝引用、数组逐字克隆——JSON 序列化与 live 快照逐字相同，
    // 故 FileGovStore.writeOnce() 落盘内容不变（无落盘回归）。
    // **不影响回滚链**：snapshotForRollback() 仍返回 live 引用，回滚走那条句柄。
    return cloneArrayFields(this.snapshot, GOVERNANCE_ARRAY_FIELDS);
  }

  /**
   * @internal 持久层回滚专用：返回**可变的** live 快照引用（即写方法 push/改 idx 的同一对象），
   * 让 FileGovStore 在 persist() 失败时把刚追加的内存元素撤回（避免「内存已变更 + 客户端 500 重试」产生重复）。
   * **不对外公开**：仅 FileGovStore 在自身写方法内、捕获写前状态 + persist 失败时调用；正常读路径走 getSnapshot()。
   */
  snapshotForRollback(): GovernanceSnapshot {
    return this.snapshot;
  }

  /**
   * @internal 持久层回滚专用（R3）：返回**可变的** live resources 数组引用（createResource push /
   * updateResourceStatus 原地改的同一对象），让 FileGovStore 在 resources.json 写失败时撤回刚追加 /
   * 刚改的整车（与 snapshotForRollback 同纪律，不对外公开）。resources 不在 GovernanceSnapshot 内，故单独开此句柄。
   */
  resourcesForRollback(): SharedResource[] {
    return this.resources;
  }

  /**
   * @internal R3 持久化载入后重算 resourceSeq：取现有 resources 里 `res-new-N` 后缀的最大值。
   * FileGovStore 在构造后才把磁盘上的车 splice 进 live，若不重算、计数器仍停在构造期 seed 长度，
   * 重启后再建车会复用同一 `res-new-N` → id 碰撞（覆盖既有车 / React key 冲突）。loadOrSeedResources 载入分支调用。
   */
  resyncResourceSeq(): void {
    let max = 0;
    for (const r of this.resources) {
      const m = /^res-new-(\d+)$/.exec(r.id);
      if (m) {
        const n = Number(m[1]);
        if (n > max) max = n;
      }
    }
    // createIdSequence 是纯工厂函数（见 id-sequence.ts）：换新起点即换一个新的序列对象，
    // 而非在旧对象上 mutate 内部计数器（IdSequence 本身不开 reset 口子，只增不减的纪律保持不变）。
    this.resourceSeq = createIdSequence(max);
  }

  /**
   * @internal 持久层回滚专用（SCHEDULE-PERSIST，product-redefine-2026-07 §4.4/§9-③）：返回**可变的**
   * live resourceSessions 数组引用（createResourceSession/Batch push、updateResourceSession 原地改 idx、
   * deleteResourceSession splice 的同一对象），让 FileGovStore 在 schedule-sessions.json 写失败时撤回
   * 刚做的内存改动（与 resourcesForRollback 同纪律，不对外公开）。
   */
  sessionsForRollback(): ResourceSession[] {
    return this.resourceSessions;
  }

  /**
   * @internal 持久层回滚专用（SCHEDULE-PERSIST）：返回**可变的** live relayHandoffs 数组引用
   * （createRelayHandoff push、deleteRelayHandoff/deleteResourceSession 级联 splice 的同一对象）。
   */
  handoffsForRollback(): RelayHandoff[] {
    return this.relayHandoffs;
  }

  /**
   * @internal SCHEDULE-PERSIST 持久化载入后重算 resourceSessionSeq/relayHandoffSeq：取现有数组里
   * `sess-new-N` / `handoff-new-N` 后缀的最大值（逐字镜像 resyncResourceSeq）。FileGovStore 在构造后
   * 才把磁盘上的 sessions/handoffs splice 进 live，若不重算、计数器仍停在构造期 seed 长度，重启后再
   * 录入会复用同一 id（覆盖既有窗口/交接线、React key 冲突）。loadOrSeedScheduleSessions 载入分支调用。
   */
  resyncScheduleSeqs(): void {
    let maxSession = 0;
    for (const s of this.resourceSessions) {
      const m = /^sess-new-(\d+)$/.exec(s.id);
      if (m) {
        const n = Number(m[1]);
        if (n > maxSession) maxSession = n;
      }
    }
    this.resourceSessionSeq = createIdSequence(maxSession);

    let maxHandoff = 0;
    for (const h of this.relayHandoffs) {
      const m = /^handoff-new-(\d+)$/.exec(h.id);
      if (m) {
        const n = Number(m[1]);
        if (n > maxHandoff) maxHandoff = n;
      }
    }
    this.relayHandoffSeq = createIdSequence(maxHandoff);
  }

  /**
   * PM 项目计划表单条任务录入（C1 兜底录入口，POST /api/tasks）。Store 补 id + 时间戳 + 派生默认：
   * `status` 默认 `pending`、`statusSource` 默认 `console`（C5：真实进度优先 git/lark 派生，console 录入兜底）、
   * `lastProgressAt` 初始 null（由 commit/check-in 派生信号回填）。**C2/I0**：Task.ownerId 只表「谁负责」分工
   * （D-041 ② 安全堆），无完成量横比维度；不引入 dueDate（D-042 / G4 无硬截止）。
   */
  async createTask(draft: TaskDraft): Promise<Task> {
    const now = this.clock.now().toISOString();
    const task: Task = {
      ...draft,
      id: nextSequentialId('task-new', this.taskSeq),
      status: draft.status ?? TASK_DEFAULT_STATUS,
      statusSource: draft.statusSource ?? TASK_DEFAULT_STATUS_SOURCE,
      lastProgressAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.snapshot.tasks.push(task);
    return task;
  }

  /**
   * PM 依赖边录入（POST /api/dependencies）。**D-042 clamp 初始态**：status 钉 `active`（人建边=断言上游卡下游，
   * satisfied/waived 由派生/人工 waive 转）。**confirmedBy（用户 Q1=ActorRef 内部凭证）**：人建边的 confirmedBy
   * 仅内部归因用，永不经读视图暴露/排名（toDepGraphView 不输出 confirmedBy）。**G2**：blockedBy 不在 Task 上另存，
   * 卡住原因纯由本边经 toDepGraphView 派生为结构键（上游任务名）。
   */
  async createDependency(draft: DependencyDraft): Promise<Dependency> {
    const now = this.clock.now().toISOString();
    const dependency: Dependency = {
      ...draft,
      id: nextSequentialId('dep-new', this.dependencySeq),
      status: DEPENDENCY_INITIAL_STATUS,
      createdAt: now,
      updatedAt: now,
    };
    this.snapshot.dependencies.push(dependency);
    return dependency;
  }

  /**
   * PM 前置需求录入（POST /api/needs，G3 一等公民）。**D-042 clamp 初始态 + A2 反派单**：status 钉 `open`、
   * openedAt=now、escalatedAt=null、**claimedByMemberId=null**（新缺口必未认领，认领是本人后续主动动作、非创建即派单）。
   * **A1**：缺口归组 providerGroupId、不归人。
   */
  async createNeed(draft: NeedDraft): Promise<Need> {
    const now = this.clock.now().toISOString();
    const need: Need = {
      ...draft,
      id: nextSequentialId('need-new', this.needSeq),
      status: NEED_INITIAL_STATUS,
      claimedByMemberId: null,
      openedAt: now,
      escalatedAt: null,
    };
    this.snapshot.needs.push(need);
    return need;
  }

  /**
   * KB-CORE 结案派生知识节点写入（POST /api/kb/closeout）。Store 补 id + createdAt（时间戳由注入 clock，
   * 派生默认）。**I0 守恒**：KnowledgeNode 无人维度——节点来源凭证是结构（resourceLinks 指向归档/文件/
   * 提交）+ 归档 generatedBy(ai/manual/hybrid)，**不存裸 memberId、不可事后 groupBy「谁结案最多」**。
   */
  async closeoutKbNode(draft: KnowledgeNodeDraft): Promise<KnowledgeNode> {
    const now = this.clock.now().toISOString();
    // 幂等：同一 issue 复结案派生的节点 name 相同（deriveKnowledgeNodeFromIssue 钉
    // `踩过的坑：${issue.title}`），draft 本身无 id。按 name dedup——命中则**原地覆盖、保留已有 id**
    // （主键稳定、刷新内容/时间戳），避免 500 重试 / 重复结案在治理快照里堆出重复 KnowledgeNode 主键。
    const idx = this.snapshot.knowledgeNodes.findIndex((n) => n.name === draft.name);
    if (idx >= 0) {
      const existing = this.snapshot.knowledgeNodes[idx];
      const updated: KnowledgeNode = { ...draft, id: existing.id, createdAt: now };
      this.snapshot.knowledgeNodes[idx] = updated;
      return updated;
    }
    const node: KnowledgeNode = {
      ...draft,
      id: nextSequentialId('kn-cl', this.knowledgeNodeSeq),
      createdAt: now,
    };
    this.snapshot.knowledgeNodes.push(node);
    return node;
  }

  /**
   * 图纸/归档物提交日志追加（POST /api/artifacts，V1-FOLLOWUPS ④）。Store 补 id + createdAt + **钉
   * submittedVia=`console`**（C5：来源 seam server 钉，请求不收）。**append-only**：只 push 进 snapshot.artifacts，
   * 无 update/delete。**I0 守恒**：ArtifactRef 无 person 字段，draft 也不含——日志主键是机构(mechanism)+
   * 版本(revision)+归档物，永无 memberId，不可事后 groupBy「谁提交最多」。
   */
  async appendArtifact(draft: ArtifactDraft): Promise<ArtifactRef> {
    const now = this.clock.now().toISOString();
    const artifact: ArtifactRef = {
      ...draft,
      id: nextSequentialId('artifact-new', this.artifactSeq),
      submittedVia: ARTIFACT_SUBMITTED_VIA,
      createdAt: now,
    };
    this.snapshot.artifacts.push(artifact);
    return artifact;
  }

  /**
   * 给既有归档物挂文件指针（POST /api/artifacts/:id/upload）。**就地 idx 改**：只换 storedFile、不动其余字段、
   * 不新增行（重传=覆盖）。id 不存在回 null（路由 → 404）。I0：storedFile 无人员维度。
   */
  async setArtifactFile(
    id: string,
    file: NonNullable<ArtifactRef['storedFile']>,
  ): Promise<ArtifactRef | null> {
    const idx = this.snapshot.artifacts.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    const updated: ArtifactRef = { ...this.snapshot.artifacts[idx], storedFile: file };
    this.snapshot.artifacts[idx] = updated;
    return updated;
  }

  /** 共享物理资源只读（GET /api/schedule 组装 ScheduleSnapshot 用；GET /api/resources 可选读视图）。 */
  async listResources(): Promise<SharedResource[]> {
    // 浅拷贝（对齐 getSnapshot 的克隆封装）：防外部读到 live 数组后 push/splice 绕过写白名单。
    return [...this.resources];
  }

  /**
   * 建一台共享资源（POST /api/resources，R3 车管理 / D-072 §3.2）。Store 补 id=`res-new-N` + updatedAt、
   * **钉 status=`available` / statusReason=null / statusSource=`console`**（C5：来源 seam server 钉，建车一律空闲可用）。
   * displayCode **禁手写**（D-072 §3.2 决定 K）——**store 内派生**（与 status/statusSource 同列由 server 钉）：
   * 给了 season 才经 deriveDisplayCode(season, robotTarget, version ?? 1) 派生，否则 undefined（读视图回退 name）。
   * 调用方（路由 / FileGovStore 委托）绝不传 displayCode（ResourceDraft 已 Omit 之）。
   * **I0**：SharedResource 无 person 字段，draft 也不含——车是中性对象，绝无 memberId / 出勤。
   */
  async createResource(draft: ResourceDraft): Promise<SharedResource> {
    const now = this.clock.now().toISOString();
    // displayCode 在 store 内派生（禁手写）：给了 season 才有 `赛季+位置(+vN)`，否则 undefined。
    const displayCode =
      draft.season !== undefined
        ? deriveDisplayCode(draft.season, draft.robotTarget, draft.version ?? 1)
        : undefined;
    const resource: SharedResource = {
      ...draft,
      id: nextSequentialId('res-new', this.resourceSeq),
      status: RESOURCE_DEFAULT_STATUS,
      statusReason: null,
      statusSource: RESOURCE_STATUS_SOURCE,
      displayCode,
      updatedAt: now,
    };
    this.resources.push(resource);
    return resource;
  }

  /**
   * 既有车状态迁移（PATCH /api/resources/:id/status，R3 改状态 / D-072 §3.3）。在 ResourceStatus 枚举内流转
   * （维修 / 退役 retired / 拆解 / 回 available）。**退役 = 改 status、非物删**（整车留展示，无 splice）。
   * statusReason：未传（undefined）保留旧值、显式 null 清空、给非空串改写。**statusSource 钉 `console`**（C5），
   * bump updatedAt。id 不存在 → null（路由转 404）。
   */
  async updateResourceStatus(
    id: string,
    patch: ResourceStatusPatch,
  ): Promise<SharedResource | null> {
    const idx = this.resources.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    const now = this.clock.now().toISOString();
    const prev = this.resources[idx];
    const updated: SharedResource = {
      ...prev,
      status: patch.status,
      // statusReason 可空：显式 null 清空、给值改写、未传（undefined）保留旧值。
      statusReason: patch.statusReason !== undefined ? patch.statusReason : prev.statusReason,
      statusSource: RESOURCE_STATUS_SOURCE,
      updatedAt: now,
    };
    this.resources[idx] = updated;
    return updated;
  }

  /**
   * 既有车默认阵型写回（PATCH /api/resources/:id/preset，D-082 §6 D2）。**整体替换**：传对象=设/改
   * `defaultPreset`（不与旧值合并 lineup）、传 `null`=清除（车退出「使用预设」铺底）。bump updatedAt；
   * `statusSource`/`status` 等其余字段不动（本方法只碰 defaultPreset 一个字段，C3 受限编辑）。
   * id 不存在 → null（路由转 404）。
   */
  async setResourceDefaultPreset(
    id: string,
    preset: ResourceDefaultPresetPatch,
  ): Promise<SharedResource | null> {
    const idx = this.resources.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    const now = this.clock.now().toISOString();
    const prev = this.resources[idx];
    // preset===null → 整条不含 defaultPreset 键（DefaultPresetSchema 是 .optional() 非 .nullable()，
    // 落盘/序列化层面等价「未设」；非 undefined 而是显式 omit，避免遗留 `defaultPreset: null` 与 schema 型不符）。
    const updated: SharedResource =
      preset === null
        ? (() => {
            const { defaultPreset: _drop, ...rest } = prev;
            return { ...rest, updatedAt: now };
          })()
        : { ...prev, defaultPreset: preset, updatedAt: now };
    this.resources[idx] = updated;
    return updated;
  }

  /** 占用窗口只读（GET /api/resource-sessions + GET /api/schedule 组装用）。 */
  async listResourceSessions(): Promise<ResourceSession[]> {
    // 浅拷贝（对齐 getSnapshot 的克隆封装）：防外部读到 live 数组后 push/splice 绕过写白名单。
    return [...this.resourceSessions];
  }

  /**
   * 占用窗口录入（POST /api/resource-sessions，D-029）。镜像 createNeed：补 id=`sess-new-N` + createdAt、
   * **钉 source=`human`**（C5：来源 seam server 钉，客户端不冒充 derived/aiSuggested）。confirmedBy 随 draft 传入
   * （录入即确认拍板，类比 Need/Dependency 内部凭证）。**I0**：本对象不进派生输出维度——GET /api/schedule 只回
   * derivePresenceSchedule 的组键建议（无 memberId），不回原始 session；invitedMemberIds 仅本窗操作名单、绝不按人累计。
   */
  async createResourceSession(
    draft: ResourceSessionDraft,
  ): Promise<ResourceSession> {
    const now = this.clock.now().toISOString();
    const session: ResourceSession = {
      ...draft,
      id: nextSequentialId('sess-new', this.resourceSessionSeq),
      source: RESOURCE_SESSION_SOURCE,
      createdAt: now,
    };
    this.resourceSessions.push(session);
    return session;
  }

  /**
   * 占用窗口批量原子创建（POST /api/resource-sessions/batch，D-082 §5 表格页【确认】）。路由层已做
   * 全量校验（resource/group/task 存在、同车同窗 orderInWindow 不冲突）；本方法只负责「全部构造完毕才
   * 一次性 push」的原子语义——纯内存操作、无 IO 间隙，构造阶段不会出现部分失败。逐条补 id=`sess-new-N` +
   * createdAt、钉 `source='human'`；**invitedMemberIds 恒强制清空 []**（I0 双保险，不信任 draft 已清空）。
   */
  async createResourceSessionsBatch(
    drafts: ResourceSessionDraft[],
  ): Promise<ResourceSession[]> {
    const now = this.clock.now().toISOString();
    const sessions: ResourceSession[] = drafts.map((draft) => ({
      ...draft,
      id: nextSequentialId('sess-new', this.resourceSessionSeq),
      source: RESOURCE_SESSION_SOURCE,
      invitedMemberIds: [],
      createdAt: now,
    }));
    this.resourceSessions.push(...sessions);
    return sessions;
  }

  /**
   * 占用窗口受限编辑（PATCH /api/resource-sessions/:id，R1 接力画布）。只改 orderInWindow / eta
   * （C3 受限编辑、非通用字段 update）：传了才改、未传保留旧值（eta 显式 null=清空预估时间）。
   * id 不存在 → null（路由转 404）。与 resourceSessions 同走内存、不落盘（D-029）。
   */
  async updateResourceSession(
    id: string,
    patch: ResourceSessionPatch,
  ): Promise<ResourceSession | null> {
    const idx = this.resourceSessions.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    const prev = this.resourceSessions[idx];
    const updated: ResourceSession = {
      ...prev,
      orderInWindow:
        patch.orderInWindow !== undefined ? patch.orderInWindow : prev.orderInWindow,
      // eta 可空：显式 null 清空、给值更新、未传（undefined）保留旧值。
      eta: patch.eta !== undefined ? patch.eta : prev.eta,
    };
    this.resourceSessions[idx] = updated;
    return updated;
  }

  /**
   * 删一棒（DELETE /api/resource-sessions/:id，A2 接力画布「删除一棒」）。删该 session，并**级联删除引用它的
   * 接力交接线**（fromSessionId===id 或 toSessionId===id 的边——删卡后箭头不悬空）。命中返回 true、不存在 false
   * （路由转 404）。与 resourceSessions/relayHandoffs 同走内存、不落盘（D-029）。
   */
  async deleteResourceSession(id: string): Promise<boolean> {
    const idx = this.resourceSessions.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    this.resourceSessions.splice(idx, 1);
    // 级联：原地清掉引用该 session 的接力交接线（保持 relayHandoffs 数组引用稳定，与 deleteRelayHandoff 同语义）。
    for (let i = this.relayHandoffs.length - 1; i >= 0; i--) {
      const h = this.relayHandoffs[i];
      if (h.fromSessionId === id || h.toSessionId === id) {
        this.relayHandoffs.splice(i, 1);
      }
    }
    return true;
  }

  /** 接力交接线只读（GET /api/relay 组 ScheduleSnapshot 用）。先后交接、**非**任务依赖；无 memberId。 */
  async listRelayHandoffs(): Promise<RelayHandoff[]> {
    // 浅拷贝（对齐 getSnapshot 的克隆封装）：防外部读到 live 数组后 push/splice 绕过写白名单。
    return [...this.relayHandoffs];
  }

  /**
   * 接力交接线录入（POST /api/relay-handoffs，R1 画布拉线）。镜像 createResourceSession：补 id=`handoff-new-N` +
   * createdAt、**钉 source=`console`**（C5：来源 seam server 钉，客户端不冒充 derived/lark/git）。confirmedBy 随
   * draft 传入（拉线即确认拍板）。自环/成环校验在路由层（参照 wouldCreateCycle）。不落盘（D-029）。
   */
  async createRelayHandoff(draft: RelayHandoffDraft): Promise<RelayHandoff> {
    const now = this.clock.now().toISOString();
    const handoff: RelayHandoff = {
      ...draft,
      id: nextSequentialId('handoff-new', this.relayHandoffSeq),
      source: RELAY_HANDOFF_SOURCE,
      createdAt: now,
    };
    this.relayHandoffs.push(handoff);
    return handoff;
  }

  /** 删一条接力交接线（DELETE /api/relay-handoffs/:id）。命中删除返回 true、不存在 false（路由转 404）。 */
  async deleteRelayHandoff(id: string): Promise<boolean> {
    const idx = this.relayHandoffs.findIndex((h) => h.id === id);
    if (idx === -1) return false;
    this.relayHandoffs.splice(idx, 1);
    return true;
  }

  /**
   * 任务状态流转（POST /api/tasks/:id/status）。受限状态机迁移、非 CRUD：在既有 TaskStatus 枚举内改状态
   * （含 inProgress→done 标真实完成）。**statusSource 钉 `console`**（C5：人工流转记最低优先源，将来 git/lark
   * 派生信号可覆盖）；lastProgressAt 不动（仅派生信号回填）。id 不存在 → null（路由转 404）。
   */
  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<Task | null> {
    const idx = this.snapshot.tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return null;
    const now = this.clock.now().toISOString();
    const updated: Task = {
      ...this.snapshot.tasks[idx],
      status,
      statusSource: MANUAL_TASK_STATUS_SOURCE,
      updatedAt: now,
    };
    this.snapshot.tasks[idx] = updated;
    return updated;
  }

  /**
   * 软删除依赖边（POST /api/dependencies/:id/waive）。转 status=`waived`（人工判定作废），bump updatedAt，
   * **保留** confirmedBy/createdAt（G2 可审计）。waived 边经 toDepGraphView 从图隐藏，但仍留库。
   * id 不存在 → null（路由转 404）。
   */
  async waiveDependency(depId: string): Promise<Dependency | null> {
    const idx = this.snapshot.dependencies.findIndex((d) => d.id === depId);
    if (idx === -1) return null;
    const now = this.clock.now().toISOString();
    const updated: Dependency = {
      ...this.snapshot.dependencies[idx],
      status: DEPENDENCY_WAIVED_STATUS,
      updatedAt: now,
    };
    this.snapshot.dependencies[idx] = updated;
    return updated;
  }

  /**
   * 设 / 改成员登录 PIN 散列（PUT /api/members/:id/pin，IDENTITY-LITE）。就地改 members[idx].pinHash
   * （scrypt 串，路由层散列后传入）+ bump updatedAt、钉 updatedBy=`console`。id 不存在 → null（路由转 404）。
   * **密钥纪律**：pinHash 只落内存 / 落盘，读视图剥离（路由回带走 MemberPublicSchema）。
   */
  async setMemberPin(memberId: string, pinHash: string): Promise<Member | null> {
    const idx = this.snapshot.members.findIndex((m) => m.id === memberId);
    if (idx === -1) return null;
    const now = this.clock.now().toISOString();
    const updated: Member = {
      ...this.snapshot.members[idx],
      pinHash,
      updatedBy: MEMBER_PIN_UPDATED_BY,
      updatedAt: now,
    };
    this.snapshot.members[idx] = updated;
    return updated;
  }

  /**
   * 设 / 撤成员门验收人资格（PATCH /api/members/:id/gate-reviewer，GATE-CHECKLIST-IOU）。就地改
   * members[idx].gateReviewer（布尔位）+ bump updatedAt、钉 updatedBy=`console`（镜像 setMemberPin）。
   * id 不存在 → null（路由转 404）。**I0**：资格布尔而已，绝不做按人聚合/排行。
   */
  async setMemberGateReviewer(
    memberId: string,
    gateReviewer: boolean,
  ): Promise<Member | null> {
    const idx = this.snapshot.members.findIndex((m) => m.id === memberId);
    if (idx === -1) return null;
    const now = this.clock.now().toISOString();
    const updated: Member = {
      ...this.snapshot.members[idx],
      gateReviewer,
      updatedBy: MEMBER_GATE_REVIEWER_UPDATED_BY,
      updatedAt: now,
    };
    this.snapshot.members[idx] = updated;
    return updated;
  }

  /**
   * 设成员角色（PUT /api/members/:id/role + POST /api/setup/super-admin，K1 权限地基）。就地改
   * members[idx].role（枚举位）+ bump updatedAt、钉 updatedBy=`console`（镜像 setMemberGateReviewer）。
   * 授权 + 降级保护在路由层判，本方法无条件写。id 不存在 → null（路由转 404）。**I0**：只改枚举位，绝不聚合。
   */
  async setMemberRole(memberId: string, role: MemberRole): Promise<Member | null> {
    const idx = this.snapshot.members.findIndex((m) => m.id === memberId);
    if (idx === -1) return null;
    const now = this.clock.now().toISOString();
    const updated: Member = {
      ...this.snapshot.members[idx],
      role,
      updatedBy: MEMBER_ROLE_UPDATED_BY,
      updatedAt: now,
    };
    this.snapshot.members[idx] = updated;
    return updated;
  }

  /**
   * 名册批量导入（POST /api/roster/import，ROSTER-IMPORT，K8）。一次遍历已校验行，对 members + groups
   * 就地应用：组按 name 匹配现有 / 本批已建、否则自动建（`grp-new-N` + kind 默认 + 当前赛季）；成员按
   * displayName 幂等 upsert（新建 `member-new-N` / 命中更新 grade·groupId·role·gateReviewer）。
   * **保护例外**：目标现为 superAdmin 时 role 不动；**pinHash 永不动**（update 走 `...prev` 保留、
   * new 不含）。库里有但表里没有 → missingFromSheet（**绝不删**）。授权在路由层判、本方法无条件写。
   * **I0**：只做名单事实变更，绝不派生任何按人聚合/排行/按人筛选。
   */
  async importRoster(rows: readonly RosterImportRow[]): Promise<RosterImportOutcome> {
    const now = this.clock.now().toISOString();
    const created: string[] = [];
    const updated: string[] = [];
    const createdGroups: string[] = [];
    const autoReviewers: string[] = [];
    // 建组用赛季：当前 active 赛季 ?? 顶层 seasonId（后者恒非空——GroupSchema.seasonId min1 满足；
    // 空板真实态 emptyGovSnapshot 仍保留 seasons/seasonId 赛季元信息，故这里恒解析到合法值）。
    const seasonId =
      this.snapshot.seasons.find((s) => s.status === 'active')?.id ?? this.snapshot.seasonId;
    // 组名 → id 解析（既有组 / 本批已建组）：同批同名组只建一次。
    const resolveGroupId = (name: string): string => {
      const existing = this.snapshot.groups.find((g) => g.name === name);
      if (existing) return existing.id;
      const group: Group = {
        id: nextSequentialId('grp-new', this.groupSeq),
        seasonId,
        parentGroupId: null,
        name,
        kind: ROSTER_IMPORT_GROUP_KIND,
      };
      this.snapshot.groups.push(group);
      createdGroups.push(name);
      return group.id;
    };
    // 导入前名册（displayName 集）——用于 missingFromSheet（库里有但表里没有、绝不删）。
    const priorNames = this.snapshot.members.map((m) => m.displayName);
    const sheetNames = new Set(rows.map((r) => r.displayName));
    for (const row of rows) {
      const groupId = resolveGroupId(row.groupName);
      const idx = this.snapshot.members.findIndex((m) => m.displayName === row.displayName);
      if (idx === -1) {
        const member: Member = {
          id: nextSequentialId('member-new', this.memberSeq),
          displayName: row.displayName,
          role: row.role,
          grade: row.grade,
          groupId,
          status: ROSTER_IMPORT_MEMBER_STATUS,
          currentTaskId: null,
          updatedBy: MEMBER_ROSTER_UPDATED_BY,
          updatedAt: now,
          gateReviewer: row.gateReviewer,
        };
        this.snapshot.members.push(member);
        created.push(row.displayName);
      } else {
        const prev = this.snapshot.members[idx];
        // 保护例外：目标现为 superAdmin 时 role 不动；pinHash 永不动（`...prev` 保留）。
        const role = prev.role === 'superAdmin' ? prev.role : row.role;
        const member: Member = {
          ...prev,
          role,
          grade: row.grade,
          groupId,
          gateReviewer: row.gateReviewer,
          updatedBy: MEMBER_ROSTER_UPDATED_BY,
          updatedAt: now,
        };
        this.snapshot.members[idx] = member;
        updated.push(row.displayName);
      }
      if (row.gateReviewerAuto) autoReviewers.push(row.displayName);
    }
    const missingFromSheet = priorNames.filter((n) => !sheetNames.has(n));
    return { created, updated, missingFromSheet, createdGroups, autoReviewers };
  }

  // ── 挂单认领制窄写（TASK-POST-CLAIM，D-088）：就地改 tasks[idx] 的自己那簇留名字段 + updatedAt。
  // 「status 变则 statusSource 钉 console」（C5，与 updateTaskStatus 同律）。清字段用解构剔除（不再回写
  // = 清空，照 setResourceDefaultPreset omit 先例）。**红线**：留名只落单卡（D-085），绝不聚合/按人筛。

  /**
   * 认领挂单（§3）。仅当现 ownerId===null 才写（已有主 → null，路由据快照转 409）；写 ownerId + claimedAt，
   * pending→inProgress 提升（有主即开工，非 pending 不动）。id 不存在 → null（路由转 404）。
   */
  async claimTask(taskId: string, ownerId: string, claimedAt: string): Promise<Task | null> {
    const idx = this.snapshot.tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return null;
    const prev = this.snapshot.tasks[idx];
    if (prev.ownerId !== null) return null; // 已有主：不覆盖（路由转 409）
    const promoting = prev.status === 'pending';
    const updated: Task = {
      ...prev,
      ownerId,
      claimedAt,
      status: promoting ? 'inProgress' : prev.status,
      statusSource: promoting ? MANUAL_TASK_STATUS_SOURCE : prev.statusSource,
      updatedAt: claimedAt,
    };
    this.snapshot.tasks[idx] = updated;
    return updated;
  }

  /**
   * 指派 / 转派（§3，同方法）。写 ownerId + assignReason + assignedBy；**清 claimedAt / partnerMemberId /
   * crossClaimConfirmedBy**（指派非认领 + 换主后旧搭档 / 旧确认失效）。id 不存在 → null（路由转 404）。
   */
  async assignTask(
    taskId: string,
    ownerId: string,
    reason: string,
    assignedBy: ActorRef,
    at: string,
  ): Promise<Task | null> {
    const idx = this.snapshot.tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return null;
    // 换主：解构剔除 claimedAt/partnerMemberId/crossClaimConfirmedBy（不再回写 = 清空）。
    const {
      claimedAt: _claimedAt,
      partnerMemberId: _partnerMemberId,
      crossClaimConfirmedBy: _crossClaimConfirmedBy,
      ...rest
    } = this.snapshot.tasks[idx];
    const updated: Task = {
      ...rest,
      ownerId,
      assignReason: reason,
      assignedBy,
      updatedAt: at,
    };
    this.snapshot.tasks[idx] = updated;
    return updated;
  }

  /** 设本组搭档位（§4）。只写 partnerMemberId + updatedAt。id 不存在 → null（路由转 404）。 */
  async setTaskPartner(taskId: string, partnerMemberId: string, at: string): Promise<Task | null> {
    const idx = this.snapshot.tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return null;
    const updated: Task = { ...this.snapshot.tasks[idx], partnerMemberId, updatedAt: at };
    this.snapshot.tasks[idx] = updated;
    return updated;
  }

  /** 跨组大任务组长事后确认（§4）。只写 crossClaimConfirmedBy + updatedAt。id 不存在 → null（路由转 404）。 */
  async confirmCrossClaim(taskId: string, confirmedBy: ActorRef, at: string): Promise<Task | null> {
    const idx = this.snapshot.tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return null;
    const updated: Task = {
      ...this.snapshot.tasks[idx],
      crossClaimConfirmedBy: confirmedBy,
      updatedAt: at,
    };
    this.snapshot.tasks[idx] = updated;
    return updated;
  }

  /**
   * 标完成（§5）。status→done + completedBy + statusSource console（C5）；**清 reviewedBy / reviewNote**
   * （新一轮完成清旧验收——重开后重新走验收）。id 不存在 → null（路由转 404）。
   */
  async completeTask(taskId: string, completedBy: ActorRef, at: string): Promise<Task | null> {
    const idx = this.snapshot.tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return null;
    const { reviewedBy: _reviewedBy, reviewNote: _reviewNote, ...rest } = this.snapshot.tasks[idx];
    const updated: Task = {
      ...rest,
      status: 'done',
      statusSource: MANUAL_TASK_STATUS_SOURCE,
      completedBy,
      updatedAt: at,
    };
    this.snapshot.tasks[idx] = updated;
    return updated;
  }

  /**
   * 验收 / 抽查（§5）。accept = 写 reviewedBy(+note)、status 保持 done；reject（打回）= status→inProgress +
   * reviewedBy + reviewNote + statusSource console（C5）。id 不存在 → null（路由转 404）。
   * **reviewNote 一律以本轮为准**：note 未给则清掉上一轮残留（复审 nit 收口——否则 reject 后直接
   * accept 会把旧打回理由留在已验收任务上）。
   */
  async reviewTask(
    taskId: string,
    reviewedBy: ActorRef,
    outcome: 'accept' | 'reject',
    note: string | undefined,
    at: string,
  ): Promise<Task | null> {
    const idx = this.snapshot.tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return null;
    const { reviewNote: _prevNote, ...prev } = this.snapshot.tasks[idx];
    const rejecting = outcome === 'reject';
    const updated: Task = {
      ...prev,
      status: rejecting ? 'inProgress' : prev.status,
      statusSource: rejecting ? MANUAL_TASK_STATUS_SOURCE : prev.statusSource,
      reviewedBy,
      ...(note !== undefined ? { reviewNote: note } : {}),
      updatedAt: at,
    };
    this.snapshot.tasks[idx] = updated;
    return updated;
  }

  /**
   * 新建赛季（POST /api/seasons，SEASON-CREATE）：新赛季钉 status=`active`，同笔把既有 active
   * 赛季原地转 `archived`（一届一个当前赛季，见 PmCoreStore.createSeason 注释）。原地替换保持
   * seasons 数组引用稳定（FileGovStore 回滚按引用整体还原）。
   */
  async createSeason(draft: SeasonDraft): Promise<Season> {
    for (let i = 0; i < this.snapshot.seasons.length; i++) {
      if (this.snapshot.seasons[i].status === 'active') {
        this.snapshot.seasons[i] = { ...this.snapshot.seasons[i], status: 'archived' };
      }
    }
    const season: Season = {
      ...draft,
      id: nextSequentialId('season-new', this.seasonSeq),
      status: 'active',
    };
    this.snapshot.seasons.push(season);
    return season;
  }
}
