import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SelfReportTaskRequest, TaskStatus, UpdateSelfTaskRequest } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { useHubMutation } from '../../hooks/useHubMutation';
import { currentShanghaiWeek } from '../../shared/lib/now';

export function useTasks(client: HubApiClient, source: string, enabled = true) {
  return useQuery({ queryKey: queryKeys.tasks(source), refetchInterval: 30_000,
    queryFn: () => client.getTasks(), enabled });
}
export function useCompleteTask(client: HubApiClient, onError?: () => void) {
  return useHubMutation({ meta: { silent: true }, invalidateKeys: [queryKeys.allTasks()],
    mutationFn: (taskId: string) => client.completeTask(taskId, {}), onError });
}
export function useTasksSearch(client: HubApiClient, source: string, q: string) {
  return useQuery({ queryKey: queryKeys.tasksSearch(source, q), queryFn: () => client.getTasks({ q }), enabled: q.length > 0 });
}
export function useGroups(client: Pick<HubApiClient, 'getGroups'>, tag = 'default', enabled = true) {
  return useQuery({ queryKey: queryKeys.groups(tag), queryFn: () => client.getGroups(), enabled });
}
export function useCurrentWeek() {
  const [week, setWeek] = useState(currentShanghaiWeek);
  useEffect(() => {
    const timer = setInterval(() => setWeek(currentShanghaiWeek()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return week;
}
export function useEditSelfTask(client: HubApiClient, taskId: string, onSaved: () => void) {
  return useHubMutation({ invalidateKeys: [queryKeys.allTasks()],
    mutationFn: (input: UpdateSelfTaskRequest) => client.editSelfTask(taskId, input), onSuccess: onSaved });
}
export function useWeekActions(client: HubApiClient, onCreated: () => void) {
  const invalidateKeys = [queryKeys.allTasks()];
  const create = useHubMutation({ invalidateKeys,
    mutationFn: ({ weekKey, input }: { weekKey: string; input: SelfReportTaskRequest }) => client.selfReportTask(weekKey, input),
    onSuccess: onCreated });
  const claim = useHubMutation({ invalidateKeys,
    mutationFn: ({ taskId, weekKey }: { taskId: string; weekKey: string }) => client.claimTask(taskId, { weekKey }) });
  const link = useHubMutation({ invalidateKeys,
    mutationFn: ({ taskId, weekKey }: { taskId: string; weekKey: string }) => client.linkTaskWeek(taskId, weekKey) });
  const status = useHubMutation({ invalidateKeys,
    mutationFn: ({ taskId, status, expectedRevision }: { taskId: string; status: TaskStatus; expectedRevision?: number }) =>
      client.updateTaskStatus(taskId, status, expectedRevision) });
  return { create, claim, link, status };
}
