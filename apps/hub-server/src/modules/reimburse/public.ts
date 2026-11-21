import type { FastifyInstance } from 'fastify';
import type { IdentityMode, ReimburseEntry, SessionIdentity } from '@teamhub/hub-contracts';
import type { ApplicationUnitOfWork } from '../../application/unit-of-work.js';
import type { Clock } from '../../clock.js';
import type { SqliteDatabase } from '../../store/sqlite-db.js';
import { LocalEvidenceFileStorage } from './evidence-file-storage.js';
import { ReimburseImportService } from './import-service.js';
import { LocalReimburseImportStorage } from './import-file-storage.js';
import { SqliteReimburseImportRepository } from './import-sqlite-repository.js';
import { registerReimburseImportRoutes } from './import-routes.js';
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
  const evidenceStorage = new LocalEvidenceFileStorage();
  const service = new ReimburseService(
    repository,
    options.admin,
    options.unitOfWork,
    options.identityMode,
    evidenceStorage,
  );
  const importService = new ReimburseImportService(
    SqliteReimburseImportRepository.fromSharedDb(options.db), repository, service,
    new LocalReimburseImportStorage(() => evidenceStorage.dir()), evidenceStorage,
    options.admin, options.unitOfWork, options.clock,
  );
  return {
    publicApi: {
      listForSearch: async (identity) => (await service.listEntries(identity,
        identity && await options.admin.isSuperAdmin(identity.memberId) ? 'all' : 'mine')).map((entry) => ({
        id: entry.id,
        summary: entry.summary,
        invoiceNo: entry.invoiceNo,
        workflowStatus: entry.workflowStatus,
        totalAmountFen: entry.totalAmountFen,
      })),
    },
    registerRoutes(app) {
      registerReimburseRoutes(app, { service });
      registerReimburseImportRoutes(app, importService);
    },
  };
}
