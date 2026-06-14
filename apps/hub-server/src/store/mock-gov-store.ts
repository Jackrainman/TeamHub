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
    // 浅克隆 + 克隆被写入的 knowledgeNodes 数组：closeoutKbNode 追加节点时不污染共享 fixture。
    this.snapshot = { ...seed, knowledgeNodes: [...seed.knowledgeNodes] };
    this.clock = clock;
  }

  async getSnapshot(): Promise<GovernanceSnapshot> {
    return this.snapshot;
  }

  async createTask(_draft: TaskDraft): Promise<Task> {
    throw new Error(WRITE_IMPL_DEFERRED);
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
