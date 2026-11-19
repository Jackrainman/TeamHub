import type { FastifyInstance } from 'fastify';
import type { Group, IdentityMode, MemberPublic, Task, TaskStatus } from '@teamhub/hub-contracts';
import type { Clock } from '../../clock.js';
import type { SqliteDatabase } from '../../store/sqlite-db.js';
import { SqliteTasksRepository } from './sqlite-repository.js';
import { TasksService } from './service.js';
import { registerTaskRoutes } from './routes.js';

/** 任务模块消费的名册目录；由 system.publicApi 在组合根注入。 */
export interface TaskDirectoryPort {
  listMembers(): MemberPublic[];
  listGroups(): Group[];
}

export interface TaskExportRow {
  id: string;
  title: string;
  groupId: string;
  status: TaskStatus;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  rawSummary: string;
}

export type TaskSearchRow = Pick<Task, 'id' | 'title' | 'rawSummary'>;

export interface TasksPublicApi {
  hasTasksInGroup(groupId: string): boolean;
  listForExport(): TaskExportRow[];
  listForSearch(): TaskSearchRow[];
}

export interface TasksModule {
  publicApi: TasksPublicApi;
  registerRoutes(app: FastifyInstance): void;
}

export interface CreateTasksModuleOptions {
  db: SqliteDatabase;
  clock: Clock;
  directory: TaskDirectoryPort;
  identityMode: IdentityMode;
}

export function createTasksModule(options: CreateTasksModuleOptions): TasksModule {
  const repository = new SqliteTasksRepository(options.db);
  const service = new TasksService(repository, options.directory, options.clock);
  return {
    publicApi: {
      hasTasksInGroup: (groupId) => service.listTasks().some((task) => task.groupId === groupId),
      listForExport: () => service.listTasks().map((task) => ({
        id: task.id,
        title: task.title,
        groupId: task.groupId,
        status: task.status,
        plannedStart: task.plannedStart,
        plannedEnd: task.plannedEnd,
        rawSummary: task.rawSummary,
      })),
      listForSearch: () => service.listTasks().map((task) => ({
        id: task.id,
        title: task.title,
        rawSummary: task.rawSummary,
      })),
    },
    registerRoutes(app) {
      registerTaskRoutes(app, {
        service,
        directory: options.directory,
        identityMode: options.identityMode,
      });
    },
  };
}
