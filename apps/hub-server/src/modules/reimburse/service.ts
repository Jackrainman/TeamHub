import { createHash, randomUUID } from 'node:crypto';
import type { StoredReimburseEntry } from './repository.js';
import { buildReimburseDelivery } from './export-service.js';
import {
  REIMBURSE_EVIDENCE_MAX_PER_ENTRY,
  canTransitionReimburseWorkflow,
  deriveBatchSummary,
  deriveReimburseCompleteness,
  deriveReimburseStructuralSummary,
  evidenceContentType,
  evidenceExtOf,
  isEvidenceExtAllowed,
  kindForExpenseType,
  validateReimburseApproval,
  validateReimbursePayout,
  validateReimburseSubmission,
} from '@teamhub/hub-contracts';

import type {
  ActorRef,
  CreateReimbursePayoutRequest,
  ReimburseBatch,
  ReimburseEntry,
  ReimburseEntryAction,
  ReimburseEntryActionRequest,
  ReimburseEvidence,
  ReimburseEvidenceDownload,
  ReimburseEvidenceKind,
  ReimburseExportRequest,
  ReimburseHistoryAction,
  ReimburseHistoryEvent,
  ReimbursePayout,
  ReimburseProfile,
  ReimburseSummaryQuery,
  SessionIdentity,
  UpdateReimburseBatchRequest,
  UpdateReimburseEntryRequest,
} from '@teamhub/hub-contracts';
import { appError } from '../../application/application-error.js';
import type { ApplicationUnitOfWork } from '../../application/unit-of-work.js';
import type { ReimburseAdminPort } from './public.js';
import type {
  ReimburseBatchDraft,
  ReimburseEntryDraft,
  ReimburseEntryInput,
  ReimburseEvidenceStorage,
  ReimburseRepository,
  StoredReimbursePayout,
} from './repository.js';

const ACTION_HISTORY: Record<ReimburseEntryAction, ReimburseHistoryAction> = {
  submit: 'submitted', accept: 'accepted', check: 'checked', return: 'returned',
  approve: 'approved', revokeApproval: 'approvalRevoked', cancel: 'cancelled',
};


/** D-094「永不进列表」：条目对象出 HTTP 前把 evidence 剥成空数组，原件元数据只走凭证专属端点。 */
function withoutEvidence(entry: ReimburseEntry): ReimburseEntry {
  const { creationRequest: _request, ...publicEntry } = entry as StoredReimburseEntry;
  return { ...publicEntry, evidence: [] };
}

export interface ReimburseEvidenceDownloadResult {
  downloadName: string;
  contentType: string;
  content: Buffer;
}

export class ReimburseService {
  private readonly evidenceWrites = new Map<string, Promise<unknown>>();
  constructor(
    private readonly repository: ReimburseRepository,
    private readonly admin: ReimburseAdminPort,
    private readonly unitOfWork: ApplicationUnitOfWork,
    private readonly identityMode: 'anonymous' | 'identity',
    private readonly evidenceStorage: ReimburseEvidenceStorage,
  ) {}

  async listEntries(identity: SessionIdentity | null): Promise<ReimburseEntry[]> {
    const entries = this.repository.listEntries();
    if (this.identityMode !== 'identity') return entries.map(withoutEvidence);
    if (!identity) {
      throw appError('unauthorized', 'REIMBURSE_LOGIN_REQUIRED', '登录后查看报销条目');
    }
    const visible = (await this.isAdmin(identity.memberId))
      ? entries
      : entries.filter((entry) => entry.memberId === identity.memberId);
    return visible.map(withoutEvidence);
  }

