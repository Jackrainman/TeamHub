import { useQuery } from '@tanstack/react-query';
import type { HubApiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';

export function useTasks(client: HubApiClient, source: string) {
  return useQuery({
    queryKey: queryKeys.tasks(source),
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
