import { useQuery } from '@tanstack/react-query';
import type { HubApiClient } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';

/** 归档物域远端状态唯一消费点（§10）。写侧走平台 useHubMutation（invalidateKeys ['artifacts']）。 */
export function useArtifacts(client: HubApiClient, source: string) {
  return useQuery({
    queryKey: queryKeys.artifacts(source),
    queryFn: () => client.getArtifacts(),
  });
}
