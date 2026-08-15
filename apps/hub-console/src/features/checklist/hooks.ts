import { useQuery } from '@tanstack/react-query';
import type {
  ClearChecklistItemRequest,
  CreateChecklistItemRequest,
  WaiveChecklistItemRequest,
} from '@teamhub/hub-contracts';
import { queryKeys } from '../../api/queryKeys';
import { useHubMutation } from '../../hooks/useHubMutation';
import type { ChecklistSegment } from './api';

export function useChecklist(
  client: ChecklistSegment,
  source: string,
  seasonId: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.checklist.season(source, seasonId ?? ''),
    queryFn: () => client.getChecklist(seasonId!),
    enabled: Boolean(seasonId),
  });
}

export function useCreateChecklistItem(
  client: ChecklistSegment,
  source: string,
  seasonId: string | undefined,
  options?: { onSuccess?: () => void; silent?: boolean },
) {
  return useHubMutation({
    invalidateKeys: seasonId ? [queryKeys.checklist.season(source, seasonId)] : [],
    mutationFn: (req: CreateChecklistItemRequest) =>
      client.createChecklistItem(seasonId!, req),
    meta: options?.silent ? { silent: true } : undefined,
    onSuccess: options?.onSuccess,
  });
}

export function useClearChecklistItem(
  client: ChecklistSegment,
  source: string,
  seasonId: string,
  onSuccess?: () => void,
) {
  return useHubMutation({
    meta: { silent: true },
    invalidateKeys: [queryKeys.checklist.season(source, seasonId)],
    mutationFn: (vars: { id: string; req: ClearChecklistItemRequest }) =>
      client.clearChecklistItem(vars.id, seasonId, vars.req),
    onSuccess,
  });
}

export function useWaiveChecklistItem(
  client: ChecklistSegment,
  source: string,
  seasonId: string,
  onSuccess?: () => void,
) {
  return useHubMutation({
    meta: { silent: true },
    invalidateKeys: [queryKeys.checklist.season(source, seasonId)],
    mutationFn: (vars: { id: string; req: WaiveChecklistItemRequest }) =>
      client.waiveChecklistItem(vars.id, seasonId, vars.req),
    onSuccess,
  });
}
