import { useQuery } from '@tanstack/react-query';
import type { HubApiClient } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';

export function useSetupState(client: HubApiClient) {
  return useQuery({ queryKey: queryKeys.setupState(), queryFn: () => client.getSetupState(), retry: 1 });
}
export function useSystemStatus(client: HubApiClient, source: string) {
  return useQuery({ queryKey: queryKeys.systemStatus(source), queryFn: () => client.getSystemStatus() });
}
