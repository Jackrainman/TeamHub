import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatePartActionRequest, CreatePartTypeRequest } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';

/**
 * 库存域远端状态唯一消费点（§10：页面/组件不得裸 useQuery/useMutation）。
 * 写 hook 成功后统一失效本域查询（queryKeys.inventory(source)），页面不再手工 invalidate。
 */
export function useInventory(client: HubApiClient, source: string) {
  return useQuery({
    queryKey: queryKeys.inventory(source),
    queryFn: () => client.getInventory(),
  });
}

/** 盘点建底 / 补料 / 调阈值（CreatePartTypeForm）。表单逐字段错误 → meta.silent，不走全局 toast。 */
export function useUpsertPartType(client: HubApiClient, source: string, onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (req: CreatePartTypeRequest) => client.upsertPartType(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.inventory(source) });
      onSuccess?.();
    },
  });
}

/** 一句话快记 / 拆装 / 预留（InvQuickRecordForm）。 */
export function useRecordPartAction(client: HubApiClient, source: string, onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: CreatePartActionRequest) => client.recordPartAction(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.inventory(source) });
      onSuccess?.();
    },
  });
}