  createEntry(input: ReimburseEntryInput): ReimburseEntry {
    const { clientRequestId, ...fields } = input;
    const expenseType = input.expenseType ?? null;
    const draft: ReimburseEntryDraft = {
      ...fields,
      kind: expenseType ? kindForExpenseType(expenseType) : input.kind,
      expenseType,
      summary: input.summary ?? input.actualItemName ?? null,
      invoiceType: input.invoiceType ?? 'unknown',
      invoiceNo: input.invoiceNo ?? null,
      invoiceDate: input.invoiceDate ?? null,
      seller: input.seller ?? null,
      purchaserName: input.purchaserName ?? null,
      purchaserTaxNo: input.purchaserTaxNo ?? null,
      actualItemName: input.actualItemName ?? null,
      note: input.note ?? null,
    };
    if (clientRequestId) {
      const fingerprint = createHash('sha256').update(JSON.stringify(draft)).digest('hex');
      const prior = (this.repository.listEntries() as StoredReimburseEntry[])
        .find(entry => entry.memberId === input.memberId && entry.creationRequest?.id === clientRequestId);
      if (prior) {
        if (prior.creationRequest?.fingerprint !== fingerprint) {
          throw appError('conflict', 'REIMBURSE_REQUEST_CONFLICT', '该保存请求已用于另一份内容，请刷新条目后重试');
        }
        return withoutEvidence(prior);
      }
      draft.creationRequest = { id: clientRequestId, fingerprint };
    }
    if (draft.invoiceNo) {
      const duplicate = this.repository.findEntryByInvoiceNo(draft.invoiceNo);
      if (duplicate) {
        throw appError('conflict', 'REIMBURSE_INVOICE_DUPLICATE',
          `发票号 ${draft.invoiceNo} 已录入过（条目 ${duplicate.id}），勿重复报销`);
      }
    }
    return withoutEvidence(this.repository.createEntry(draft));
  }

  async updateEntry(id: string, request: UpdateReimburseEntryRequest, actor: ActorRef): Promise<ReimburseEntry> {
    const admin = await this.isAdmin(actor.id);
    return this.unitOfWork.run(actor, ({ occurredAt }) => {
      const entry = this.requireEntry(id);
      this.assertRevision(entry, request.expectedRevision);
      const { expectedRevision: _revision, changeReason, ...patch } = request;
      const contentKeys = Object.keys(patch).filter((key) => key !== 'batchId');
      if (patch.batchId !== undefined && !admin) {
        throw appError('forbidden', 'REIMBURSE_BATCH_FORBIDDEN', '只有财务能调整批次归属');
      }
      if (patch.batchId !== undefined && (entry.workflowStatus === 'completed' || entry.workflowStatus === 'cancelled')) {
        throw appError('conflict', 'REIMBURSE_ENTRY_LOCKED', '完成或撤销条目不可调整批次');
      }
      if (contentKeys.length > 0) {
        if (entry.memberId !== actor.id && !admin) {
          throw appError('forbidden', 'REIMBURSE_ENTRY_FORBIDDEN', '只有条目本人或财务能修改条目');
        }
        const allowed = admin ? entry.workflowStatus === 'reviewing'
          : entry.memberId === actor.id && (entry.workflowStatus === 'draft' || entry.workflowStatus === 'returned');
        if (!allowed) throw appError('conflict', 'REIMBURSE_ENTRY_LOCKED', '当前工作流状态不允许修改条目');
      }
      if (patch.batchId) {
        const batch = this.repository.getBatch(patch.batchId);
        if (!batch) throw appError('validation', 'REIMBURSE_BATCH_NOT_FOUND', `未知批次: ${patch.batchId}`);
      }
      if (patch.expenseType !== undefined) patch.kind = patch.expenseType ? kindForExpenseType(patch.expenseType) : 'expense';
      else if (entry.expenseType) patch.kind = kindForExpenseType(entry.expenseType);
      if (patch.invoiceNo) {
        const duplicate = this.repository.findEntryByInvoiceNo(patch.invoiceNo);
        if (duplicate && duplicate.id !== id) throw appError('conflict', 'REIMBURSE_INVOICE_DUPLICATE', '该发票已录入，请勿重复报销');
      }

      const changedFields = Object.keys(patch).filter((key) => key !== 'batchId' &&
        JSON.stringify(patch[key as keyof typeof patch]) !== JSON.stringify(entry[key as keyof ReimburseEntry]));
      const batchChanged = patch.batchId !== undefined && patch.batchId !== entry.batchId;
      if (changedFields.length === 0 && !batchChanged) return withoutEvidence(entry);
      const revision = changedFields.length > 0 ? entry.revision + 1 : entry.revision;
      const action: ReimburseHistoryAction = changedFields.length > 0 ? 'edited' : 'batchChanged';
      const history = this.history(entry, action, actor.id, occurredAt.toISOString(), {
        revision, reason: changeReason ?? null, changedFields,
      });
      const contentReset = changedFields.length > 0 ? {
        revision, checkedRevision: null, reviewedRevision: null, recognitionConfirmedRevision: null,
      } : {};
      const cleanPatch = Object.fromEntries(Object.entries(patch).filter(([key]) => key !== 'batchId' || batchChanged));
      return withoutEvidence(this.repository.updateEntry(id, {
        ...cleanPatch, ...contentReset, history: [...entry.history, history],
      })!);
    });
  }

