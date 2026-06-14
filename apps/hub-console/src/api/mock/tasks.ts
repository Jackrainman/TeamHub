import {
  TasksResponseSchema,
  governanceScenarioFixture,
  type Task,
} from '@teamhub/hub-contracts';

/**
 * Mock 任务看板数据 = 治理锚点场景的 tasks（与 /api/dep-graph 同一份真相，
 * 故看板列与依赖图口径一致）。经 TasksResponseSchema 解析，fail-closed。
 */
export const mockTasks: { tasks: Task[] } = TasksResponseSchema.parse({
  tasks: governanceScenarioFixture.tasks,
});
