import {
  StockInContextResponseSchema,
  deriveBatchSummary,
} from '@teamhub/hub-contracts';
import { extname } from 'node:path';

import type {
  ActorRef,
  InventorySnapshot,
  PartAction,
  PartActionSource,
  PartType,
  ReimburseBatch,
  ReimburseEntry,
  ReimburseEvidence,
  ReimburseEvidenceDownload,
  ReimburseEvidenceKind,
  ReimburseProfile,
  SessionIdentity,
  StockInContextResponse,
  StockInRequest,
  UpdateReimburseBatchRequest,
  UpdateReimburseEntryRequest,
} from '@teamhub/hub-contracts';
import { ApplicationError } from '../../application/application-error.js';
import type { ApplicationUnitOfWork } from '../../application/unit-of-work.js';
import type {
  ReimburseBatchDraft,
  ReimburseEntryDraft,
  ReimburseEntryInput,
  ReimburseEvidenceStorage,
  ReimburseRepository,
} from './repository.js';

/** 批次状态机（REIMBURSE-DEFECTS #2/#4）：顺向单向，提交后财务快照不可回退。 */
const BATCH_TRANSITIONS: Record<ReimburseBatch['status'], readonly ReimburseBatch['status'][]> = {
  collecting: ['submitted'],
  submitted: ['reimbursed'],
  reimbursed: [],
};

export type InventoryStockInPartDraft = Omit<
  PartType,
  'id' | 'lastCountedAt' | 'updatedAt'
> & { id?: string };
export type InventoryStockInActionDraft = Omit<
  PartAction,
  'id' | 'recordedAt' | 'recordedBy'
> & { source: PartActionSource };
export type InventoryStockInState = Pick<InventorySnapshot, 'partTypes' | 'actions'>;

export interface ReimburseStockInPort {
  readEntryForStockIn(id: string): ReimburseEntry | undefined;
}

export interface InventoryStockInPort {
  readStockInSnapshot(): InventoryStockInState;
  upsertStockInPartType(draft: InventoryStockInPartDraft, occurredAt: Date): PartType;
  recordStockInAction(draft: InventoryStockInActionDraft, occurredAt: Date): PartAction;
}

export interface StockInReimburseEntryCommand {
  entryId: string;
  lines: StockInRequest['lines'];
  actor: ActorRef;
  canManageAll: boolean;
}

export interface StockInReimburseEntryResult {
  partTypes: PartType[];
  actions: PartAction[];
}

/**
 * 超管判定的窄 port（§8.2；前身 PmRepository.getSnapshot().members + isSuperAdmin 全量依赖）。
 * 组合根用 pm 成员表适配注入；reimburse 域不反向感知成员实体。
 */
export interface ReimburseAdminPort {
  isSuperAdmin(memberId: string): Promise<boolean>;
}

/** 凭证允许的后缀 → 下载 contentType（D-094：发票 PDF + 付款/查验截图）。 */
const EVIDENCE_ALLOWED_EXT = new Map<string, string>([
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
]);

/** 单条目共证人最多 12 份（防误传堆积；真实场景一张发票+一张付款截图+查验单 ≤3）。 */
const EVIDENCE_MAX_PER_ENTRY = 12;

/** D-094「永不进列表」：条目对象出 HTTP 前把 evidence 剥成空数组，原件元数据只走凭证专属端点。 */
function withoutEvidence(entry: ReimburseEntry): ReimburseEntry {
  return entry.evidence?.length ? { ...entry, evidence: [] } : entry;
}

export interface ReimburseEvidenceDownloadResult {
  downloadName: string;
  contentType: string;
  content: Buffer;
}

export class ReimburseService {
  constructor(
    private readonly repository: ReimburseRepository,
    private readonly admin: ReimburseAdminPort,
    private readonly reimburseStockIn: ReimburseStockInPort,
    private readonly inventory: InventoryStockInPort,
    private readonly unitOfWork: ApplicationUnitOfWork,
    private readonly identityMode: 'anonymous' | 'identity',
    private readonly evidenceStorage: ReimburseEvidenceStorage,
  ) {}

