import { GOVERNANCE_SCENARIO_NOW } from '@teamhub/hub-contracts';
import { FixedClock } from '../../src/clock.js';
import {
  buildHubServer,
  type BuildHubServerOptions,
} from '../../src/server.js';
import { InMemoryBaselineStore } from './inmemory-baseline-store.js';
import { InMemoryChecklistStore } from './inmemory-checklist-store.js';
import { InMemoryGovStore } from './inmemory-gov-store.js';
import { InMemoryInvStore } from './inmemory-inv-store.js';
import { InMemoryKbStore } from './inmemory-kb-store.js';
import { InMemoryReimburseStore } from './inmemory-reimburse-store.js';

type StoreOptionKey =
  | 'store'
  | 'kbStore'
  | 'invStore'
  | 'baselineStore'
  | 'checklistStore'
  | 'reimburseStore';

export type BuildTestHubServerOptions =
  Omit<BuildHubServerOptions, StoreOptionKey>
  & Partial<Pick<BuildHubServerOptions, StoreOptionKey>>;

/**
 * 测试专用组合根：集中提供六域 InMemory fake，生产 buildHubServer 不持有任何 fake 默认值。
 * 显式传入的 store 会覆盖对应 fake；三类带时间戳的 fake 与路由共享同一个 clock。
 */
export function buildTestHubServer(options: BuildTestHubServerOptions = {}) {
  const clock = options.clock ?? new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW));

  return buildHubServer({
    ...options,
    clock,
    store: options.store ?? new InMemoryGovStore(undefined, clock),
    kbStore: options.kbStore ?? new InMemoryKbStore(),
    invStore: options.invStore ?? new InMemoryInvStore(undefined, clock),
    baselineStore: options.baselineStore ?? new InMemoryBaselineStore(),
    checklistStore: options.checklistStore ?? new InMemoryChecklistStore(),
    reimburseStore: options.reimburseStore ?? new InMemoryReimburseStore(undefined, clock),
  });
}
