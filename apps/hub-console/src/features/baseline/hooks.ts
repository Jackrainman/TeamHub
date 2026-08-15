import { useQuery } from '@tanstack/react-query';
import type { UpdateBaselineRequest } from '@teamhub/hub-contracts';
import { queryKeys } from '../../api/queryKeys';
import { useHubMutation } from '../../hooks/useHubMutation';
import type { BaselineSegment } from './api';

export function useBaseline(
  client: BaselineSegment,
  source: string,
  seasonId: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.baseline.season(source, seasonId ?? ''),
    queryFn: () => client.getBaseline(seasonId!),
    enabled: Boolean(seasonId),
  });
}

export function useUpdateBaseline(
  client: BaselineSegment,
  source: string,
  seasonId: string | undefined,
  onSuccess?: () => void,
) {
  return useHubMutation({
    invalidateKeys: seasonId ? [queryKeys.baseline.season(source, seasonId)] : [],
    mutationFn: (req: UpdateBaselineRequest) => client.updateBaseline(seasonId!, req),
    onSuccess,
  });
}
