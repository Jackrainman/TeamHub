import type { SharedResource, Task } from '@teamhub/hub-contracts';

// 车-任务匹配纯函数（跨 schedule / resources 两 feature 共用，CONTRACTS-SHARED-PREVIEW 自
// features/schedule/today-plan.ts 上提至 shared/lib，消 resources→schedule 跨 feature import）。
// 零副作用、配单测；I0：只读 robotTarget / title 结构键，无人维度。

/** 该车候选任务：robotTarget 对齐（未填 robotTarget 的任务 = 泛化租户任务，也算候选）+ shared 通用任务。 */
export function candidateTasksForResource(tasks: Task[], resource: SharedResource): Task[] {
  return tasks.filter(
    (t) =>
      t.robotTarget == null || t.robotTarget === resource.robotTarget || t.robotTarget === 'shared',
  );
}

/** 按标题在该车候选任务里找精确匹配（trim + 大小写不敏感）；找不到返回 undefined。 */
export function matchTaskByTitle(
  tasks: Task[],
  resource: SharedResource,
  title: string,
): Task | undefined {
  const trimmed = title.trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();
  return candidateTasksForResource(tasks, resource).find(
    (t) => t.title.trim().toLowerCase() === lower,
  );
}
