import { useQuery } from '@tanstack/react-query';
import type { HubApiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';

export function useResourceSessions(client: HubApiClient) {
  return useQuery({
    queryKey: queryKeys.resourceSessions(),
    queryFn: () => client.getResourceSessions(),
  });
}

export function useResources(client: HubApiClient, source?: string) {
  return useQuery({
    queryKey: queryKeys.resources(source),
    queryFn: () => client.getResources(),
  });
}

export function useRelay(client: HubApiClient, windowLabel: string) {
  return useQuery({
    queryKey: queryKeys.relay(windowLabel),
    queryFn: () => client.getRelay(windowLabel),
    enabled: windowLabel.length > 0,
  });
}