  async listEntries(identity: SessionIdentity | null): Promise<ReimburseEntry[]> {
    const entries = this.repository.listEntries();
    if (this.identityMode !== 'identity') return entries.map(withoutEvidence);
    if (!identity) {
      throw new ApplicationError('unauthorized', 'REIMBURSE_LOGIN_REQUIRED', '登录后查看报销条目');
    }
    const visible = (await this.isAdmin(identity.memberId))
      ? entries
      : entries.filter((entry) => entry.memberId === identity.memberId);
    return visible.map(withoutEvidence);
  }

  createEntry(input: ReimburseEntryInput): ReimburseEntry {
    // 可空键缺省规整为 null（REIMBURSE-DEFECTS #5：Create 请求允许省略 nullable 键）。
    // 凭证元数据不在 draft 类型里（ReimburseEntryDraft 已 omit），只能走 uploadEvidence。
    const draft: ReimburseEntryDraft = {
      ...input,
      invoiceNo: input.invoiceNo ?? null,
      invoiceDate: input.invoiceDate ?? null,
      seller: input.seller ?? null,
      purchaserName: input.purchaserName ?? null,
      purchaserTaxNo: input.purchaserTaxNo ?? null,
      actualItemName: input.actualItemName ?? null,
      note: input.note ?? null,
    };
    if (draft.invoiceNo) {
      const duplicate = this.repository.findEntryByInvoiceNo(draft.invoiceNo);
      if (duplicate) {
        throw new ApplicationError(
          'conflict',
          'REIMBURSE_INVOICE_DUPLICATE',
          `发票号 ${draft.invoiceNo} 已录入过（条目 ${duplicate.id}），勿重复报销`,
        );
      }
    }
    return withoutEvidence(this.repository.createEntry(draft));
  }

  /**
   * 批次锁（REIMBURSE-DEFECTS #2）：非 collecting 批次的财务快照不可变——
   * 条目归属/材料/备注均不得改写；也不允许把条目装进已锁批次。
   */
  private assertBatchMutable(batchId: string | null | undefined): void {
    if (!batchId) return;
    const batch = this.repository.getBatch(batchId);
    if (batch && batch.status !== 'collecting') {
      throw new ApplicationError(
        'conflict',
        'REIMBURSE_BATCH_LOCKED',
        `批次「${batch.name}」已${batch.status === 'submitted' ? '提交' : '完成报销'}，快照不可变`,
        { batchId: batch.id, status: batch.status },
      );
    }
  }

  async updateEntry(
    id: string,
    patch: UpdateReimburseEntryRequest,
    actor: ActorRef,
  ): Promise<ReimburseEntry> {
    const entry = this.requireEntry(id);
    if (entry.memberId !== actor.id && !(await this.isAdmin(actor.id))) {
      throw new ApplicationError('forbidden', 'REIMBURSE_ENTRY_FORBIDDEN', '只有条目本人或管理员能改报销条目');
    }
    if (patch.batchId && !this.repository.getBatch(patch.batchId)) {
      throw new ApplicationError('validation', 'REIMBURSE_BATCH_NOT_FOUND', `未知批次: ${patch.batchId}`);
    }
    this.assertBatchMutable(entry.batchId);
    this.assertBatchMutable(patch.batchId);
    return withoutEvidence(this.repository.updateEntry(id, patch)!);
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
    if (!batch) throw new ApplicationError('not_found', 'REIMBURSE_BATCH_NOT_FOUND', `未知批次: ${id}`);
    // 状态机（#4）：只允许顺向单向转移 collecting→submitted→reimbursed；同值视为无操作放行。
    if (patch.status && patch.status !== batch.status && !BATCH_TRANSITIONS[batch.status].includes(patch.status)) {
      throw new ApplicationError(
        'conflict',
        'REIMBURSE_BATCH_TRANSITION',
        `批次状态不允许从「${batch.status}」变为「${patch.status}」（只允许顺向推进）`,
        { batchId: id, from: batch.status, to: patch.status },
      );
    }
    // 快照锁（#2）：提交后批次名也不可改（状态推进本身除外）。
    if (patch.name !== undefined && batch.status !== 'collecting') {
      throw new ApplicationError(
        'conflict',
        'REIMBURSE_BATCH_LOCKED',
        `批次「${batch.name}」已提交，快照不可变`,
        { batchId: id, status: batch.status },
      );
    }
    if (patch.status === 'submitted') {
      const summary = deriveBatchSummary(this.repository.listEntries(), id, this.repository.getProfile());
      if (summary.financial.blocked.count > 0) {
        throw new ApplicationError(
          'conflict',
          'REIMBURSE_BATCH_BLOCKED',
          `批次仍有 ${summary.financial.blocked.count} 张票据未通过质量门，不能提交`,
          { batchId: id, blocked: summary.financial.blocked },
        );
      }
    }
    return this.repository.updateBatch(id, patch)!;
  }

