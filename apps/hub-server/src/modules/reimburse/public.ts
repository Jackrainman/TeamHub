import type { FastifyInstance } from 'fastify';
import type { IdentityMode, ReimburseEntry, SessionIdentity } from '@teamhub/hub-contracts';
import type { ApplicationUnitOfWork } from '../../application/unit-of-work.js';
import type { Clock } from '../../clock.js';
import type { SqliteDatabase } from '../../store/sqlite-db.js';
import { LocalEvidenceFileStorage } from './evidence-file-storage.js';
import { registerReimburseRoutes } from './routes.js';
import { ReimburseService } from './service.js';
import { SqliteReimburseRepository } from './sqlite-repository.js';

/** 报销模块消费的管理员工具；由 system.publicApi 在组合根注入。 */
export interface ReimburseAdminPort {
  isSuperAdmin(memberId: string): Promise<boolean>;
  displayNames?(): Promise<Record<string, string>>;
}

export type ReimburseSearchRow = Pick<
  ReimburseEntry,
  'id' | 'summary' | 'invoiceNo' | 'workflowStatus' | 'totalAmountFen'
>;

export interface ReimbursePublicApi {
  listForSearch(identity: SessionIdentity | null): Promise<ReimburseSearchRow[]>;
}

export interface ReimburseModule {
  publicApi: ReimbursePublicApi;
  registerRoutes(app: FastifyInstance): void;
}

export interface CreateReimburseModuleOptions {
  db: SqliteDatabase;
  clock: Clock;
  admin: ReimburseAdminPort;
  unitOfWork: ApplicationUnitOfWork;
  identityMode: IdentityMode;
}

export function createReimburseModule(options: CreateReimburseModuleOptions): ReimburseModule {
  const repository = SqliteReimburseRepository.fromSharedDb(options.db, options.clock);
  const service = new ReimburseService(
    repository,
    options.admin,
    options.unitOfWork,
    options.identityMode,
    new LocalEvidenceFileStorage(),
  );
  return {
    publicApi: {
      listForSearch: async (identity) => (await service.listEntries(identity)).map((entry) => ({
        id: entry.id,
        summary: entry.summary,
        invoiceNo: entry.invoiceNo,
        workflowStatus: entry.workflowStatus,
        totalAmountFen: entry.totalAmountFen,
      })),
    },
    registerRoutes(app) {
      registerReimburseRoutes(app, { service });
    },
  };
}
