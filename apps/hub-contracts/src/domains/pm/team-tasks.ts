import { deriveTaskAcceptance, type TaskWithMeta, type TaskStatus } from './model.js';

export type TeamTaskStatus = 'all' | TaskStatus | 'awaitingReview' | 'accepted';

export function selectTeamTasks<T extends TaskWithMeta>(tasks: readonly T[], filter: { q: string; groupId: string; status: TeamTaskStatus }): T[] {
  const needle = filter.q.trim().toLowerCase();
  return tasks.filter(task => {
    if (filter.groupId && task.groupId !== filter.groupId) return false;
    if (needle && ![task.id, task.title, task.rawSummary, ...(task.activity ?? []).flatMap(event => [event.title ?? '', event.rawSummary ?? ''])].some(text => text.toLowerCase().includes(needle))) return false;
    if (filter.status === 'all') return true;
    if (filter.status === 'accepted' || filter.status === 'awaitingReview') return deriveTaskAcceptance(task, task.isBig) === filter.status;
    return task.status === filter.status;
  });
}
