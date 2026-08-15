import type {
  ActorRef,
  InventorySnapshot,
  PartAction,
  PartActionSource,
  PartType,
  ReimburseEntry,
  StockInRequest,
} from '@teamhub/hub-contracts';
import { ApplicationError } from './application-error.js';
import type { ApplicationUnitOfWork } from './unit-of-work.js';

export type InventoryStockInPartDraft = Omit<
  PartType,
  'id' | 'lastCountedAt' | 'updatedAt'
> & { id?: string };

export type InventoryStockInActionDraft = Omit<
  PartAction,
  'id' | 'recordedAt' | 'recordedBy'
> & { source: PartActionSource };

export type InventoryStockInState = Pick<
  InventorySnapshot,
  'partTypes' | 'actions'
>;

/** 报账用例只读一张条目，不依赖完整 ReimburseRepository；读取也在同一同步事务内。 */
export interface ReimburseStockInPort {
  readEntryForStockIn(id: string): ReimburseEntry | undefined;
}

/** 库存域向报账开放的窄同步 port；所有方法只能在 ApplicationUnitOfWork 回调内调用。 */
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

const STOCK_IN_NOTE_PREFIX = 'reimb-stock-in:';

function stockInNote(itemIndex: number, itemName: string): string {
  return `${STOCK_IN_NOTE_PREFIX}${itemIndex} 报账入库·${itemName}`;
}

function parseStockInItemIndex(note: string | null): number | null {
  if (!note?.startsWith(STOCK_IN_NOTE_PREFIX)) return null;
  const match = /^(\d+)\s/.exec(note.slice(STOCK_IN_NOTE_PREFIX.length));
  return match ? Number(match[1]) : null;
}

export class ReimburseStockInService {
  constructor(
    private readonly reimburseEntries: ReimburseStockInPort,
    private readonly inventory: InventoryStockInPort,
    private readonly unitOfWork: ApplicationUnitOfWork,
  ) {}

  stockIn(
    command: StockInReimburseEntryCommand,
  ): StockInReimburseEntryResult {
    return this.unitOfWork.run(command.actor, (context) => {
      const entry = this.reimburseEntries.readEntryForStockIn(command.entryId);
      if (!entry) {
        throw new ApplicationError(
          'not_found',
          'REIMBURSE_ENTRY_NOT_FOUND',
          `未知报账条目: ${command.entryId}`,
        );
      }
      if (entry.memberId !== command.actor.id && !command.canManageAll) {
        throw new ApplicationError(
          'forbidden',
          'REIMBURSE_STOCK_IN_FORBIDDEN',
          '只有条目本人或管理员能确认入库',
        );
      }
      if (entry.kind !== 'goods') {
        throw new ApplicationError(
          'validation',
          'REIMBURSE_ENTRY_NOT_GOODS',
          '纯费用条目无物资可入库',
        );
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
          const created = this.inventory.upsertStockInPartType(
            {
              projectId: entry.projectId,
              partNumber: newPart.partNumber,
              name: newPart.name,
              category: newPart.category,
              unit: newPart.unit,
              trackIndividually: false,
              totalQuantity: 0,
              allocations: [],
              lowStockThreshold: 0,
            },
            context.occurredAt,
          );
          partTypeId = created.id;
        }

        const item = entry.items[line.itemIndex];
        actions.push(
          this.inventory.recordStockInAction(
            {
              projectId: entry.projectId,
              partTypeId,
              trackedPartId: null,
              kind: 'restock',
              quantityDelta: line.quantity,
              fromHolder: null,
              toHolder: null,
              note: stockInNote(line.itemIndex, item.name),
              acquisition: 'selfPurchase',
              reimburseEntryId: entry.id,
              source: 'human',
            },
            context.occurredAt,
          ),
        );
      }

      const after = this.inventory.readStockInSnapshot();
      const touched = new Set(actions.map((action) => action.partTypeId));
      return {
        partTypes: after.partTypes.filter((partType) => touched.has(partType.id)),
        actions,
      };
    });
  }

  private validateLines(
    entry: ReimburseEntry,
    lines: StockInRequest['lines'],
    snapshot: InventoryStockInState,
  ): void {
    const stockedByLine = new Map<number, number>();
    for (const action of snapshot.actions) {
      if (action.kind !== 'restock' || action.reimburseEntryId !== entry.id) continue;
      const itemIndex = parseStockInItemIndex(action.note);
      if (itemIndex === null) continue;
      stockedByLine.set(
        itemIndex,
        (stockedByLine.get(itemIndex) ?? 0) + Math.abs(action.quantityDelta),
      );
    }

    const requestedByLine = new Map<number, number>();
    for (const line of lines) {
      const item = entry.items[line.itemIndex];
      if (!item) {
        throw new ApplicationError(
          'validation',
          'REIMBURSE_STOCK_LINE_NOT_FOUND',
          `明细行 #${line.itemIndex} 不存在（条目共 ${entry.items.length} 行）`,
          { itemIndex: line.itemIndex },
        );
      }
      const requested = (requestedByLine.get(line.itemIndex) ?? 0) + line.quantity;
      requestedByLine.set(line.itemIndex, requested);
      const remaining = item.quantity - (stockedByLine.get(line.itemIndex) ?? 0);
      if (requested > remaining) {
        throw new ApplicationError(
          'validation',
          'REIMBURSE_STOCK_QUANTITY_EXCEEDED',
          `明细行「${item.name}」剩余可入库 ${remaining}，本次累计申请 ${requested}（防重复入库）`,
          { itemIndex: line.itemIndex, remaining, requested },
        );
      }

      const target = line.target;
      if ('partTypeId' in target) {
        if (!snapshot.partTypes.some((part) => part.id === target.partTypeId)) {
          throw new ApplicationError(
            'validation',
            'INVENTORY_PART_NOT_FOUND',
            `未知件: ${target.partTypeId}`,
            { partTypeId: target.partTypeId },
          );
        }
      } else if (
        snapshot.partTypes.some(
          (part) => part.partNumber === target.newPart.partNumber,
        )
      ) {
        throw new ApplicationError(
          'validation',
          'INVENTORY_PART_NUMBER_CONFLICT',
          `件号 ${target.newPart.partNumber} 已存在，请改用 partTypeId 入库`,
          { partNumber: target.newPart.partNumber },
        );
      }
    }

    const newPartNumbers = lines
      .map((line) =>
        'newPart' in line.target ? line.target.newPart.partNumber : null,
      )
      .filter((partNumber): partNumber is string => partNumber !== null);
    if (new Set(newPartNumbers).size !== newPartNumbers.length) {
      throw new ApplicationError(
        'validation',
        'REIMBURSE_STOCK_DUPLICATE_PART_NUMBER',
        '同批新建件号重复',
      );
    }
  }
}
