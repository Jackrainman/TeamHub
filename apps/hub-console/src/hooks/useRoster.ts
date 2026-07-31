import { useQuery } from '@tanstack/react-query';
import type { HubApiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';

export function useMembers(client: HubApiClient, tag = 'default') {
  return useQuery({
    queryKey: [...queryKeys.members(), tag],
    queryFn: () => client.getMembers(),
  });
}

export function useGroups(client: HubApiClient, tag = 'default') {
  return useQuery({
    queryKey: queryKeys.groups(tag),
    queryFn: () => client.getGroups(),
  });
}

export function useSeasons(client: HubApiClient) {
  return useQuery({
    queryKey: queryKeys.seasons(),
    queryFn: () => client.getSeasons(),
  });
}
