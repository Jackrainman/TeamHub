import type { QueryClient } from '@tanstack/react-query';

/**
 * 排班族同族失效：resource session 的增/改/删会同时被 SchedulePage（['schedule',…]）、
 * RelayCanvas（['relay',…]）、TodayPlanTable（['resource-sessions']）以及任务/依赖视图读取。
 * 任一处写 session 后必须整族失效，否则父级 SchedulePage 在 staleTime 窗口内晾旧（前缀匹配，
 * 单元素 key 打掉各命名空间下的同族 query）。接力手线（handoff）只在画布可见，用窄失效 relayOnly。
 */
export function invalidateScheduleFamily(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['schedule'] });
  void queryClient.invalidateQueries({ queryKey: ['relay'] });
  void queryClient.invalidateQueries({ queryKey: ['resource-sessions'] });
  void queryClient.invalidateQueries({ queryKey: ['tasks'] });
  void queryClient.invalidateQueries({ queryKey: ['dep-graph'] });
}

/** 仅接力画布可见的写动作（拉手线 / 删手线）用此窄失效，不打扰 schedule/tasks。 */
export function invalidateRelayOnly(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['relay'] });
}
