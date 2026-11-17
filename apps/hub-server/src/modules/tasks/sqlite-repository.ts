import { TaskSchema, type Task } from '@teamhub/hub-contracts';
import type { SqliteDatabase } from '../../store/sqlite-db.js';
import type { TasksRepository } from './repository.js';

export class SqliteTasksRepository implements TasksRepository {
  constructor(private readonly db: SqliteDatabase) {}
  listTasks(): Task[] { return this.db.allRows<Task>('tasks').map((row) => TaskSchema.parse(row)); }
  getTask(id: string): Task | undefined {
    const row = this.db.getRow<Task>('tasks', id);
    return row ? TaskSchema.parse(row) : undefined;
  }
  createTask(task: Task): Task {
    const parsed = TaskSchema.parse(task);
    this.db.tx(() => this.db.insertRow('tasks', parsed.id, parsed));
    return parsed;
  }
  updateTask(id: string, update: (current: Task) => Task): Task | undefined {
    return this.db.tx(() => {
      const current = this.getTask(id);
      if (!current) return undefined;
      const next = TaskSchema.parse(update(current));
      this.db.updateRow('tasks', id, next);
      return next;
    });
  }
}
