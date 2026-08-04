import { useQuery } from '@tanstack/react-query';
import type { HubApiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import type {
  CreateReimburseEntryRequest,
  UpdateReimburseEntryRequest,
  CreateReimburseBatchRequest,
  UpdateReimburseBatchRequest,
  StockInRequest,
} from '../api/schemas/reimburse';
import { useHubMutation } from './useHubMutation';

/**
 * 报账域 hooks（REIMBURSE-PROC 阶段 3）。组件一律走本文件，不直接写 useQuery/useMutation。
 *
 * enabled 门：
 *  - entries：匿名模式可读（server 匿名回全量）；身份模式须登录（未登录 server 401）——
 *    由调用方传 `enabled`（照 MyViewPage 身份门先例，未授权零网络请求）。
 *  - batches：三端点超管限定，仅 `isSuperAdmin` 时启用（同 sectionPermission 的
 *    session.projectManager===true 判定点）。
 *
 * mutation 错误一律交给全局 MutationCache.onError toast 兜底（不标 meta.silent——
 * 本域无内联 isError 渲染场景；创建表单内联错误条走 onError 参数自带处理）。
 */
export function useReimburseEntries(
  client: HubApiClient,
  source: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.reimburseEntries(source),
    queryFn: () => client.getReimburseEntries(),
    enabled,
  });
}

export function useReimburseBatches(
  client: HubApiClient,
  source: string,
  isSuperAdmin: boolean,
) {
  return useQuery({
    queryKey: queryKeys.reimburseBatches(source),
    queryFn: () => client.getReimburseBatches(),
    enabled: isSuperAdmin,
  });
}

export function useCreateReimburseEntry(
  client: HubApiClient,
  source: string,
  opts?: { onSuccess?: () => void; onError?: (err: Error) => void },
) {
  return useHubMutation({
    invalidateKeys: [queryKeys.reimburseEntries(source)],
    mutationFn: (req: CreateReimburseEntryRequest) => client.createReimburseEntry(req),
    onSuccess: () => opts?.onSuccess?.(),
    onError: opts?.onError,
  });
}

export function useUpdateReimburseEntry(client: HubApiClient, source: string) {
  return useHubMutation({
    invalidateKeys: [
      queryKeys.reimburseEntries(source),
      queryKeys.reimburseBatches(source), // 装批/移出影响批次聚合
    ],
    mutationFn: (vars: { id: string; patch: UpdateReimburseEntryRequest }) =>
      client.updateReimburseEntry(vars.id, vars.patch),
  });
}

/**
 * 入库确认（阶段 5）：落账改的是库存动作日志（restock + reimburseEntryId），
 * 故同时失效 reimburse entries（条目无变化但保持同域一致）与 inventory（剩余可入量/来源构成
 * 都从 actions 派生）。错误交全局 MutationCache.onError toast 兜底。
 */
export function useStockInEntry(
  client: HubApiClient,
  source: string,
  opts?: { onSuccess?: () => void },
) {
  return useHubMutation({
    invalidateKeys: [queryKeys.reimburseEntries(source), queryKeys.inventory(source)],
    mutationFn: (vars: { id: string; req: StockInRequest }) =>
      client.stockInEntry(vars.id, vars.req),
    onSuccess: () => opts?.onSuccess?.(),
  });
}

export function useCreateReimburseBatch(
  client: HubApiClient,
  source: string,
  opts?: { onSuccess?: () => void; onError?: (err: Error) => void },
) {
  return useHubMutation({
    invalidateKeys: [queryKeys.reimburseBatches(source)],
    mutationFn: (req: CreateReimburseBatchRequest) => client.createReimburseBatch(req),
    onSuccess: () => opts?.onSuccess?.(),
    onError: opts?.onError,
  });
}

export function useUpdateReimburseBatch(client: HubApiClient, source: string) {
  return useHubMutation({
    invalidateKeys: [queryKeys.reimburseBatches(source)],
    mutationFn: (vars: { id: string; patch: UpdateReimburseBatchRequest }) =>
      client.updateReimburseBatch(vars.id, vars.patch),
  });
}
