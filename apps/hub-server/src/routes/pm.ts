import type { FastifyInstance } from 'fastify';
import type { IdentityMode } from '@teamhub/hub-contracts';
import type { PmRepository } from '../modules/pm/repository.js';
import type { BaselineService } from '../modules/baseline/service.js';
import type { ChecklistService } from '../modules/checklist/service.js';
import type { Clock } from '../clock.js';
import type { SessionManager } from '../identity/session-store.js';
import type { LarkIntegrationStore } from '../store/lark-integration-store.js';
import { registerBaselineRoutes } from '../modules/baseline/routes.js';
import { registerMemberRoutes } from './members.js';
import { registerRosterRoutes } from './roster.js';
import { registerTaskRoutes } from './tasks.js';
import { registerTaskClaimRoutes } from './tasks-claim.js';
import { registerChecklistRoutes } from '../modules/checklist/routes.js';

export interface PmCoreRouteDeps {
  store: PmRepository;
  clock: Clock;
  baselineService: BaselineService;
  checklistService: ChecklistService;
  identityMode: IdentityMode;
  trustProxy: boolean | string;
  sessions: SessionManager | null;
  larkStore?: LarkIntegrationStore;
}

export function registerPmCoreRoutes(app: FastifyInstance, deps: PmCoreRouteDeps): void {
  const { store, clock, baselineService, checklistService, identityMode } = deps;

  registerMemberRoutes(app, {
    store,
    identityMode,
    trustProxy: deps.trustProxy,
    sessions: deps.sessions,
  });

  registerRosterRoutes(app, { store, identityMode });

  registerTaskRoutes(app, {
    store,
    clock,
    identityMode,
    larkStore: deps.larkStore,
  });

  registerTaskClaimRoutes(app, {
    store,
    clock,
    identityMode,
    larkStore: deps.larkStore,
  });

  registerBaselineRoutes(app, baselineService);

  registerChecklistRoutes(app, checklistService);
}
