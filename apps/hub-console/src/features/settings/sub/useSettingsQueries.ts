import { useQuery } from '@tanstack/react-query';
import type { HubApiClient } from '../../../api/client';
import { queryKeys } from '../../../api/queryKeys';

export function useSystemStatus(client: HubApiClient, source: string) {
  return useQuery({
    queryKey: queryKeys.systemStatus(source),
    queryFn: () => client.getSystemStatus(),
  });
}

export function useHubOverview(client: HubApiClient, source: string) {
  return useQuery({
    queryKey: queryKeys.hubOverview(source),
    queryFn: () => client.getOverview(),
  });
}

export function useLarkConfig(client: HubApiClient) {
  return useQuery({
    queryKey: queryKeys.larkConfig(),
    queryFn: () => client.getLarkConfig(),
  });
}
