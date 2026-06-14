import {
  GOVERNANCE_SCENARIO_NOW,
  governanceScenarioFixture,
} from '@teamhub/hub-contracts';
import type {
  Dependency,
  GovernanceSnapshot,
  KnowledgeNode,
  Need,
  Task,
} from '@teamhub/hub-contracts';
import { FixedClock } from '../clock.js';
import type { Clock } from '../clock.js';
import type {
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
    // 浅克隆 + 克隆被写入的数组（tasks/dependencies/needs/knowledgeNodes）：写方法追加时不污染共享 fixture。
    this.snapshot = {
      ...seed,
      tasks: [...seed.tasks],
      dependencies: [...seed.dependencies],
      needs: [...seed.needs],
      knowledgeNodes: [...seed.knowledgeNodes],
    };
    this.clock = clock;
  }

  async getSnapshot(): Promise<GovernanceSnapshot> {
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
    const node: KnowledgeNode = {
      ...draft,
      id: `kn-cl-${this.snapshot.knowledgeNodes.length + 1}`,
      createdAt: this.clock.now().toISOString(),
    };
    this.snapshot.knowledgeNodes.push(node);
    return node;
  }
}
