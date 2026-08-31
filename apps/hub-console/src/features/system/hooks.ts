import { useQuery } from '@tanstack/react-query';
import type { HubApiClient } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';

/**
 * system 域远端状态唯一消费点（§10；前身 App.tsx bootstrap 裸 query + settings/sub/useSettingsQueries
 * 的 systemStatus 半）。
 */

/** App.tsx 启动门：初始化向导状态（SETUP-WIZARD）。 */
export function useSetupState(client: HubApiClient) {
  return useQuery({
    queryKey: queryKeys.setupState(),
    queryFn: () => client.getSetupState(),
    retry: 1,
  });
}

/** App.tsx 总览聚合（9 端点并发，console 侧聚合）。cacheKey 按会话身份分缓存。 */
export function useOverview(client: HubApiClient, source: string, cacheKey: string) {
  return useQuery({
    queryKey: queryKeys.hubOverview(source, cacheKey),
    queryFn: () => client.getOverview(),
  });
}

/** 设置页系统状态卡。 */
export function useSystemStatus(client: HubApiClient, source: string) {
  return useQuery({
    queryKey: queryKeys.systemStatus(source),
    queryFn: () => client.getSystemStatus(),
  });
}
