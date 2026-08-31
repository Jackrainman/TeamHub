import { useQuery } from '@tanstack/react-query';
import type { HubApiClient } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import type { KbSimilarParams } from './api';

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