  async getStockInContext(identity: SessionIdentity | null): Promise<StockInContextResponse> {
    const entries = await this.listEntries(identity);
    const visibleEntryIds = new Set(entries.map((entry) => entry.id));
    const snapshot = this.inventory.readStockInSnapshot();
    const quantities = new Map<string, Map<number, number>>();
    for (const action of snapshot.actions) {
      if (action.kind !== 'restock' || !action.reimburseEntryId || !visibleEntryIds.has(action.reimburseEntryId) || action.reimburseItemIndex === undefined) continue;
      const entryQuantities = quantities.get(action.reimburseEntryId) ?? new Map<number, number>();
      entryQuantities.set(
        action.reimburseItemIndex,
        (entryQuantities.get(action.reimburseItemIndex) ?? 0) + Math.abs(action.quantityDelta),
      );
      quantities.set(action.reimburseEntryId, entryQuantities);
    }
    return StockInContextResponseSchema.parse({
      partTypes: snapshot.partTypes.map(({ id, partNumber, name, category, unit }) => ({ id, partNumber, name, category, unit })),
      entries: entries.map((entry) => ({
        entryId: entry.id,
        stockedLines: [...(quantities.get(entry.id) ?? new Map())]
          .map(([itemIndex, quantity]) => ({ itemIndex, quantity })),
      })),
    });
  }

  stockIn(command: StockInReimburseEntryCommand): StockInReimburseEntryResult {
    return this.unitOfWork.run(command.actor, (context) => {
      const entry = this.reimburseStockIn.readEntryForStockIn(command.entryId);
      if (!entry) {
        throw new ApplicationError('not_found', 'REIMBURSE_ENTRY_NOT_FOUND', `未知报销条目: ${command.entryId}`);
      }
      if (entry.memberId !== command.actor.id && !command.canManageAll) {
        throw new ApplicationError('forbidden', 'REIMBURSE_STOCK_IN_FORBIDDEN', '只有条目本人或管理员能确认入库');
      }
      if (entry.kind !== 'goods') {
        throw new ApplicationError('validation', 'REIMBURSE_ENTRY_NOT_GOODS', '纯费用条目无物资可入库');
      }
      const snapshot = this.inventory.readStockInSnapshot();
      this.validateLines(entry, command.lines, snapshot);
      const actions: PartAction[] = [];
      for (const line of command.lines) {
        let partTypeId: string;
        if ('partTypeId' in line.target) {
          partTypeId = line.target.partTypeId;
        } else {
          const newPart = line.target.newPart;
          partTypeId = this.inventory.upsertStockInPartType({
            projectId: entry.projectId,
            partNumber: newPart.partNumber,
            name: newPart.name,
            category: newPart.category,
            unit: newPart.unit,
            trackIndividually: false,
            totalQuantity: 0,
            allocations: [],
            lowStockThreshold: 0,
          }, context.occurredAt).id;
        }
        const item = entry.items[line.itemIndex];
        actions.push(this.inventory.recordStockInAction({
          projectId: entry.projectId,
          partTypeId,
          trackedPartId: null,
          kind: 'restock',
          quantityDelta: line.quantity,
          fromHolder: null,
          toHolder: null,
          note: `报销入库·${item.name}`,
          acquisition: 'selfPurchase',
          reimburseEntryId: entry.id,
          reimburseItemIndex: line.itemIndex,
          source: 'human',
        }, context.occurredAt));
      }
      const after = this.inventory.readStockInSnapshot();
      const touched = new Set(actions.map((action) => action.partTypeId));
      return { partTypes: after.partTypes.filter((part) => touched.has(part.id)), actions };
    });
  }

  async canManageAll(memberId: string): Promise<boolean> {
    return this.isAdmin(memberId);
  }

