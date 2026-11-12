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
  ReimburseEntry,
  ReimburseEntryAction,
  ReimburseEntryActionRequest,
  CreateReimbursePayoutRequest,
  ReimburseSummaryQuery,
  ReimburseExportRequest,
} from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { DEFAULT_REIMBURSE_PROFILE, derivePackageReview, kindForExpenseType, suggestPackageExpenseType } from '@teamhub/hub-contracts';
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
import { draftsFromReimburseXlsx } from './lib/xlsx-import';

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
  seasonId = 'all',
) {
  return useQuery({
    queryKey: queryKeys.reimburse.entries(source, seasonId),
    queryFn: () => client.getReimburseEntries(),
    enabled,
  });
}

export function useReimburseSeasons(client: Pick<HubApiClient, 'getSeasons'>, source: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.seasons(source),
    queryFn: () => client.getSeasons(),
    enabled,
  });
}

export function useReimbursePayouts(client: ReimburseSegment, source: string, enabled: boolean) {
  return useQuery({ queryKey: queryKeys.reimburse.payouts(source), queryFn: () => client.getReimbursePayouts(), enabled });
}

export function useReimburseSummary(client: ReimburseSegment, source: string, query: ReimburseSummaryQuery, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.reimburse.summary(source, query.seasonId ?? 'all', query.batchId ?? 'all', query.expenseType ?? 'all'),
    queryFn: () => client.getReimburseSummary(query), enabled,
  });
}

export function useReimburseEntryAction(client: ReimburseSegment, source: string) {
  return useHubMutation({
    invalidateKeys: [queryKeys.reimburse.all(source)],
    mutationFn: (vars: { id: string; action: ReimburseEntryAction; request: ReimburseEntryActionRequest }) =>
      client.reimburseEntryAction(vars.id, vars.action, vars.request),
  });
}

export function useCreateReimbursePayout(client: ReimburseSegment, source: string) {
  return useHubMutation({
    invalidateKeys: [queryKeys.reimburse.all(source)],
    mutationFn: (req: CreateReimbursePayoutRequest) => client.createReimbursePayout(req),
  });
}

export function useExportReimburse(client: ReimburseSegment, source: string) {
  return useHubMutation({
    invalidateKeys: [queryKeys.reimburse.all(source)],
    mutationFn: (req: ReimburseExportRequest) => client.exportReimburse(req),
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
    mutationFn: (vars: { kind: ReimburseEvidenceKind; file: File; expectedRevision: number }) =>
      client.uploadReimburseEvidence(entryId, vars.kind, vars.file, vars.expectedRevision),
  });
}

export function useDeleteReimburseEvidence(
  client: ReimburseSegment,
  source: string,
  entryId: string,
) {
  return useHubMutation({
    invalidateKeys: [queryKeys.reimburse.evidence(source, entryId), queryKeys.reimburse.entries(source), queryKeys.reimburse.batches(source)],
    mutationFn: (vars: { evidenceId: string; expectedRevision: number }) =>
      client.deleteReimburseEvidence(entryId, vars.evidenceId, vars.expectedRevision),
  });
}

export function useUpdateReimburseEvidenceKind(client: ReimburseSegment, source: string, entryId: string) {
  return useHubMutation({
    invalidateKeys: [queryKeys.reimburse.evidence(source, entryId), queryKeys.reimburse.all(source)],
    mutationFn: (vars: { evidenceId: string; kind: ReimburseEvidenceKind; expectedRevision: number }) =>
      client.updateReimburseEvidenceKind(entryId, vars.evidenceId, { kind: vars.kind, expectedRevision: vars.expectedRevision }),
  });
}