  async entryAction(
    id: string,
    action: ReimburseEntryAction,
    request: ReimburseEntryActionRequest,
    actor: ActorRef,
  ): Promise<ReimburseEntry> {
    const admin = await this.isAdmin(actor.id);
    return this.unitOfWork.run(actor, ({ occurredAt }) => {
      const entry = this.requireEntry(id);
      this.assertRevision(entry, request.expectedRevision);
      const ownerAction = action === 'submit' || action === 'cancel';
      if (ownerAction ? entry.memberId !== actor.id : !admin) {
        throw appError('forbidden', 'REIMBURSE_WORKFLOW_FORBIDDEN', '当前身份无权执行该报账动作');
      }
      let patch: Parameters<ReimburseRepository['updateEntry']>[1] = {};
      if (action === 'submit') {
        const invalid = validateReimburseSubmission(entry);
        if (invalid) throw appError('conflict', invalid, '提交前须确认支出类型，且条目须处于草稿或退回状态');
        patch = { workflowStatus: 'submitted', recognitionConfirmedRevision: entry.revision,
          checkedRevision: null, reviewedRevision: null, approvedAmountFen: null };
      } else if (action === 'cancel') {
        if (!canTransitionReimburseWorkflow(entry.workflowStatus, 'cancelled')) this.throwInvalidTransition(entry.workflowStatus, 'cancelled');
        patch = { workflowStatus: 'cancelled' };
      } else if (action === 'accept') {
        if (!canTransitionReimburseWorkflow(entry.workflowStatus, 'reviewing')) this.throwInvalidTransition(entry.workflowStatus, 'reviewing');
        patch = { workflowStatus: 'reviewing' };
      } else if (action === 'check') {
        if (entry.workflowStatus !== 'reviewing') this.throwInvalidTransition(entry.workflowStatus, 'reviewing');
        patch = { checkedRevision: entry.revision };
      } else if (action === 'return') {
        if (!canTransitionReimburseWorkflow(entry.workflowStatus, 'returned')) this.throwInvalidTransition(entry.workflowStatus, 'returned');
        if (!request.reason?.trim()) throw appError('validation', 'REIMBURSE_RETURN_REASON_REQUIRED', '退回必须填写具体原因');
        patch = { workflowStatus: 'returned', returnReason: request.reason,
          checkedRevision: null, reviewedRevision: null, approvedAmountFen: null };
      } else if (action === 'approve') {
        const amount = request.approvedAmountFen ?? null;
        const invalid = validateReimburseApproval({ ...entry, completeness: deriveReimburseCompleteness(entry) }, amount, request.reason ?? null);
        if (invalid) throw appError('validation', invalid, '核准须填写金额；有缺项或调整金额时必须填写处理意见');
        patch = { workflowStatus: 'pendingPayment', approvedAmountFen: amount,
          reviewedRevision: entry.revision, reviewNote: request.reason ?? null };
      } else {
        if (!canTransitionReimburseWorkflow(entry.workflowStatus, 'reviewing')) this.throwInvalidTransition(entry.workflowStatus, 'reviewing');
        if (!request.reason?.trim()) throw appError('validation', 'REIMBURSE_REVOKE_REASON_REQUIRED', '撤销核准必须说明理由');
        patch = { workflowStatus: 'reviewing', approvedAmountFen: null, reviewedRevision: null, reviewNote: request.reason };
      }
      const history = this.history(entry, ACTION_HISTORY[action], actor.id, occurredAt.toISOString(), {
        from: entry.workflowStatus,
        to: patch.workflowStatus ?? entry.workflowStatus,
        reason: request.reason ?? null,
      });
      return withoutEvidence(this.repository.updateEntry(id, { ...patch, history: [...entry.history, history] })!);
    });
  }

