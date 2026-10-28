import { useEffect, useState } from 'react';
import { getWeekKey, type SelfReportTaskRequest, type TaskStatus } from '@teamhub/hub-contracts';
import { useQuery } from '@tanstack/react-query';
import type { CreateSeasonRequest, CreateTaskRequest, Season } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { useHubMutation } from '../../hooks/useHubMutation';

/**
 * pm 域远端状态唯一消费点（§10；前身 hooks/useTasks.ts + hooks/useRoster.ts 的组/赛季半 +
 * DepGraphPage/DirectionPage/PmCreatePanel 的裸 hook）。写侧走平台 useHubMutation。
 */

export function useTasks(client: HubApiClient, source: string) {
  return useQuery({
    queryKey: queryKeys.tasks(source),
    refetchInterval: 30_000,
    queryFn: () => client.getTasks(),
  });
}

export function useTasksSearch(client: HubApiClient, source: string, q: string) {
  return useQuery({
    queryKey: queryKeys.tasksSearch(source, q),
    queryFn: () => client.getTasks({ q }),
    enabled: q.length > 0,
  });
}

export function useGroups(
  client: Pick<HubApiClient, 'getGroups'>,
  tag = 'default',
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.groups(tag),
    queryFn: () => client.getGroups(),
    enabled,
  });
}

export function useSeasons(client: Pick<HubApiClient, 'getSeasons'>) {
  return useQuery({
    queryKey: queryKeys.seasons(),
    queryFn: () => client.getSeasons(),
  });
}

/** 依赖图。opts.cacheKey：首页 按会话身份分缓存；opts.enabled：身份门（未登录不发请求）。 */
export function useDepGraph(
  client: HubApiClient,
  source: string,
  opts?: { cacheKey?: string; enabled?: boolean },
) {
  return useQuery({
    queryKey: opts?.cacheKey
      ? [...queryKeys.depGraph(source), opts.cacheKey]
      : queryKeys.depGraph(source),
    queryFn: () => client.getDepGraph(),
    enabled: opts?.enabled,
  });
}

/** 方向缺口（DirectionPage）。 */
export function useGroupGaps(client: HubApiClient, source: string) {
  return useQuery({
    queryKey: queryKeys.groupGaps(source),
    queryFn: () => client.getGroupGaps(),
  });
}

/** PmCreatePanel 建任务（提交后由调用方 reset + 通知父级刷新）。 */
export function useCreateTask(client: Pick<HubApiClient, 'createTask'>, onCreated: () => void) {
  return useHubMutation({
    meta: { silent: true },
    invalidateKeys: [queryKeys.tasks('pm')],
    mutationFn: (req: CreateTaskRequest) => client.createTask(req),
    onSuccess: () => onCreated(),
  });
}

/** BaselineStates 一键建赛季（建议名+区间由组件算好传入）。 */
export function useCreateSeason(client: { createSeason(req: CreateSeasonRequest): Promise<unknown> }, req: { name: string; startsAt: string; endsAt: string | null }, onCreated: () => void) {
  return useHubMutation({
    meta: { silent: true },
    invalidateKeys: [queryKeys.seasons()],
    mutationFn: () => client.createSeason(req),
    onSuccess: () => onCreated(),
  });
}

export type { Season };

export type GroupsClient = Pick<HubApiClient, 'getGroups'>;
export type SeasonsClient = Pick<HubApiClient, 'getSeasons'>;

export function useCurrentWeek() {
  const [week, setWeek] = useState(() => getWeekKey(new Date()));
  useEffect(() => {
    const timer = setInterval(() => setWeek(getWeekKey(new Date())), 30_000);
    return () => clearInterval(timer);
  }, []);
  return week;
}

export function useWeekActions(client: HubApiClient, onCreated: () => void) {
  const invalidateKeys = [queryKeys.allTasks(), queryKeys.allDepGraphs()];
  const create = useHubMutation({ invalidateKeys,
    mutationFn: ({ weekKey, input }: { weekKey: string; input: SelfReportTaskRequest }) => client.selfReportTask(weekKey, input),
    onSuccess: onCreated,
  });
  const claim = useHubMutation({ invalidateKeys,
    mutationFn: ({ taskId, weekKey }: { taskId: string; weekKey: string }) => client.claimTask(taskId, { weekKey }),
  });
  const link = useHubMutation({ invalidateKeys,
    mutationFn: ({ taskId, weekKey }: { taskId: string; weekKey: string }) => client.linkTaskWeek(taskId, weekKey),
  });
  const status = useHubMutation({ invalidateKeys,
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) => client.updateTaskStatus(taskId, status),
  });
  return { create, claim, link, status };
}
