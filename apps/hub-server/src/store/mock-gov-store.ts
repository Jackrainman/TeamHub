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
 * PM 录入簇（createTask/createDependency/createNeed）**仍实现后置**（PM 支柱落地时补）：方法体 throw
 * 而非静默吞或就地实现，避免在 PM 录入路由落地前过早成主录入口、退化成新死表（C1）。
 * `closeoutKbNode` 由 KB-CORE 落地实现（POST /api/kb/closeout 消费）。
 */
const WRITE_IMPL_DEFERRED =
  'InMemoryGovStore: PM 录入写入实现后置（PM 支柱路由落地时补内存写入）';

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

  async createDependency(_draft: DependencyDraft): Promise<Dependency> {
    throw new Error(WRITE_IMPL_DEFERRED);
  }

  async createNeed(_draft: NeedDraft): Promise<Need> {
    throw new Error(WRITE_IMPL_DEFERRED);
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
