import { useQuery } from '@tanstack/react-query';
import type { HubApiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';

export function useInventory(client: HubApiClient, source: string) {
  return useQuery({
    queryKey: queryKeys.inventory(source),
    queryFn: () => client.getInventory(),
  });
}
