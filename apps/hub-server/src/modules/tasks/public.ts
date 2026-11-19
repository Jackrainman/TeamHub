import type { FastifyInstance } from 'fastify';
import type { Group, IdentityMode, Member, Task } from '@teamhub/hub-contracts';
import type { Clock } from '../../clock.js';
import type { SqliteDatabase } from '../../store/sqlite-db.js';
import { SqliteTasksRepository } from './sqlite-repository.js';
import { TasksService } from './service.js';
import { registerTaskRoutes } from './routes.js';

/** 任务模块消费的名册目录；由 system.publicApi 在组合根注入。 */
export interface TaskDirectoryPort {
  listMembers(): Member[];
  listGroups(): Group[];
}

export interface TasksPublicApi {
  listTasks(): Task[];
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
      listTasks: () => service.listTasks(),
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