  async createPayout(request: CreateReimbursePayoutRequest, actor: ActorRef): Promise<ReimbursePayout> {
    if (!(await this.isAdmin(actor.id))) throw appError('forbidden', 'REIMBURSE_ADMIN_REQUIRED', '仅财务能登记打款');
    const { clientRequestId, ...facts } = request;
    const fingerprint = createHash('sha256').update(JSON.stringify(facts)).digest('hex');
    if (clientRequestId) {
      const prior = (this.repository.listPayouts() as StoredReimbursePayout[])
        .find((payout) => payout.creationRequest?.id === clientRequestId);
      if (prior) {
        if (prior.creationRequest?.fingerprint !== fingerprint) throw appError('conflict', 'REIMBURSE_REQUEST_CONFLICT', '该打款请求 ID 已用于另一笔打款');
        return this.withoutPayoutInternal(prior);
      }
    }
    return this.unitOfWork.run(actor, ({ occurredAt }) => {
      const ids = request.entries.map((entry) => entry.id);
      if (new Set(ids).size !== ids.length) throw appError('validation', 'REIMBURSE_PAYOUT_DUPLICATE_ENTRY', '同一打款不能重复选择条目');
      const entries = request.entries.map(({ id, expectedRevision }) => {
        const entry = this.requireEntry(id);
        this.assertRevision(entry, expectedRevision);
        return entry;
      });
      const recipientId = entries[0].memberId;
      const invalid = validateReimbursePayout(entries, recipientId, request.amountFen);
      if (invalid) throw appError('conflict', invalid, '打款条目须同属一人、已核准且总额一致');
      const payout = this.repository.createPayout({
        recipientId, entryIds: ids, amountFen: request.amountFen,
        paidAt: request.paidAt, method: request.method, transactionRef: request.transactionRef ?? null,
        note: request.note ?? null, recordedBy: actor.id,
        ...(clientRequestId ? { creationRequest: { id: clientRequestId, fingerprint } } : {}),
      });
      for (const entry of entries) {
        const history = this.history(entry, 'payoutRegistered', actor.id, occurredAt.toISOString(), {
          from: entry.workflowStatus, to: 'completed', reason: request.note ?? null,
        });
        this.repository.updateEntry(entry.id, { workflowStatus: 'completed', payoutId: payout.id, history: [...entry.history, history] });
      }
      return this.withoutPayoutInternal(payout);
    });
  }

  async listPayouts(identity: SessionIdentity | null): Promise<ReimbursePayout[]> {
    if (!identity) throw appError('unauthorized', 'REIMBURSE_LOGIN_REQUIRED', '登录后查看打款事实');
    const admin = await this.isAdmin(identity.memberId);
    return (this.repository.listPayouts() as StoredReimbursePayout[])
      .filter((payout) => admin || payout.recipientId === identity.memberId)
      .map((payout) => this.withoutPayoutInternal(payout));
  }

  async exportEntries(request: ReimburseExportRequest, identity: SessionIdentity | null, actor: ActorRef) {
    const visible = await this.listEntries(identity);
    const visibleIds = new Set(visible.map((entry) => entry.id));
    const entries = this.repository.listEntries().filter((entry) => visibleIds.has(entry.id) &&
      (!request.entryIds || request.entryIds.includes(entry.id)) &&
      (!request.batchId || entry.batchId === request.batchId) &&
      (!request.expenseType || entry.expenseType === request.expenseType));
    if (entries.length === 0) throw appError('validation', 'REIMBURSE_EXPORT_EMPTY', '授权范围内没有可导出条目');
    const entryIds = new Set(entries.map((entry) => entry.id));
    const payouts = (await this.listPayouts(identity)).filter((payout) => payout.entryIds.some((id) => entryIds.has(id)));
    const names = await this.admin.displayNames?.() ?? {};
    try {
      const result = await buildReimburseDelivery(entries, payouts, this.repository.listBatches(), request.includeEvidence,
        async (entryId, evidenceId) => (await this.downloadEvidence(entryId, evidenceId, actor)).content,
        (id) => names[id] ?? id);
      this.unitOfWork.run(actor, ({ occurredAt }) => {
        for (const current of entries) {
          const latest = this.requireEntry(current.id);
          const history = this.history(latest, 'exported', actor.id, occurredAt.toISOString());
          this.repository.updateEntry(latest.id, { history: [...latest.history, history] });
        }
      });
      return result;
    } catch (error) {
      if (error instanceof Error && error.message === 'REIMBURSE_EXPORT_TOO_LARGE') {
        throw appError('validation', 'REIMBURSE_EXPORT_TOO_LARGE', '交付包原件总量超过 200MB，请分批导出');
      }
      throw error;
    }
  }

