import type { Group, TaskStatus, TaskWithMeta } from '@teamhub/hub-contracts';

export type TaskLayout = 'grid' | 'list';
export type TaskGrouping = 'none' | 'project' | 'group' | 'status';
export type TaskSort = 'updated' | 'title' | 'status';

export interface TaskViewPreferences {
  layout: TaskLayout;
  columns: 2 | 3 | 4;
}

export const DEFAULT_TASK_VIEW: TaskViewPreferences = { layout: 'grid', columns: 3 };
const STORAGE_KEY = 'teamhub.week.task-view.v1';
const STATUS_ORDER: TaskStatus[] = ['blocked', 'inProgress', 'pending', 'done', 'shelved'];

export function readTaskViewPreferences(): TaskViewPreferences {
  if (typeof window === 'undefined') return DEFAULT_TASK_VIEW;
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<TaskViewPreferences> | null;
    return {
      layout: value?.layout === 'list' ? 'list' : 'grid',
      columns: value?.columns === 2 || value?.columns === 4 ? value.columns : 3,
    };
  } catch {
    return DEFAULT_TASK_VIEW;
  }
}

export function writeTaskViewPreferences(value: TaskViewPreferences): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // 禁用本机存储时保留当前会话状态，不阻断任务操作。
  }
}

export interface TaskGroup {
  key: string;
  label: string;
  tasks: TaskWithMeta[];
}

/** 分组键只取项目/小组/状态，排序也只取任务事实；不存在人员维度入口（I0）。 */
export function organizeTasks(
  tasks: readonly TaskWithMeta[],
  groups: readonly Group[],
  grouping: TaskGrouping,
  sort: TaskSort,
  statusLabel: (status: TaskStatus) => string,
  ungroupedLabel: string,
): TaskGroup[] {
  const groupNames = new Map(groups.map(group => [group.id, group.name]));
  const sorted = [...tasks].sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title, 'zh-CN');
    if (sort === 'status') {
      const byStatus = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
      return byStatus || a.title.localeCompare(b.title, 'zh-CN');
    }
    return b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title, 'zh-CN');
  });
  if (grouping === 'none') return [{ key: 'all', label: '', tasks: sorted }];

  const buckets = new Map<string, TaskGroup>();
  for (const task of sorted) {
    const key = grouping === 'project' ? task.projectId : grouping === 'group' ? task.groupId : task.status;
    const label = grouping === 'project'
      ? task.projectName || task.projectId
      : grouping === 'group'
        ? groupNames.get(task.groupId) ?? ungroupedLabel
        : statusLabel(task.status);
    const bucket = buckets.get(key) ?? { key, label, tasks: [] };
    bucket.tasks.push(task);
    buckets.set(key, bucket);
  }
  return [...buckets.values()];
}
