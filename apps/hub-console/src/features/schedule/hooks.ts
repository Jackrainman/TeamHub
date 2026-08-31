import { useQuery } from '@tanstack/react-query';

/**
 * 排班域远端状态唯一消费点（§10；前身 hooks/useSchedule.ts）。写侧走平台 useHubMutation
 * （relay-canvas/useRelayMutations）。I0：本域所有读模型均无 memberId 维度。
 */
import type { HubApiClient } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';

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

/** SchedulePage 顶部：某窗口的差异化在场建议（GET /api/schedule）。 */
export function useSchedulePresence(client: HubApiClient, source: string, windowLabel: string) {
  return useQuery({
    queryKey: queryKeys.schedule(source, windowLabel),
    queryFn: () => client.getSchedule(windowLabel),
  });
}
