import { useQuery } from '@tanstack/react-query';
import type { HubApiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';

export type BaselineClient = Pick<HubApiClient, 'getBaseline'>;

export function useBaseline(client: BaselineClient, source: string, seasonId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.baseline(source, seasonId ?? ''),
    queryFn: () => client.getBaseline(seasonId!),
    enabled: Boolean(seasonId),
  });
}