  async getStructuralSummary(identity: SessionIdentity | null, query: ReimburseSummaryQuery) {
    const entries = (await this.listEntries(identity)).filter((entry) =>
      (!query.batchId || entry.batchId === query.batchId) &&
      (!query.expenseType || entry.expenseType === query.expenseType));
    const ids = new Set(entries.map((entry) => entry.id));
    const payouts = (await this.listPayouts(identity)).filter((payout) => payout.entryIds.some((id) => ids.has(id)));
    return deriveReimburseStructuralSummary(entries, payouts);
  }

  private withoutPayoutInternal(payout: ReimbursePayout): ReimbursePayout {
    const { creationRequest: _request, ...publicPayout } = payout as StoredReimbursePayout;
    return publicPayout;
  }

  getProfile(): ReimburseProfile {
    return this.repository.getProfile();
  }

  async updateProfile(profile: ReimburseProfile, identity: SessionIdentity | null): Promise<ReimburseProfile> {
    await this.requireAdmin(identity);
    return this.repository.updateProfile(profile);
  }

  async listBatches(identity: SessionIdentity | null) {
    await this.requireAdmin(identity);
    const batches = this.repository.listBatches();
    const entries = this.repository.listEntries();
    const profile = this.repository.getProfile();
    return {
      batches,
      summaries: batches.map((batch) => ({
        batchId: batch.id,
        ...deriveBatchSummary(entries, batch.id, profile),
      })),
      profile,
    };
  }

  async createBatch(draft: ReimburseBatchDraft, identity: SessionIdentity | null): Promise<ReimburseBatch> {
    await this.requireAdmin(identity);
    return this.repository.createBatch(draft);
  }

  async updateBatch(
    id: string,
    patch: UpdateReimburseBatchRequest,
    identity: SessionIdentity | null,
  ): Promise<ReimburseBatch> {
    await this.requireAdmin(identity);
    const batch = this.repository.getBatch(id);
    if (!batch) throw appError('not_found', 'REIMBURSE_BATCH_NOT_FOUND', `未知批次: ${id}`);
    // 批次只是归集容器；不再以 blocked 拒绝整批，也不提供无打款事实的 reimbursed 状态。
    if (patch.status && patch.status !== batch.status && !(batch.status === 'collecting' && patch.status === 'submitted')) {
      throw appError('conflict', 'REIMBURSE_BATCH_TRANSITION', '批次只允许从收集中推进为已提交');
    }
    return this.repository.updateBatch(id, patch)!;
  }


  /** 先完整写字节再发布元数据；同 hash 重试只验证/修复原字节，不增加版本。 */
  async uploadEvidence(
    entryId: string,
    kind: ReimburseEvidenceKind,
    upload: { filename?: string; buf: Buffer },
    actor: ActorRef,
    expectedRevision: number,
  ): Promise<{ evidence: ReimburseEvidence; entry: ReimburseEntry }> {
    const previous = this.evidenceWrites.get(entryId) ?? Promise.resolve();
    const writing = previous.catch(() => {}).then(() => this.uploadEvidenceOnce(entryId, kind, upload, actor, expectedRevision));
    this.evidenceWrites.set(entryId, writing);
    try { return await writing; }
    finally { if (this.evidenceWrites.get(entryId) === writing) this.evidenceWrites.delete(entryId); }
  }

