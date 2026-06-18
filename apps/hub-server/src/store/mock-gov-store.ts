import {
  GOVERNANCE_SCENARIO_NOW,
  governanceScenarioFixture,
} from '@teamhub/hub-contracts';
import type {
  ArtifactRef,
  Dependency,
  GovernanceSnapshot,
  KnowledgeNode,
  Need,
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
  TaskDraft,
} from './gov-store.js';

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

  constructor(
    seed: GovernanceSnapshot = governanceScenarioFixture,
    clock: Clock = new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW)),
  ) {
    // 浅克隆 + 克隆全部 8 个数组（M13）：写方法追加时不污染共享 fixture。复用 cloneArrayFields（与
    // FileGovStore.cloneSnapshot 同一份实现，零漂移）——groups/members/taskKnowledgeTags 当前无写方法触及，
    // 但一并克隆保证隔离一致性（防未来写入串台污染共享 fixture，进而影响后续实例与依赖 fixture 的测试）；
    // artifacts 同理（图纸版本日志当前只读）。
    this.snapshot = cloneArrayFields(seed, [
      'groups',
      'members',
      'tasks',
      'dependencies',
      'needs',
      'knowledgeNodes',
      'taskKnowledgeTags',
      'artifacts',
    ]);
    this.clock = clock;
  }

  async getSnapshot(): Promise<GovernanceSnapshot> {
    return this.snapshot;
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
   * PM 项目计划表单条任务录入（C1 兜底录入口，POST /api/tasks）。Store 补 id + 时间戳 + 派生默认：
   * `status` 默认 `pending`、`statusSource` 默认 `console`（C5：真实进度优先 git/lark 派生，console 录入兜底）、
   * `lastProgressAt` 初始 null（由 commit/check-in 派生信号回填）。**C2/I0**：Task.ownerId 只表「谁负责」分工
   * （D-041 ② 安全堆），无完成量横比维度；不引入 dueDate（D-042 / G4 无硬截止）。
   */
  async createTask(draft: TaskDraft): Promise<Task> {
    const now = this.clock.now().toISOString();
    const task: Task = {
      ...draft,
      id: `task-new-${this.snapshot.tasks.length + 1}`,
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
      id: `dep-new-${this.snapshot.dependencies.length + 1}`,
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
      id: `need-new-${this.snapshot.needs.length + 1}`,
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
      id: `kn-cl-${this.snapshot.knowledgeNodes.length + 1}`,
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
      id: `artifact-new-${this.snapshot.artifacts.length + 1}`,
      submittedVia: 'console',
      createdAt: now,
    };
    this.snapshot.artifacts.push(artifact);
    return artifact;
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
