import type {
  CreateResourceRequest,
  DefaultPreset,
  UpdateResourceStatusRequest,
} from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { useHubMutation } from '../../hooks/useHubMutation';

/**
 * 资源（车）域写侧远端状态唯一消费点（§10；前身 resources/sub/CreateResourceForm.tsx +
 * ResourceRow.tsx 的 3 处裸 useMutation）。读侧 useResources 在 features/schedule/hooks.ts。
 */

/** 建车（CreateResourceForm）：成功后 reset 表单 + 通知父级。 */
export function useCreateResource(client: HubApiClient, onCreated: () => void) {
  return useHubMutation({
    meta: { silent: true },
    invalidateKeys: [queryKeys.resources()],
    mutationFn: (req: CreateResourceRequest) => client.createResource(req),
    onSuccess: () => onCreated(),
  });
}

/** 改车状态（ResourceRow）：成功后由调用方清理由文本 + 通知父级。 */
export function useUpdateResourceStatus(client: HubApiClient, resourceId: string, onUpdated: () => void) {
  return useHubMutation({
    meta: { silent: true },
    invalidateKeys: [queryKeys.resources()],
    mutationFn: (patch: UpdateResourceStatusRequest) =>
      client.updateResourceStatus(resourceId, patch),
    onSuccess: () => onUpdated(),
  });
}

/** 默认阵型写回/清除（ResourceRow 预设编辑器）。 */
export function useUpdateResourcePreset(client: HubApiClient, resourceId: string, onUpdated: () => void) {
  return useHubMutation({
    meta: { silent: true },
    invalidateKeys: [queryKeys.resources()],
    mutationFn: (defaultPreset: DefaultPreset | null) =>
      client.updateResourceDefaultPreset(resourceId, { defaultPreset }),
    onSuccess: () => onUpdated(),
  });
}