  private async uploadEvidenceOnce(
    entryId: string, kind: ReimburseEvidenceKind,
    upload: { filename?: string; buf: Buffer }, actor: ActorRef, expectedRevision: number,
  ): Promise<{ evidence: ReimburseEvidence; entry: ReimburseEntry }> {
    const dir = this.evidenceStorage.dir();
    if (!dir) throw appError('validation', 'REIMBURSE_EVIDENCE_STORAGE_UNCONFIGURED', '未配置凭证留档目录');
    const entry = this.requireEntry(entryId);
    if (entry.memberId !== actor.id) throw appError('forbidden', 'REIMBURSE_EVIDENCE_FORBIDDEN', '只有条目本人能上传凭证');
    const ext = evidenceExtOf(upload.filename);
    if (!isEvidenceExtAllowed(ext)) throw appError('validation', 'REIMBURSE_EVIDENCE_UNSUPPORTED_EXT', `不支持的凭证类型：${ext || '（无后缀）'}`);
    const sha256 = this.evidenceStorage.sha256(upload.buf);
    const existing = entry.evidence.find(item => item.sha256 === sha256 && item.kind === kind);
    if (existing) {
      const file = await this.evidenceStorage.read(dir, existing.id);
      if (!file) await this.evidenceStorage.write(dir, existing.id, existing.ext, upload.buf);
      return { evidence: existing, entry: withoutEvidence(entry) };
    }
    this.assertRevision(entry, expectedRevision);
    if (entry.workflowStatus !== 'draft' && entry.workflowStatus !== 'returned') {
      throw appError('conflict', 'REIMBURSE_ENTRY_LOCKED', '只有草稿或退回条目可补传原件');
    }
    if (entry.evidence.length >= REIMBURSE_EVIDENCE_MAX_PER_ENTRY) {
      throw appError('validation', 'REIMBURSE_EVIDENCE_LIMIT', `单个条目最多留档 ${REIMBURSE_EVIDENCE_MAX_PER_ENTRY} 份凭证`);
    }
    const originalName = (upload.filename ?? '').split(/[\\/]/).pop()!.trim() || `evidence${ext}`;
    const at = new Date().toISOString();
    const evidence: ReimburseEvidence = {
      id: `revd-${randomUUID()}`, kind, originalName, ext, sizeBytes: upload.buf.length,
      sha256, uploadedBy: actor.id, uploadedAt: at,
    };
    await this.evidenceStorage.write(dir, evidence.id, ext, upload.buf);
    const revision = entry.revision + 1;
    const history = this.history(entry, 'evidenceAdded', actor.id, at, { revision, changedFields: [`evidence:${kind}`] });
    const materials = kind === 'paymentShot' ? { ...entry.materials, paymentShot: true }
      : kind === 'invoice' ? { ...entry.materials, invoice: true } : entry.materials;
    try {
      const updated = this.repository.appendEntryEvidence(entryId, evidence, {
        revision, materials, checkedRevision: null, reviewedRevision: null,
        recognitionConfirmedRevision: null, history: [...entry.history, history],
      });
      if (!updated) throw appError('not_found', 'REIMBURSE_ENTRY_NOT_FOUND', `未知报销条目: ${entryId}`);
      return { evidence, entry: withoutEvidence(updated) };
    } catch (error) {
      await this.evidenceStorage.remove(dir, evidence.id).catch(() => {});
      throw error;
    }
  }

  /** 凭证清单：条目级专属读端点（D-094「永不进列表」——原件元数据只从这里流出）。 */
  async listEvidence(entryId: string, actor: ActorRef): Promise<ReimburseEvidence[]> {
    const entry = this.requireEntry(entryId);
    await this.assertEvidenceReadable(entry, actor);
    return entry.evidence ?? [];
  }

