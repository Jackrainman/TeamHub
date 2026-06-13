import { governanceScenarioFixture } from '@teamhub/hub-contracts';
import type { GovernanceSnapshot } from '@teamhub/hub-contracts';
import type { GovStore } from './gov-store.js';

/**
 * 内存实现：默认 seed 真实锚点场景 fixtures，让 real 路由从第一个请求起就有可派生的真实场景
 * （进程重启丢失为预期行为，SQLite/Postgres 持久层留后续）。
 */
export class InMemoryGovStore implements GovStore {
  private readonly snapshot: GovernanceSnapshot;

  constructor(seed: GovernanceSnapshot = governanceScenarioFixture) {
    this.snapshot = seed;
  }

  async getSnapshot(): Promise<GovernanceSnapshot> {
    return this.snapshot;
  }
}
