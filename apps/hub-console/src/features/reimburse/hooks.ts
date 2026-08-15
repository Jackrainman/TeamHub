import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ReimburseSegment } from './api';
import { queryKeys } from '../../api/queryKeys';
import type {
  CreateReimburseEntryRequest,
  UpdateReimburseEntryRequest,
  CreateReimburseBatchRequest,
  UpdateReimburseBatchRequest,
  StockInRequest,
  UpdateReimburseProfileRequest,
} from '@teamhub/hub-contracts';
import { useHubMutation } from '../../hooks/useHubMutation';
import {
  analyzeInvoiceFile,
  draftFromParsedInvoice,
  type ImportOutcome,
} from './reimburse-import';
import { emptyEntryDraft, type EntryDraft } from './reimburse-utils';

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
  client: ReimburseSegment,
  source: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.reimburse.entries(source),
    queryFn: () => client.getReimburseEntries(),
    enabled,
  });
}

export function useReimburseBatches(
  client: ReimburseSegment,
  source: string,
  isSuperAdmin: boolean,
) {
  return useQuery({
    queryKey: queryKeys.reimburse.batches(source),
    queryFn: () => client.getReimburseBatches(),
    enabled: isSuperAdmin,
  });
}

export function useReimburseProfile(client: ReimburseSegment, source: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.reimburse.profile(source),
    queryFn: () => client.getReimburseProfile(),
    enabled,
  });
}

export function useUpdateReimburseProfile(client: ReimburseSegment, source: string) {
  return useHubMutation({
    invalidateKeys: [
      queryKeys.reimburse.profile(source),
      queryKeys.reimburse.batches(source),
    ],
    mutationFn: (req: UpdateReimburseProfileRequest) => client.updateReimburseProfile(req),
  });
}

export function useReimburseStockInContext(
  client: ReimburseSegment,
  source: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.reimburse.stockInContext(source),
    queryFn: () => client.getReimburseStockInContext(),
    enabled,
  });
}

export function useCreateReimburseEntry(
  client: ReimburseSegment,
  source: string,
  opts?: { onSuccess?: () => void; onError?: (err: Error) => void },
) {
  return useHubMutation({
    invalidateKeys: [queryKeys.reimburse.entries(source)],
    mutationFn: (req: CreateReimburseEntryRequest) => client.createReimburseEntry(req),
    onSuccess: () => opts?.onSuccess?.(),
    onError: opts?.onError,
  });
}

export function useUpdateReimburseEntry(client: ReimburseSegment, source: string) {
  return useHubMutation({
    invalidateKeys: [
      queryKeys.reimburse.entries(source),
      queryKeys.reimburse.batches(source), // 装批/移出影响批次聚合
    ],
    mutationFn: (vars: { id: string; patch: UpdateReimburseEntryRequest }) =>
      client.updateReimburseEntry(vars.id, vars.patch),
  });
}

/**
 * 入库确认（阶段 5）：落账改的是库存动作日志（restock + reimburseEntryId），
 * 故同时失效 reimburse entries 与本域窄入库上下文。错误交全局
 * MutationCache.onError toast 兜底。
 */
export function useStockInEntry(
  client: ReimburseSegment,
  source: string,
  opts?: { onSuccess?: () => void },
) {
  return useHubMutation({
    invalidateKeys: [
      queryKeys.reimburse.entries(source),
      queryKeys.reimburse.stockInContext(source),
    ],
    mutationFn: (vars: { id: string; req: StockInRequest }) =>
      client.stockInEntry(vars.id, vars.req),
    onSuccess: () => opts?.onSuccess?.(),
  });
}

export function useCreateReimburseBatch(
  client: ReimburseSegment,
  source: string,
  opts?: { onSuccess?: () => void; onError?: (err: Error) => void },
) {
  return useHubMutation({
    invalidateKeys: [queryKeys.reimburse.batches(source)],
    mutationFn: (req: CreateReimburseBatchRequest) => client.createReimburseBatch(req),
    onSuccess: () => opts?.onSuccess?.(),
    onError: opts?.onError,
  });
}

export function useUpdateReimburseBatch(client: ReimburseSegment, source: string) {
  return useHubMutation({
    invalidateKeys: [queryKeys.reimburse.batches(source)],
    mutationFn: (vars: { id: string; patch: UpdateReimburseBatchRequest }) =>
      client.updateReimburseBatch(vars.id, vars.patch),
  });
}

/** 待确认的导入队列项（parsed=预填 / unrecognized=开空表单手填）。 */
interface ImportJob {
  id: number;
  outcome: ImportOutcome & { kind: 'parsed' | 'unrecognized' };
}

export interface ReimburseImportFail {
  id: number;
  fileName: string;
  reason: 'type' | 'read';
}

export interface ReimburseFormInitial {
  draft: EntryDraft;
  fileName: string;
  notice: 'recognized' | 'unrecognized';
}

/**
 * 浏览器本地导入 controller：统一管理顺序解析、失败通知、待确认队列和队首草稿。
 * 文件只交给 analyzeInvoiceFile 在浏览器内读取，永不上传。
 */
export function useReimburseImportController() {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [fails, setFails] = useState<ReimburseImportFail[]>([]);
  const [parsing, setParsing] = useState(false);
  const sequence = useRef(0);

  async function importFiles(files: File[]): Promise<void> {
    setParsing(true);
    try {
      for (const file of files) {
        const outcome = await analyzeInvoiceFile(file);
        sequence.current += 1;
        const id = sequence.current;
        if (outcome.kind === 'failed') {
          setFails((current) => [
            ...current,
            { id, fileName: outcome.fileName, reason: outcome.reason },
          ]);
        } else {
          setJobs((current) => [...current, { id, outcome }]);
        }
      }
    } finally {
      setParsing(false);
    }
  }

  const currentJob = jobs[0] ?? null;
  const formInitial: ReimburseFormInitial | null = currentJob
    ? currentJob.outcome.kind === 'parsed'
      ? {
          draft: draftFromParsedInvoice(currentJob.outcome.invoice),
          fileName: currentJob.outcome.fileName,
          notice: 'recognized',
        }
      : {
          draft: emptyEntryDraft(),
          fileName: currentJob.outcome.fileName,
          notice: 'unrecognized',
        }
    : null;

  return {
    currentJobId: currentJob?.id ?? null,
    formInitial,
    fails,
    parsing,
    pendingCount: Math.max(0, jobs.length - 1),
    importFiles,
    advance: () => setJobs((current) => current.slice(1)),
    dismissFail: (id: number) =>
      setFails((current) => current.filter((failure) => failure.id !== id)),
  };
}
