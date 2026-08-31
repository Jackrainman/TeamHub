import type { FastifyInstance } from 'fastify';
import type { IdentityMode } from '@teamhub/hub-contracts';
import type { PmRepository } from './repository.js';
import type { BaselineService } from '../baseline/service.js';
import type { ChecklistService } from '../checklist/service.js';
import type { Clock } from '../../clock.js';
import type { SessionManager } from '../../identity/session-store.js';
import type { LarkIntegrationStore } from '../integrations/lark-store.js';
import { registerBaselineRoutes } from '../baseline/routes.js';
import { registerMemberRoutes } from './members.js';
import { registerRosterRoutes } from './roster.js';
import { registerTaskRoutes } from './tasks.js';
import { registerTaskClaimRoutes } from './tasks-claim.js';
import { registerChecklistRoutes } from '../checklist/routes.js';

import { PmService } from './service.js';

/** pm 域模块组合（ARCH-UNIFY A4；前身 routes/pm.ts）：成员/名册/任务/认领 + 下游 baseline/checklist 子路由。 */
export interface PmCoreRouteDeps {
  store: PmRepository;
  service: PmService;
  clock: Clock;
  baselineService: BaselineService;
  checklistService: ChecklistService;
  identityMode: IdentityMode;
  trustProxy: boolean | string;
  sessions: SessionManager | null;
  larkStore?: LarkIntegrationStore;
}

export function registerPmCoreRoutes(app: FastifyInstance, deps: PmCoreRouteDeps): void {
  const { store, service, baselineService, checklistService, identityMode } = deps;

  registerMemberRoutes(app, {
    store,
    identityMode,
    trustProxy: deps.trustProxy,
    sessions: deps.sessions,
  });

  registerRosterRoutes(app, { store, identityMode });

  registerTaskRoutes(app, {
    store,
    service,
    identityMode,
    larkStore: deps.larkStore,
  });

  registerTaskClaimRoutes(app, {
    store,
    service,
    identityMode,
    larkStore: deps.larkStore,
  });

  registerBaselineRoutes(app, baselineService);

  registerChecklistRoutes(app, checklistService);
}
