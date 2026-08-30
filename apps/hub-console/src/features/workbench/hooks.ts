import { useQuery } from '@tanstack/react-query';
import type { SessionIdentity } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { identityCacheKey } from '../../shared/lib/identity-utils';

/**
 * 首页工作台远程状态 hooks（软件架构门禁：组件不直接写 useQuery，收进本域 hooks.ts）。
 * 与 MyViewPage 同 queryKey 形状（['dep-graph', source, identityCacheKey]），同仓缓存复用。
 */
export function useWorkbenchDepGraph(
  client: HubApiClient,
  source: string,
  session: SessionIdentity | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['dep-graph', source, identityCacheKey(session)],
    queryFn: () => client.getDepGraph(),
    enabled,
  });
}
