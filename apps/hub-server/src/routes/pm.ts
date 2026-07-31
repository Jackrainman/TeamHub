import type { FastifyInstance } from 'fastify';
import type { IdentityMode } from '@teamhub/hub-contracts';
import type { GovStore } from '../store/gov-store.js';
import type { BaselineStore } from '../store/baseline-store.js';
import type { ChecklistStore } from '../store/checklist-store.js';
import type { Clock } from '../clock.js';
import type { SessionManager } from '../identity/session-store.js';
import type { LarkIntegrationStore } from '../store/lark-integration-store.js';
import { registerBaselineRoutes } from './baseline.js';
import { registerMemberRoutes } from './members.js';
import { registerRosterRoutes } from './roster.js';
import { registerTaskRoutes } from './tasks.js';
import { registerChecklistRoutes } from './checklist.js';

export interface PmCoreRouteDeps {
  store: GovStore;
  clock: Clock;
  baselineStore: BaselineStore;
  checklistStore: ChecklistStore;
  identityMode: IdentityMode;
  trustProxy: boolean | string;
  sessions: SessionManager | null;
  larkStore?: LarkIntegrationStore;
}

export function registerPmCoreRoutes(app: FastifyInstance, deps: PmCoreRouteDeps): void {
  const { store, clock, baselineStore, checklistStore, identityMode } = deps;

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

  registerBaselineRoutes(app, { store, baselineStore, checklistStore });

  registerChecklistRoutes(app, { store, clock, baselineStore, checklistStore });
}
