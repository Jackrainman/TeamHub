import { useQuery } from '@tanstack/react-query';
import type { HubApiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';

export type MembersClient = Pick<HubApiClient, 'getMembers'>;
export type GroupsClient = Pick<HubApiClient, 'getGroups'>;
export type SeasonsClient = Pick<HubApiClient, 'getSeasons'>;

export function useMembers(client: MembersClient, tag = 'default') {
  return useQuery({
    queryKey: [...queryKeys.members(), tag],
    queryFn: () => client.getMembers(),
  });
}

export function useGroups(client: GroupsClient, tag = 'default') {
  return useQuery({
    queryKey: queryKeys.groups(tag),
    queryFn: () => client.getGroups(),
  });
}

export function useSeasons(client: SeasonsClient) {
  return useQuery({
    queryKey: queryKeys.seasons(),
    queryFn: () => client.getSeasons(),
  });
}