  /** 凭证下载：本人或超管可读（D-094 读者链），每次下载留操作者痕迹。 */
  async downloadEvidence(
    entryId: string,
    evidenceId: string,
    actor: ActorRef,
  ): Promise<ReimburseEvidenceDownloadResult> {
    const dir = this.evidenceStorage.dir();
    if (!dir) {
      throw appError('not_found', 'REIMBURSE_EVIDENCE_STORAGE_UNCONFIGURED', '未配置凭证留档目录');
    }
    const entry = this.requireEntry(entryId);
    await this.assertEvidenceReadable(entry, actor);
    const evidence = (entry.evidence ?? []).find((item) => item.id === evidenceId);
    if (!evidence) {
      throw appError('not_found', 'REIMBURSE_EVIDENCE_NOT_FOUND', `未知凭证: ${evidenceId}`);
    }
    let file: { filename: string; ext: string; content: Buffer } | null;
    try {
      file = await this.evidenceStorage.read(dir, evidenceId);
    } catch {
      throw appError('validation', 'REIMBURSE_EVIDENCE_ILLEGAL_PATH', '非法路径');
    }
    if (!file) {
      throw appError('not_found', 'REIMBURSE_EVIDENCE_FILE_MISSING', '该凭证文件缺失（元数据在、字节不在）');
    }
    this.repository.appendEvidenceDownload({ entryId, evidenceId, actorId: actor.id });
    return {
      downloadName: evidence.originalName,
      contentType: evidenceContentType(evidence.ext),
      content: file.content,
    };
  }

  changeEvidenceKind(
    entryId: string, evidenceId: string, kind: ReimburseEvidenceKind,
    actor: ActorRef, expectedRevision: number,
  ): { evidence: ReimburseEvidence; entry: ReimburseEntry } {
    return this.unitOfWork.run(actor, ({ occurredAt }) => {
      const entry = this.requireEntry(entryId);
      if (entry.memberId !== actor.id) throw appError('forbidden', 'REIMBURSE_EVIDENCE_FORBIDDEN', '只有条目本人能修改原件用途');
      this.assertRevision(entry, expectedRevision);
      if (entry.workflowStatus !== 'draft' && entry.workflowStatus !== 'returned') throw appError('conflict', 'REIMBURSE_ENTRY_LOCKED', '当前状态不可修改原件用途');
      const target = entry.evidence.find((item) => item.id === evidenceId);
      if (!target) throw appError('not_found', 'REIMBURSE_EVIDENCE_NOT_FOUND', `未知凭证: ${evidenceId}`);
      if (target.kind === kind) return { evidence: target, entry: withoutEvidence(entry) };
      const evidence = entry.evidence.map((item) => item.id === evidenceId ? { ...item, kind } : item);
      const revision = entry.revision + 1;
      const history = this.history(entry, 'edited', actor.id, occurredAt.toISOString(), { revision, changedFields: ['evidence:kind'] });
      const updated = this.repository.updateEntry(entryId, {
        evidence, revision, checkedRevision: null, reviewedRevision: null, recognitionConfirmedRevision: null,
        materials: { ...entry.materials,
          invoice: evidence.some((item) => item.kind === 'invoice'),
          paymentShot: evidence.some((item) => item.kind === 'paymentShot') },
        history: [...entry.history, history],
      })!;
      return { evidence: { ...target, kind }, entry: withoutEvidence(updated) };
    });
  }

  /** 原件删除同样仅本人可在可编辑状态执行，并与版本/历史同事务落库。 */
  async deleteEvidence(
    entryId: string,
    evidenceId: string,
    actor: ActorRef,
    expectedRevision: number,
  ): Promise<ReimburseEvidence[]> {
    const previous = this.evidenceWrites.get(entryId) ?? Promise.resolve();
    const writing = previous.catch(() => {}).then(() => this.deleteEvidenceOnce(entryId, evidenceId, actor, expectedRevision));
    this.evidenceWrites.set(entryId, writing);
    try { return await writing; }
    finally { if (this.evidenceWrites.get(entryId) === writing) this.evidenceWrites.delete(entryId); }
  }

