import type { Task } from '@teamhub/hub-contracts';

export interface TasksRepository {
  listTasks(): Task[];
  getTask(id: string): Task | undefined;
  createTask(task: Task): Task;
  updateTask(id: string, update: (current: Task) => Task): Task | undefined;
}
