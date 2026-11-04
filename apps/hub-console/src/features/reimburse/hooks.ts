import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReimburseSegment } from './api';
import { queryKeys } from '../../api/queryKeys';
import type {
  CreateReimburseEntryRequest,
  UpdateReimburseEntryRequest,
  CreateReimburseBatchRequest,
  UpdateReimburseBatchRequest,
  StockInRequest,
  UpdateReimburseProfileRequest,
  ReimburseEvidenceKind,
  ReimburseProfile,
} from '@teamhub/hub-contracts';
import { DEFAULT_REIMBURSE_PROFILE } from '@teamhub/hub-contracts';
import { useHubMutation } from '../../hooks/useHubMutation';
import {
  draftFromParsedInvoice,
  type ImportFailReason,
} from './reimburse-import';
import { analyzeReimbursePackage, type PackageDraft, type PackageAttachment } from './lib/package-import';
import { extractLocalOcr } from './lib/local-ocr';
import { saveReimbursePackage, type PackageSaveState } from './lib/package-save';
import { emptyEntryDraft, type EntryDraft } from './reimburse-utils';
import { uploadSupplement, type SupplementRow } from './lib/evidence-supplement';

/**
 * 报销域 hooks（REIMBURSE-PROC 阶段 3）。组件一律走本文件，不直接写 useQuery/useMutation。
 *
 * enabled 门：
 *  - entries：匿名模式可读（server 匿名回全量）；身份模式须登录（未登录 server 401）——
 *    由调用方传 `enabled`（照 ReimbursePage 身份门先例，未授权零网络请求）。
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

/**
 * 凭证清单（D-094）：只在卡片展开「凭证留档」时发请求（enabled 门=收起零网络），
 * key 带 entryId 故永不与列表缓存同桶。服务端已按读者链鉴权（他人条目 403）。
 */
export function useReimburseEvidence(
  client: ReimburseSegment,
  source: string,
  entryId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.reimburse.evidence(source, entryId),
    queryFn: () => client.getReimburseEvidence(entryId),
    enabled,
  });
}

export function useUploadReimburseEvidence(
  client: ReimburseSegment,
  source: string,
  entryId: string,
) {
  return useHubMutation({
    invalidateKeys: [queryKeys.reimburse.evidence(source, entryId), queryKeys.reimburse.entries(source), queryKeys.reimburse.batches(source)],
    mutationFn: (vars: { kind: ReimburseEvidenceKind; file: File }) =>
      client.uploadReimburseEvidence(entryId, vars.kind, vars.file),
  });
}

export function useDeleteReimburseEvidence(
  client: ReimburseSegment,
  source: string,
  entryId: string,
) {
  return useHubMutation({
    invalidateKeys: [queryKeys.reimburse.evidence(source, entryId), queryKeys.reimburse.entries(source), queryKeys.reimburse.batches(source)],
    mutationFn: (evidenceId: string) => client.deleteReimburseEvidence(entryId, evidenceId),
  });
}

export function useUploadReimburseSupplement(client: ReimburseSegment, source: string, entryIds: string[]) {
  return useHubMutation({
    invalidateKeys: [queryKeys.reimburse.entries(source), queryKeys.reimburse.batches(source),
      ...entryIds.map(id => queryKeys.reimburse.evidence(source, id))],
    mutationFn: (rows: SupplementRow[]) => uploadSupplement(client, rows, entryIds),
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

/** 一个顶层文件对应一个待确认项，保存进度随该项保留。 */
interface ImportJob {
  id: number;
  initial: ReimburseFormInitial;
}

export interface ReimburseImportFail {
  id: number;
  fileName: string;
  reason: ImportFailReason;
}

export interface ReimburseFormInitial {
  draft: EntryDraft;
  fileName: string;
  notice: 'recognized' | 'unrecognized';
  package?: PackageDraft;
  saveState?: PackageSaveState;
}

export function useSaveReimbursePackage(client: ReimburseSegment, source: string, onSuccess: () => void) {
  const cache = useQueryClient();
  return useHubMutation({
    invalidateKeys: [queryKeys.reimburse.entries(source)],
    mutationFn: (vars: { request: CreateReimburseEntryRequest; attachments: PackageAttachment[]; state: PackageSaveState }) =>
      saveReimbursePackage(client, vars.request, vars.attachments, vars.state),
    onSuccess,
    onSettled: (_data, _error, vars) => {
      void cache.invalidateQueries({ queryKey: queryKeys.reimburse.entries(source) });
      if (vars.state.entryId) void cache.invalidateQueries({ queryKey: queryKeys.reimburse.evidence(source, vars.state.entryId) });
    },
  });
}

/**
 * 浏览器本地导入 controller：统一管理顺序解析、失败通知、待确认队列和队首草稿。
 * 包内识别只在浏览器进行；用户确认保存后，原件再走 evidence 端点。
 */
export function useReimburseImportController(profile: ReimburseProfile = DEFAULT_REIMBURSE_PROFILE) {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [fails, setFails] = useState<ReimburseImportFail[]>([]);
  const [parsing, setParsing] = useState(false);
  const sequence = useRef(0);
  const parsingRef = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  useEffect(() => () => abort.current?.abort(), []);

  async function importFiles(files: File[], useOcr = false): Promise<void> {
    if (parsingRef.current) return;
    parsingRef.current = true;
    const controller = new AbortController();
    abort.current = controller;
    setProgress({ done: 0, total: files.length });
    setParsing(true);
    try {
      for (const file of files) {
        if (controller.signal.aborted) break;
        const outcome = await analyzeReimbursePackage(file, useOcr ? {
          extractOcrText: file => extractLocalOcr(file, { signal: controller.signal }),
        } : {}, profile);
        if (controller.signal.aborted) break;
        setProgress(current => ({ ...current, done: current.done + 1 }));
        sequence.current += 1;
        const id = sequence.current;
        if (outcome.kind === 'failed') {
          setFails((current) => [
            ...current,
            { id, fileName: outcome.fileName, reason: outcome.reason },
          ]);
        } else {
          const invoice = outcome.review.selectedInvoice;
          const draft = invoice ? draftFromParsedInvoice(invoice) : emptyEntryDraft();
          draft.invoiceType = outcome.review.invoiceType;
          if (draft.invoiceType === 'railway') draft.kind = 'expense';
          setJobs((current) => [...current, { id, initial: {
            draft, fileName: outcome.fileName, notice: invoice ? 'recognized' : 'unrecognized',
            package: outcome, saveState: { clientRequestId: crypto.randomUUID() },
          } }]);
        }
      }
    } finally {
      parsingRef.current = false;
      setParsing(false);
    }
  }

  const currentJob = jobs[0] ?? null;
  const formInitial = currentJob?.initial ?? null;

  return {
    currentJobId: currentJob?.id ?? null,
    formInitial,
    fails,
    parsing,
    progress,
    cancel: () => abort.current?.abort(),
    pendingCount: Math.max(0, jobs.length - 1),
    importFiles,
    // 关闭后重开时，旧保存回调可能晚到；只移除它对应的条目，不能跳过下一包。
    advance: () => setJobs((current) => current.filter(job => job.id !== currentJob?.id)),
    dismissFail: (id: number) =>
      setFails((current) => current.filter((failure) => failure.id !== id)),
  };
}