  private async deleteEvidenceOnce(entryId: string, evidenceId: string, actor: ActorRef, expectedRevision: number): Promise<ReimburseEvidence[]> {
    const entry = this.requireEntry(entryId);
    if (entry.memberId !== actor.id) throw appError('forbidden', 'REIMBURSE_EVIDENCE_FORBIDDEN', '只有条目本人能删除原件');
    this.assertRevision(entry, expectedRevision);
    if (entry.workflowStatus !== 'draft' && entry.workflowStatus !== 'returned') {
      throw appError('conflict', 'REIMBURSE_ENTRY_LOCKED', '只有草稿或退回条目可删除原件');
    }
    const target = entry.evidence.find((item) => item.id === evidenceId);
    if (!target) throw appError('not_found', 'REIMBURSE_EVIDENCE_NOT_FOUND', `未知凭证: ${evidenceId}`);
    const revision = entry.revision + 1;
    const at = new Date().toISOString();
    const history = this.history(entry, 'evidenceRemoved', actor.id, at, { revision, changedFields: [`evidence:${target.kind}`] });
    const evidence = entry.evidence.filter((item) => item.id !== evidenceId);
    const materials = target.kind === 'paymentShot' ? { ...entry.materials, paymentShot: evidence.some((item) => item.kind === 'paymentShot') }
      : target.kind === 'invoice' ? { ...entry.materials, invoice: evidence.some((item) => item.kind === 'invoice') } : entry.materials;
    const updated = this.repository.removeEntryEvidence(entryId, evidenceId, {
      revision, materials, checkedRevision: null, reviewedRevision: null,
      recognitionConfirmedRevision: null, history: [...entry.history, history],
    });
    if (!updated) throw appError('not_found', 'REIMBURSE_EVIDENCE_NOT_FOUND', `未知凭证: ${evidenceId}`);
    const dir = this.evidenceStorage.dir();
    if (dir) await this.evidenceStorage.remove(dir, evidenceId).catch(() => {});
    return updated.evidence;
  }

  /** 下载留痕查询：本人或超管（D-094 审计面，不进任何聚合）。 */
  async listEvidenceDownloads(entryId: string, actor: ActorRef): Promise<ReimburseEvidenceDownload[]> {
    const entry = this.requireEntry(entryId);
    await this.assertEvidenceReadable(entry, actor);
    return this.repository.listEvidenceDownloads(entryId);
  }

  /** D-094 读者链：条目本人或超管（「承担财务职责的成员」拍板沿用超管旗）。 */
  private async assertEvidenceReadable(entry: ReimburseEntry, actor: ActorRef): Promise<void> {
    if (entry.memberId !== actor.id && !(await this.isAdmin(actor.id))) {
      throw appError('forbidden', 'REIMBURSE_EVIDENCE_FORBIDDEN', '只有条目本人或管理员能读凭证');
    }
  }


  private assertRevision(entry: ReimburseEntry, expectedRevision: number): void {
    if (entry.revision !== expectedRevision) {
      throw appError('conflict', 'REIMBURSE_REVISION_CONFLICT', '条目已被更新，请刷新后重试', {
        expectedRevision, actualRevision: entry.revision,
      });
    }
  }

  private history(
    entry: ReimburseEntry,
    action: ReimburseHistoryAction,
    actorId: string,
    at: string,
    options: Partial<Pick<ReimburseHistoryEvent, 'revision' | 'from' | 'to' | 'reason' | 'changedFields'>> = {},
  ): ReimburseHistoryEvent {
    return {
      action, actorId, at, revision: options.revision ?? entry.revision,
      from: options.from ?? null, to: options.to ?? null,
      reason: options.reason ?? null, changedFields: options.changedFields ?? [],
    };
  }

  private throwInvalidTransition(from: ReimburseEntry['workflowStatus'], to: ReimburseEntry['workflowStatus']): never {
    throw appError('conflict', 'REIMBURSE_WORKFLOW_INVALID', `不允许从 ${from} 转为 ${to}`, { from, to });
  }

  private requireEntry(id: string): ReimburseEntry {
    const entry = this.repository.getEntry(id);
    if (!entry) throw appError('not_found', 'REIMBURSE_ENTRY_NOT_FOUND', `未知报销条目: ${id}`);
    return entry;
  }

  private async requireAdmin(identity: SessionIdentity | null): Promise<void> {
    if (!identity || !(await this.isAdmin(identity.memberId))) {
      throw appError('forbidden', 'REIMBURSE_ADMIN_REQUIRED', '仅超管可操作报销批次或配置');
    }
  }

  private async isAdmin(memberId: string): Promise<boolean> {
    return this.admin.isSuperAdmin(memberId);
  }
}