export function useUploadReimburseSupplement(client: ReimburseSegment, source: string, entries: ReimburseEntry[]) {
  const entryIds = entries.map((entry) => entry.id);
  return useHubMutation({
    invalidateKeys: [queryKeys.reimburse.entries(source), queryKeys.reimburse.batches(source),
      ...entryIds.map(id => queryKeys.reimburse.evidence(source, id))],
    mutationFn: (rows: SupplementRow[]) => uploadSupplement(client, rows, entries),
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

/** 一个候选对应一笔实际支付；附件可在候选间拆合，未确认前不写服务器。 */
export interface ImportJob {
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

  function jobFromDraft(draft: EntryDraft, fileName: string, pack?: PackageDraft): ImportJob {
    sequence.current += 1;
    const suggestion = pack ? suggestPackageExpenseType(pack.review) : null;
    if (suggestion) {
      draft.expenseType = suggestion.expenseType;
      draft.kind = kindForExpenseType(suggestion.expenseType);
    }
    return { id: sequence.current, initial: {
      draft, fileName, notice: pack?.review.selectedInvoice ? 'recognized' : 'unrecognized',
      package: pack, saveState: { clientRequestId: crypto.randomUUID() },
    } };
  }

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
        if (/\.xlsx$/i.test(file.name)) {
          try {
            const drafts = await draftsFromReimburseXlsx(file);
            for (const [index, draft] of drafts.entries()) {
              const pack: PackageDraft = { kind: 'draft', fileName: `${file.name}#${index + 2}`, attachments: [], notices: [], review: derivePackageReview([], profile) };
              const job = jobFromDraft(draft, pack.fileName, pack);
              setJobs((current) => [...current, job]);
            }
            if (drafts.length === 0) throw new Error('empty');
          } catch {
            sequence.current += 1;
            setFails((current) => [...current, { id: sequence.current, fileName: file.name, reason: 'read' }]);
          }
        } else {
          const outcome = await analyzeReimbursePackage(file, useOcr ? {
            extractOcrText: file => extractLocalOcr(file, { signal: controller.signal }),
          } : {}, profile);
          if (controller.signal.aborted) break;
          if (outcome.kind === 'failed') {
            sequence.current += 1;
            setFails((current) => [...current, { id: sequence.current, fileName: outcome.fileName, reason: outcome.reason }]);
          } else {
            const invoice = outcome.review.selectedInvoice;
            const draft = invoice ? draftFromParsedInvoice(invoice) : emptyEntryDraft();
            draft.invoiceType = outcome.review.invoiceType;
            const job = jobFromDraft(draft, outcome.fileName, outcome);
            setJobs((current) => [...current, job]);
          }
        }
        setProgress(current => ({ ...current, done: current.done + 1 }));
      }
    } finally {
      parsingRef.current = false;
      setParsing(false);
    }
  }

  function splitAttachment(jobId: number, path: string): void {
    const source = jobs.find((job) => job.id === jobId);
    const attachment = source?.initial.package?.attachments.find((item) => item.path === path);
    if (!source?.initial.package || !attachment) return;
    source.initial.package.attachments = source.initial.package.attachments.filter((item) => item.path !== path);
    source.initial.package.review = derivePackageReview(source.initial.package.attachments, profile);
    const pack: PackageDraft = { kind: 'draft', fileName: attachment.path, attachments: [attachment], notices: [], review: derivePackageReview([attachment], profile) };
    const draft = attachment.invoice ? draftFromParsedInvoice(attachment.invoice) : emptyEntryDraft();
    draft.invoiceType = pack.review.invoiceType;
    const job = jobFromDraft(draft, attachment.path, pack);
    setJobs((current) => [...current, job]);
  }

  function moveAttachment(jobId: number, path: string, targetId: number): void {
    if (jobId === targetId) return;
    const source = jobs.find((job) => job.id === jobId);
    const target = jobs.find((job) => job.id === targetId);
    const attachment = source?.initial.package?.attachments.find((item) => item.path === path);
    if (!source?.initial.package || !target?.initial.package || !attachment) return;
    source.initial.package.attachments = source.initial.package.attachments.filter((item) => item.path !== path);
    target.initial.package.attachments = [...target.initial.package.attachments, attachment];
    source.initial.package.review = derivePackageReview(source.initial.package.attachments, profile);
    target.initial.package.review = derivePackageReview(target.initial.package.attachments, profile);
    setJobs((current) => [...current]);
  }

  const currentJob = jobs[0] ?? null;
  return {
    currentJobId: currentJob?.id ?? null,
    formInitial: currentJob?.initial ?? null,
    jobs: jobs.map((job) => ({
      id: job.id, fileName: job.initial.fileName,
      attachmentCount: job.initial.package?.attachments.filter((item) => item.included).length ?? 0,
      unmatched: !job.initial.package?.review.selectedInvoice || job.initial.package.review.reviewReasons.some((reason) => reason === 'multiple-invoices' || reason === 'ambiguous-invoices' || reason === 'unclassified-material'),
    })),
    fails, parsing, progress,
    cancel: () => abort.current?.abort(),
    pendingCount: Math.max(0, jobs.length - 1),
    importFiles, splitAttachment, moveAttachment,
    defer: () => setJobs((current) => current.length > 1 ? [...current.slice(1), current[0]] : current),
    openJob: (id: number) => setJobs((current) => {
      const target = current.find((job) => job.id === id);
      return target ? [target, ...current.filter((job) => job.id !== id)] : current;
    }),
    advance: () => setJobs((current) => current.filter(job => job.id !== currentJob?.id)),
    dismissFail: (id: number) => setFails((current) => current.filter((failure) => failure.id !== id)),
  };
}
