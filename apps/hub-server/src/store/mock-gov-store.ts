import { governanceScenarioFixture } from '@teamhub/hub-contracts';
import type {
  Dependency,
  GovernanceSnapshot,
  KnowledgeNode,
  Need,
  Task,
} from '@teamhub/hub-contracts';
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
 * 写白名单当前**实现后置**（base 收口刀只钉接口）：方法体 throw 而非静默吞或就地实现，避免在 PM/KB
 * 录入路由落地前过早成主录入口、退化成新死表（C1）。内存写入实现随 PM / KB-CORE 路由各自补。
 */
const WRITE_IMPL_DEFERRED =
  'InMemoryGovStore: 写入实现后置（base 收口刀只钉接口；PM/KB-CORE 路由落地时补内存写入）';

export class InMemoryGovStore implements GovStore {
  private readonly snapshot: GovernanceSnapshot;

  constructor(seed: GovernanceSnapshot = governanceScenarioFixture) {
    this.snapshot = seed;
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

  async closeoutKbNode(_draft: KnowledgeNodeDraft): Promise<KnowledgeNode> {
    throw new Error(WRITE_IMPL_DEFERRED);
  }
}
