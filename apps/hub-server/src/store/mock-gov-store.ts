import {
  GOVERNANCE_SCENARIO_NOW,
  governanceScenarioFixture,
  scheduleScenarioFixture,
} from '@teamhub/hub-contracts';
import type {
  ArtifactRef,
  Dependency,
  GovernanceSnapshot,
  KnowledgeNode,
  Need,
  ResourceSession,
  SharedResource,
  Task,
  TaskStatus,
} from '@teamhub/hub-contracts';
import { FixedClock } from '../clock.js';
import type { Clock } from '../clock.js';
import { cloneArrayFields } from './clone-snapshot.js';
import type {
  ArtifactDraft,
  DependencyDraft,
  GovStore,
  KnowledgeNodeDraft,
  NeedDraft,
  ResourceSessionDraft,
  TaskDraft,
} from './gov-store.js';

/**
 * 治理快照全 8 数组字段（写方法可能 push/splice 的集合）——构造期克隆隔离 + getSnapshot 浅拷贝共用。
 * 与 FileGovStore 的同名常量逐字对应（见 attribution.ts GovernanceSnapshot SYNC 注释：增删字段须同步两处）。
 */
const GOVERNANCE_ARRAY_FIELDS: (keyof GovernanceSnapshot)[] = [
  'groups',
  'members',
  'tasks',
  'dependencies',
  'needs',
  'knowledgeNodes',
  'taskKnowledgeTags',
  'artifacts',
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
  // sess-tonight-prog[windowLabel='今晚']）——默认 governanceScenarioFixture 不含这两块，会让 GET /api/schedule
  // 第一请求即空、被误判「功能没接通」。引 schedule fixture 取这两块、克隆隔离（写方法 push 不污染共享 fixture）。
  private readonly resources: SharedResource[];
  private readonly resourceSessions: ResourceSession[];
  // L1：单调自增计数器（构造期初始化为对应 seed 数组 length）。createX 用 `++this.xSeq` 生成 id，
  // 替代 `数组.length + 1`——后者在未来加 delete 后会复用已删 id、静默撞 FK；单调计数器永不回退、杜绝此脆弱性。
  // 当前无 delete 故纯防御性；纯内部 id 派生，响应 / 落盘格式不变。
  private taskSeq: number;
  private dependencySeq: number;
  private needSeq: number;
  private knowledgeNodeSeq: number;
  private artifactSeq: number;
  private resourceSessionSeq: number;

  constructor(
    seed: GovernanceSnapshot = governanceScenarioFixture,
    clock: Clock = new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW)),
  ) {
    // 浅克隆 + 克隆全部 8 个数组（M13）：写方法追加时不污染共享 fixture。复用 cloneArrayFields（与
    // FileGovStore.cloneSnapshot 同一份实现，零漂移）——groups/members/taskKnowledgeTags 当前无写方法触及，
    // 但一并克隆保证隔离一致性（防未来写入串台污染共享 fixture，进而影响后续实例与依赖 fixture 的测试）；
    // artifacts 同理（图纸版本日志当前只读）。
    this.snapshot = cloneArrayFields(seed, GOVERNANCE_ARRAY_FIELDS);
    this.clock = clock;
    // 资源 / 占用窗口锚点数据：始终从 scheduleScenarioFixture seed（与 seed 治理快照解耦——治理 seed 可被注入
    // 替换，但 resources/resourceSessions 锚点不在 GovernanceSnapshot 里、无从随 seed 传，故钉这块演示数据）。
    // 元素浅拷贝即可（invitedMemberIds 数组当前无原地 mutate；createResourceSession 只 push 整条新对象）。
    this.resources = scheduleScenarioFixture.resources.map((r) => ({ ...r }));
    this.resourceSessions = scheduleScenarioFixture.resourceSessions.map((s) => ({
      ...s,
    }));
    // L1：计数器从 seed 数组 length 起步——首条 create 得 `…-new-${length+1}`，与原 length+1 派生
    // 在零删除时逐字等价（无 id 格式回归），但此后只增不减。
    this.taskSeq = this.snapshot.tasks.length;
    this.dependencySeq = this.snapshot.dependencies.length;
    this.needSeq = this.snapshot.needs.length;
    this.knowledgeNodeSeq = this.snapshot.knowledgeNodes.length;
    this.artifactSeq = this.snapshot.artifacts.length;
    this.resourceSessionSeq = this.resourceSessions.length;
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
   * @internal 持久层回滚专用：返回**可变的** live resourceSessions 数组引用（createResourceSession push 的同一对象），
   * 让 FileGovStore 在 persist() 失败时撤回刚追加的窗口（与 snapshotForRollback 同纪律，不对外公开）。
   * 排班资源 / 窗口不在 GovernanceSnapshot 内，故单独开此回滚句柄。
   */
  resourceSessionsForRollback(): ResourceSession[] {
    return this.resourceSessions;
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
      id: `task-new-${++this.taskSeq}`,
      status: draft.status ?? 'pending',
      statusSource: draft.statusSource ?? 'console',
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
      id: `dep-new-${++this.dependencySeq}`,
      status: 'active',
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
      id: `need-new-${++this.needSeq}`,
      status: 'open',
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
      id: `kn-cl-${++this.knowledgeNodeSeq}`,
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
      id: `artifact-new-${++this.artifactSeq}`,
      submittedVia: 'console',
      createdAt: now,
    };
    this.snapshot.artifacts.push(artifact);
    return artifact;
  }

  /** 共享物理资源只读（GET /api/schedule 组装 ScheduleSnapshot 用；GET /api/resources 可选读视图）。 */
  async listResources(): Promise<SharedResource[]> {
    return this.resources;
  }

  /** 占用窗口只读（GET /api/resource-sessions + GET /api/schedule 组装用）。 */
  async listResourceSessions(): Promise<ResourceSession[]> {
    return this.resourceSessions;
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
      id: `sess-new-${++this.resourceSessionSeq}`,
      source: 'human',
      createdAt: now,
    };
    this.resourceSessions.push(session);
    return session;
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
      statusSource: 'console',
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
      status: 'waived',
      updatedAt: now,
    };
    this.snapshot.dependencies[idx] = updated;
    return updated;
  }
}
