import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { IdentityMode, SessionIdentity } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { useHubMutation } from '../../hooks/useHubMutation';

/**
 * 身份与名册域远端状态唯一消费点（§10；前身 hooks/useRoster.ts 的 members 半 +
 * IdentityBar/App.tsx 的会话与 bootstrap 裸 hook）。
 */

export function useMembers(client: Pick<HubApiClient, 'getMembers'>, tag = 'default') {
  return useQuery({
    queryKey: [...queryKeys.members(), tag],
    queryFn: () => client.getMembers(),
  });
}

/** App.tsx bootstrap：当前会话（匿名模式恒 {mode:'anonymous', session:null}）。 */
export function useSession(client: HubApiClient) {
  return useQuery({
    queryKey: queryKeys.session(),
    queryFn: () => client.getSession(),
  });
}

/** App.tsx 全屏初始化门：identity 模式且无项目管理旗标成员 → BootstrapGate。 */
export function useBootstrapGateMembers(client: HubApiClient, enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.members(), 'bootstrap-gate'],
    queryFn: () => client.getMembers(),
    enabled,
  });
}

/** IdentityBar 成员下拉（仅身份模式且展开时拉取）。 */
export function useIdentityBarMembers(client: HubApiClient, enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.members(), 'identity-bar'],
    queryFn: () => client.getMembers(),
    enabled,
  });
}

/** 登录/登出：成功后直接写 session 缓存并整树失效（原 IdentityBar.onIdentityChanged 语义）；组件侧善后走 onSuccess。 */
export function useSessionMutations(
  client: HubApiClient,
  opts?: { onLoggedIn?: (data: { mode: IdentityMode; session: SessionIdentity | null }) => void },
) {
  const queryClient = useQueryClient();
  const applyIdentity = (data: { mode: IdentityMode; session: SessionIdentity | null }) => {
    queryClient.setQueryData(['session'], data);
    void queryClient.invalidateQueries();
  };
  const loginMutation = useHubMutation({
    meta: { silent: true },
    invalidateKeys: [],
    mutationFn: (vars: { memberId: string; pin?: string }) =>
      client.login({ memberId: vars.memberId, pin: vars.pin }),
    onSuccess: (data) => {
      applyIdentity(data);
      opts?.onLoggedIn?.(data);
    },
  });
  const logoutMutation = useHubMutation({
    meta: { silent: true },
    invalidateKeys: [],
    mutationFn: () => client.logout(),
    onSuccess: (data) => applyIdentity(data),
  });
  return { loginMutation, logoutMutation };
}

export type MembersClient = Pick<HubApiClient, 'getMembers'>;
