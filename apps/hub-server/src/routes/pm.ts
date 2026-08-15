import type { FastifyInstance } from 'fastify';
import type { IdentityMode } from '@teamhub/hub-contracts';
import type { GovStore } from '../store/gov-store.js';
import type { BaselineStore } from '../store/baseline-store.js';
import type { ChecklistService } from '../modules/checklist/service.js';
import type { GateChecklistPort } from '../modules/checklist/repository.js';
import type { Clock } from '../clock.js';
import type { SessionManager } from '../identity/session-store.js';
import type { LarkIntegrationStore } from '../store/lark-integration-store.js';
import { registerBaselineRoutes } from './baseline.js';
import { registerMemberRoutes } from './members.js';
import { registerRosterRoutes } from './roster.js';
import { registerTaskRoutes } from './tasks.js';
import { registerTaskClaimRoutes } from './tasks-claim.js';
import { registerChecklistRoutes } from '../modules/checklist/routes.js';

export interface PmCoreRouteDeps {
  store: GovStore;
  clock: Clock;
  baselineStore: BaselineStore;
  checklistService: ChecklistService;
  gateChecklist: GateChecklistPort;
  identityMode: IdentityMode;
  trustProxy: boolean | string;
  sessions: SessionManager | null;
  larkStore?: LarkIntegrationStore;
}

export function registerPmCoreRoutes(app: FastifyInstance, deps: PmCoreRouteDeps): void {
  const { store, clock, baselineStore, checklistService, gateChecklist, identityMode } = deps;

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

  registerBaselineRoutes(app, { store, baselineStore, gateChecklist });

  registerChecklistRoutes(app, checklistService);
}
