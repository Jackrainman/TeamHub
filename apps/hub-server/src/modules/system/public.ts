import type { FastifyInstance } from 'fastify';
import type { AppSettings, Group, IdentityMode, Member, TaskStatus } from '@teamhub/hub-contracts';
import { isSuperAdmin } from '../../authz.js';
import type { SessionManager } from '../../identity/session-store.js';
import type { SqliteDatabase } from '../../store/sqlite-db.js';
import type { V1Database } from '../../store/v1-database.js';
import { SqliteSettingsRepository } from './sqlite-repository.js';
import { registerSystemRoutes } from './routes.js';

export interface SystemTaskExportRow {
  id: string;
  title: string;
  groupId: string;
  status: TaskStatus;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  rawSummary: string;
}

/** system 消费的任务读取能力；由 tasks.publicApi 在组合根注入。 */
export interface SystemTasksPort {
  hasTasksInGroup(groupId: string): boolean;
  listForExport(): SystemTaskExportRow[];
}

export type MemberSearchRow = Pick<Member, 'id' | 'displayName' | 'groupId'>;

export interface SystemPublicApi {
  listMembers(): Member[];
  listGroups(): Group[];
  listForSearch(): MemberSearchRow[];
  memberHasPin(memberId: string): boolean;
  isSuperAdmin(memberId: string): Promise<boolean>;
  displayNames(): Promise<Record<string, string>>;
}

export interface SystemModuleRouteOptions {
  settings: AppSettings;
  tasks: SystemTasksPort;
  identityMode: IdentityMode;
  sessions: SessionManager | null;
  trustProxy: boolean | string;
  cookieSecure?: boolean;
  setupControl?: {
    database: V1Database;
    now?: () => Date;
    exit?: (code: number) => void;
    restartDelayMs?: number;
  };
}

export interface SystemModule {
  publicApi: SystemPublicApi;
  registerRoutes(app: FastifyInstance, options: SystemModuleRouteOptions): void;
}

export function createSystemModule(db: SqliteDatabase): SystemModule {
  const repository = new SqliteSettingsRepository(db);
  return {
    publicApi: {
      listMembers: () => repository.listMembers(),
      listGroups: () => repository.listGroups(),
      listForSearch: () => repository.listMembers().map((member) => ({
        id: member.id,
        displayName: member.displayName,
        groupId: member.groupId,
      })),
      memberHasPin: (memberId) => Boolean(repository.getMember(memberId)?.pinHash),
      isSuperAdmin: async (memberId) => isSuperAdmin(repository.listMembers(), memberId),
      displayNames: async () => Object.fromEntries(
        repository.listMembers().map((member) => [member.id, member.displayName]),
      ),
    },
    registerRoutes(app, options) {
      registerSystemRoutes(app, { repository, ...options });
    },
  };
}
