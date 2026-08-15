import { GOVERNANCE_SCENARIO_NOW, ROBOTICS_TENANT_CONFIG } from '@teamhub/hub-contracts';
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
import { TestApplicationUnitOfWork } from './test-application-unit-of-work.js';

type StoreOptionKey =
  | 'store'
  | 'kbStore'
  | 'invStore'
  | 'baselineStore'
  | 'checklistStore'
  | 'reimburseStore'
  | 'inventoryStockInPort'
  | 'reimburseStockInPort'
  | 'unitOfWork'
  | 'tenantConfig'
  | 'identityMode';

export type BuildTestHubServerOptions =
  Omit<BuildHubServerOptions, StoreOptionKey>
  & Partial<Pick<BuildHubServerOptions, StoreOptionKey>>;

/**
 * 测试专用组合根：集中提供六域 InMemory fake，生产 buildHubServer 不持有任何 fake 默认值。
 * 显式传入的 store 会覆盖对应 fake；三类带时间戳的 fake 与路由共享同一个 clock。
 */
export function buildTestHubServer(options: BuildTestHubServerOptions = {}) {
  const clock = options.clock ?? new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW));
  const invStore = options.invStore ?? new InMemoryInvStore(undefined, clock);
  const reimburseStore =
    options.reimburseStore ?? new InMemoryReimburseStore(undefined, clock);

  return buildHubServer({
    ...options,
    clock,
    tenantConfig: options.tenantConfig ?? ROBOTICS_TENANT_CONFIG,
    identityMode: options.identityMode ?? 'anonymous',
    store: options.store ?? new InMemoryGovStore(undefined, clock),
    kbStore: options.kbStore ?? new InMemoryKbStore(),
    invStore,
    baselineStore: options.baselineStore ?? new InMemoryBaselineStore(),
    checklistStore: options.checklistStore ?? new InMemoryChecklistStore(),
    reimburseStore,
    inventoryStockInPort: options.inventoryStockInPort ?? invStore,
    reimburseStockInPort: options.reimburseStockInPort ?? reimburseStore,
    unitOfWork: options.unitOfWork ?? new TestApplicationUnitOfWork(clock),
  });
}
