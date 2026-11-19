import type { FastifyInstance } from 'fastify';
import type { Member, ReimburseEntry, SessionIdentity, Task } from '@teamhub/hub-contracts';
import { registerSearchRoutes } from './routes.js';

export type SearchTaskRow = Pick<Task, 'id' | 'title' | 'rawSummary'>;
export type SearchMemberRow = Pick<Member, 'id' | 'displayName' | 'groupId'>;
export type SearchReimburseRow = Pick<
  ReimburseEntry,
  'id' | 'summary' | 'invoiceNo' | 'workflowStatus' | 'totalAmountFen'
>;

export interface SearchModuleOptions {
  tasks: { listForSearch(): SearchTaskRow[] };
  members: { listForSearch(): SearchMemberRow[] };
  reimburse: { listForSearch(identity: SessionIdentity | null): Promise<SearchReimburseRow[]> };
}

export interface SearchModule {
  registerRoutes(app: FastifyInstance): void;
}

/** search 只组合其他模块的公开读用例，不接触其 repository 或 service。 */
export function createSearchModule(options: SearchModuleOptions): SearchModule {
  return {
    registerRoutes(app) {
      registerSearchRoutes(app, {
        tasks: () => options.tasks.listForSearch(),
        members: () => options.members.listForSearch(),
        reimburse: (identity) => options.reimburse.listForSearch(identity),
      });
    },
  };
}
