import {
  StockInContextResponseSchema,
  deriveBatchSummary,
} from '@teamhub/hub-contracts';
import type {
  ActorRef,
  InventorySnapshot,
  PartAction,
  PartActionSource,
  PartType,
  ReimburseBatch,
  ReimburseEntry,
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
  ReimburseRepository,
} from './repository.js';

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

export class ReimburseService {
  constructor(
    private readonly repository: ReimburseRepository,
    private readonly admin: ReimburseAdminPort,
    private readonly reimburseStockIn: ReimburseStockInPort,
    private readonly inventory: InventoryStockInPort,
    private readonly unitOfWork: ApplicationUnitOfWork,
    private readonly identityMode: 'anonymous' | 'identity',
  ) {}

  async listEntries(identity: SessionIdentity | null): Promise<ReimburseEntry[]> {
    const entries = this.repository.listEntries();
    if (this.identityMode !== 'identity') return entries;
    if (!identity) {
      throw new ApplicationError('unauthorized', 'REIMBURSE_LOGIN_REQUIRED', '登录后查看报账条目');
    }
    return (await this.isAdmin(identity.memberId))
      ? entries
      : entries.filter((entry) => entry.memberId === identity.memberId);
  }

  createEntry(draft: ReimburseEntryDraft): ReimburseEntry {
    if (draft.invoiceNo) {
      const duplicate = this.repository.findEntryByInvoiceNo(draft.invoiceNo);
      if (duplicate) {
        throw new ApplicationError(
          'conflict',
          'REIMBURSE_INVOICE_DUPLICATE',
          `发票号 ${draft.invoiceNo} 已录入过（条目 ${duplicate.id}），勿重复报账`,
        );
      }
    }
    return this.repository.createEntry(draft);
  }

  async updateEntry(
    id: string,
    patch: UpdateReimburseEntryRequest,
    actor: ActorRef,
  ): Promise<ReimburseEntry> {
    const entry = this.requireEntry(id);
    if (entry.memberId !== actor.id && !(await this.isAdmin(actor.id))) {
      throw new ApplicationError('forbidden', 'REIMBURSE_ENTRY_FORBIDDEN', '只有条目本人或管理员能改报账条目');
    }
    if (patch.batchId && !this.repository.getBatch(patch.batchId)) {
      throw new ApplicationError('validation', 'REIMBURSE_BATCH_NOT_FOUND', `未知批次: ${patch.batchId}`);
    }
    return this.repository.updateEntry(id, patch)!;
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
        throw new ApplicationError('not_found', 'REIMBURSE_ENTRY_NOT_FOUND', `未知报账条目: ${command.entryId}`);
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
          note: `报账入库·${item.name}`,
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
    if (!entry) throw new ApplicationError('not_found', 'REIMBURSE_ENTRY_NOT_FOUND', `未知报账条目: ${id}`);
    return entry;
  }

  private async requireAdmin(identity: SessionIdentity | null): Promise<void> {
    if (!identity || !(await this.isAdmin(identity.memberId))) {
      throw new ApplicationError('forbidden', 'REIMBURSE_ADMIN_REQUIRED', '仅超管可操作报账批次或配置');
    }
  }

  private async isAdmin(memberId: string): Promise<boolean> {
    return this.admin.isSuperAdmin(memberId);
  }
}