  /**
   * 凭证上传（D-094 受控留档）：仅条目本人可传（超管也只能看不能代传）；批次提交后快照锁
   * 同条目字段口径。字节先落卷（原子写），元数据再回写条目行；回写失败删刚落的文件防孤儿。
   */
  async uploadEvidence(
    entryId: string,
    kind: ReimburseEvidenceKind,
    upload: { filename?: string; buf: Buffer },
    actor: ActorRef,
  ): Promise<ReimburseEvidence> {
    const dir = this.evidenceStorage.dir();
    if (!dir) {
      throw new ApplicationError('validation', 'REIMBURSE_EVIDENCE_STORAGE_UNCONFIGURED', '未配置凭证留档目录');
    }
    const entry = this.requireEntry(entryId);
    if (entry.memberId !== actor.id) {
      throw new ApplicationError('forbidden', 'REIMBURSE_EVIDENCE_FORBIDDEN', '只有条目本人能上传凭证');
    }
    this.assertBatchMutable(entry.batchId);
    if ((entry.evidence ?? []).length >= EVIDENCE_MAX_PER_ENTRY) {
      throw new ApplicationError(
        'validation',
        'REIMBURSE_EVIDENCE_LIMIT',
        `单个条目最多留档 ${EVIDENCE_MAX_PER_ENTRY} 份凭证`,
      );
    }
    const ext = extname(upload.filename ?? '').toLowerCase();
    if (!EVIDENCE_ALLOWED_EXT.has(ext)) {
      throw new ApplicationError(
        'validation',
        'REIMBURSE_EVIDENCE_UNSUPPORTED_EXT',
        `不支持的凭证类型：${ext || '（无后缀）'}（仅 PDF/PNG/JPG）`,
      );
    }
    // 原始名剥路径只留基名，下载时回用它做 content-disposition。
    const originalName = (upload.filename ?? `evidence${ext}`).split(/[\\/]/).pop()!.trim() || `evidence${ext}`;
    const sha256 = this.evidenceStorage.sha256(upload.buf);
    const draft = {
      kind,
      originalName,
      ext,
      sizeBytes: upload.buf.length,
      sha256,
      uploadedBy: actor.id,
      uploadedAt: new Date().toISOString(),
    };
    // 先占一个 id 才能落卷（文件名 = <evidenceId><ext>）：让 repository 先写元数据会产生
    // 「有指针无字节」窗口，故这里用 append-then-write、写失败回滚元数据的顺序。
    const appended = this.repository.appendEntryEvidence(entryId, draft);
    if (!appended) {
      throw new ApplicationError('not_found', 'REIMBURSE_ENTRY_NOT_FOUND', `未知报销条目: ${entryId}`);
    }
    try {
      await this.evidenceStorage.write(dir, appended.evidence.id, ext, upload.buf);
    } catch (err) {
      this.repository.removeEntryEvidence(entryId, appended.evidence.id);
      throw err; // 基础设施故障：route 映射 500
    }
    return appended.evidence;
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
      throw new ApplicationError('not_found', 'REIMBURSE_EVIDENCE_STORAGE_UNCONFIGURED', '未配置凭证留档目录');
    }
    const entry = this.requireEntry(entryId);
    await this.assertEvidenceReadable(entry, actor);
    const evidence = (entry.evidence ?? []).find((item) => item.id === evidenceId);
    if (!evidence) {
      throw new ApplicationError('not_found', 'REIMBURSE_EVIDENCE_NOT_FOUND', `未知凭证: ${evidenceId}`);
    }
    let file: { filename: string; ext: string; content: Buffer } | null;
    try {
      file = await this.evidenceStorage.read(dir, evidenceId);
    } catch {
      throw new ApplicationError('validation', 'REIMBURSE_EVIDENCE_ILLEGAL_PATH', '非法路径');
    }
    if (!file) {
      throw new ApplicationError('not_found', 'REIMBURSE_EVIDENCE_FILE_MISSING', '该凭证文件缺失（元数据在、字节不在）');
    }
    this.repository.appendEvidenceDownload({ entryId, evidenceId, actorId: actor.id });
    return {
      downloadName: evidence.originalName,
      contentType: EVIDENCE_ALLOWED_EXT.get(evidence.ext) ?? 'application/octet-stream',
      content: file.content,
    };
  }

  /** 凭证删除：本人或超管；批次锁同上传口径。先剥元数据再删字节（顺序无所谓原子性，删失败留孤儿字节可容忍）。 */
  async deleteEvidence(
    entryId: string,
    evidenceId: string,
    actor: ActorRef,
  ): Promise<ReimburseEvidence[]> {
    const entry = this.requireEntry(entryId);
    await this.assertEvidenceReadable(entry, actor);
    this.assertBatchMutable(entry.batchId);
    const updated = this.repository.removeEntryEvidence(entryId, evidenceId);
    if (!updated) {
      throw new ApplicationError('not_found', 'REIMBURSE_EVIDENCE_NOT_FOUND', `未知凭证: ${evidenceId}`);
    }
    const dir = this.evidenceStorage.dir();
    if (dir) await this.evidenceStorage.remove(dir, evidenceId).catch(() => {});
    return updated.evidence ?? [];
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
      throw new ApplicationError('forbidden', 'REIMBURSE_EVIDENCE_FORBIDDEN', '只有条目本人或管理员能读凭证');
    }
  }

  private validateLines(entry: ReimburseEntry, lines: StockInRequest['lines'], snapshot: InventoryStockInState): void {
    const stockedByLine = new Map<number, number>();
    for (const action of snapshot.actions) {
      if (action.kind !== 'restock' || action.reimburseEntryId !== entry.id || action.reimburseItemIndex === undefined) continue;
      stockedByLine.set(action.reimburseItemIndex, (stockedByLine.get(action.reimburseItemIndex) ?? 0) + Math.abs(action.quantityDelta));
    }
    const requestedByLine = new Map<number, number>();
    for (const line of lines) {
      const item = entry.items[line.itemIndex];
      if (!item) throw new ApplicationError('validation', 'REIMBURSE_STOCK_LINE_NOT_FOUND', `明细行 #${line.itemIndex} 不存在（条目共 ${entry.items.length} 行）`, { itemIndex: line.itemIndex });
      const requested = (requestedByLine.get(line.itemIndex) ?? 0) + line.quantity;
      requestedByLine.set(line.itemIndex, requested);
      const remaining = item.quantity - (stockedByLine.get(line.itemIndex) ?? 0);
      if (requested > remaining) throw new ApplicationError('validation', 'REIMBURSE_STOCK_QUANTITY_EXCEEDED', `明细行「${item.name}」剩余可入库 ${remaining}，本次累计申请 ${requested}（防重复入库）`, { itemIndex: line.itemIndex, remaining, requested });
      const target = line.target;
      if ('partTypeId' in target && !snapshot.partTypes.some((part) => part.id === target.partTypeId)) {
        throw new ApplicationError('validation', 'INVENTORY_PART_NOT_FOUND', `未知件: ${target.partTypeId}`, { partTypeId: target.partTypeId });
      }
      if ('newPart' in target && snapshot.partTypes.some((part) => part.partNumber === target.newPart.partNumber)) {
        throw new ApplicationError('validation', 'INVENTORY_PART_NUMBER_CONFLICT', `件号 ${target.newPart.partNumber} 已存在，请改用 partTypeId 入库`, { partNumber: target.newPart.partNumber });
      }
    }
    const numbers = lines.flatMap((line) => 'newPart' in line.target ? [line.target.newPart.partNumber] : []);
    if (new Set(numbers).size !== numbers.length) throw new ApplicationError('validation', 'REIMBURSE_STOCK_DUPLICATE_PART_NUMBER', '同批新建件号重复');
  }

  private requireEntry(id: string): ReimburseEntry {
    const entry = this.repository.getEntry(id);
    if (!entry) throw new ApplicationError('not_found', 'REIMBURSE_ENTRY_NOT_FOUND', `未知报销条目: ${id}`);
    return entry;
  }

  private async requireAdmin(identity: SessionIdentity | null): Promise<void> {
    if (!identity || !(await this.isAdmin(identity.memberId))) {
      throw new ApplicationError('forbidden', 'REIMBURSE_ADMIN_REQUIRED', '仅超管可操作报销批次或配置');
    }
  }

  private async isAdmin(memberId: string): Promise<boolean> {
    return this.admin.isSuperAdmin(memberId);
  }
}
