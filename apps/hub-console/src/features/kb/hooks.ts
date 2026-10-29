import { useQuery } from '@tanstack/react-query';
import type { HubApiClient } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import type { KbSimilarParams } from './api';
import type { KbCloseoutRequest } from '@teamhub/hub-contracts';
import { useHubMutation } from '../../hooks/useHubMutation';

export function useKbCloseout(client: HubApiClient, source: string, onSuccess: () => void) {
  return useHubMutation({
    invalidateKeys: [queryKeys.allKbSimilar(source)],
    mutationFn: (request: KbCloseoutRequest) => client.closeoutKb(request),
    onSuccess,
  });
}

/**
 * 知识库域远端状态唯一消费点（§10）。写侧（结案/导入）走平台 useHubMutation。
 * 相似检索是「提交后才查」的按需查询：enabled 由调用侧按 submitted 状态给。
 */
export function useKbSimilar(client: HubApiClient, source: string, submitted: KbSimilarParams | null) {
  return useQuery({
    queryKey: queryKeys.kbSimilar(
      source,
      submitted?.symptom ?? '',
      (submitted?.tags ?? []).join(','),
    ),
    queryFn: () =>
      client.getKbSimilar({
        symptom: submitted?.symptom ?? '',
        tags: submitted?.tags ?? [],
      }),
    enabled: submitted != null && submitted.symptom.length > 0,
  });
}
