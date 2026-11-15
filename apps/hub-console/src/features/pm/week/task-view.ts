export type TaskLayout = 'grid' | 'list';

const STORAGE_KEY = 'teamhub.week.task-view.v1';

export function readTaskLayout(): TaskLayout {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { layout?: TaskLayout };
    return value.layout === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

export function writeTaskLayout(layout: TaskLayout): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ layout })); } catch { /* Storage may be unavailable. */ }
}
