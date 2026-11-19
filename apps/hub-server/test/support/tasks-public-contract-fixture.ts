import { FixedClock } from '../../src/clock.js';
import { createTasksModule, type TasksPublicApi } from '../../src/modules/tasks/public.js';
import { createTestHub, type TestHub } from './build-test-hub-server.js';

export interface TasksContractFixture {
  hub: TestHub;
  tasks: TasksPublicApi;
}

/** 测试夹具只直接依赖 tasks public；system provider 由既有 Hub 夹具提供。 */
export function createTasksContractFixture(): TasksContractFixture {
  const hub = createTestHub();
  const tasks = createTasksModule({
    db: hub.database.db,
    clock: new FixedClock(new Date('2026-11-17T04:00:00.000Z')),
    directory: hub.system,
    identityMode: 'identity',
  });
  return { hub, tasks: tasks.publicApi };
}
