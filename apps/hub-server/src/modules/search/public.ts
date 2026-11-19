import type { FastifyInstance } from 'fastify';
import type { Member, ReimburseEntry, SessionIdentity, Task } from '@teamhub/hub-contracts';
import { registerSearchRoutes } from './routes.js';

export interface SearchModuleOptions {
  tasks: { listTasks(): Task[] };
  members: { listMembers(): Member[] };
  reimburse: { listForSearch(identity: SessionIdentity | null): Promise<ReimburseEntry[]> };
}

export interface SearchModule {
  registerRoutes(app: FastifyInstance): void;
}

/** search 只组合其他模块的公开读用例，不接触其 repository 或 service。 */
export function createSearchModule(options: SearchModuleOptions): SearchModule {
  return {
    registerRoutes(app) {
      registerSearchRoutes(app, {
        tasks: () => options.tasks.listTasks(),
        members: () => options.members.listMembers(),
        reimburse: (identity) => options.reimburse.listForSearch(identity),
      });
    },
  };
}
