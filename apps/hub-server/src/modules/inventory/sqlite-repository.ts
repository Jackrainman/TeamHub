import {
  GOVERNANCE_SCENARIO_NOW,
  InvalidPartActionError,
  applyPartAction,
  deriveShortfalls,
  inventoryScenarioFixture,
} from '@teamhub/hub-contracts';
import type {
  InventoryImportRow,
  InventorySnapshot,
  PartAction,
  PartType,
  TrackedPart,
} from '@teamhub/hub-contracts';
import { FixedClock } from '../../clock.js';
import type { Clock } from '../../clock.js';
import type {
  InventoryStockInActionDraft,
  InventoryStockInPartDraft,
  InventoryStockInPort,
} from '../reimburse/service.js';
import { createIdSequence, nextSequentialId } from '../../store/id-sequence.js';
import type { IdSequence } from '../../store/id-sequence.js';
import type { SqliteDatabase } from '../../store/sqlite-db.js';
import type {
  InventoryImportOutcome,
  InventoryRepository,
  PartActionDraft,
  PartTypeDraft,
} from './repository.js';

const INV_TABLES = ['inv_part_types', 'inv_tracked_parts', 'inv_actions'] as const;

export class SqliteInventoryRepository implements InventoryRepository, InventoryStockInPort {
  private readonly sdb: SqliteDatabase;
  private readonly clock: Clock;
  private partTypeSeq!: IdSequence;
  private actionSeq!: IdSequence;

  private constructor(sdb: SqliteDatabase, clock?: Clock) {
    this.sdb = sdb;
    this.clock = clock ?? new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW));
    this.resyncSequences();
  }

  static fromSharedDb(
    sdb: SqliteDatabase,
    seed: InventorySnapshot = inventoryScenarioFixture,
    clock?: Clock,
  ): SqliteInventoryRepository {
    sdb.ensureEntityTables(INV_TABLES);
    if (sdb.getMeta('inv_projectId') === undefined) {
      sdb.tx(() => {
        sdb.setMeta('inv_projectId', seed.projectId);
        sdb.bulkInsert('inv_part_types', seed.partTypes);
        sdb.bulkInsert('inv_tracked_parts', seed.trackedParts);
        sdb.bulkInsert('inv_actions', seed.actions);
      });
    }
    return new SqliteInventoryRepository(sdb, clock);
  }

  private resyncSequences(): void {
    this.partTypeSeq = createIdSequence(this.sdb.maxSuffix('inv_part_types', 'parttype-new'));
    this.actionSeq = createIdSequence(this.sdb.maxSuffix('inv_actions', 'act-new'));
  }

  async getInventorySnapshot(): Promise<InventorySnapshot> {
    return this.readStockInSnapshot();
  }

  readStockInSnapshot(): InventorySnapshot {
    return {
      projectId: this.sdb.getMeta('inv_projectId') ?? '',
      partTypes: this.sdb.allRows('inv_part_types'),
      trackedParts: this.sdb.allRows('inv_tracked_parts'),
      actions: this.sdb.allRows('inv_actions'),
    };
  }

  async upsertPartType(draft: PartTypeDraft): Promise<PartType> {
    return this.upsertStockInPartType(draft, this.clock.now());
  }

  upsertStockInPartType(
    draft: InventoryStockInPartDraft,
    occurredAt: Date,
  ): PartType {
    const now = occurredAt.toISOString();
    if (draft.id) {
      const prior = this.sdb.getRow<PartType>('inv_part_types', draft.id);
      if (prior) {
        const updated: PartType = {
          ...prior,
          ...draft,
          id: prior.id,
          lastCountedAt: prior.lastCountedAt,
          updatedAt: now,
        };
        this.sdb.tx(() => this.sdb.updateRow('inv_part_types', prior.id, updated));
        return updated;
      }
    }
    const { id: _ignored, ...rest } = draft;
    void _ignored;
    const partType: PartType = {
      ...rest,
      id: nextSequentialId('parttype-new', this.partTypeSeq),
      lastCountedAt: now,
      updatedAt: now,
    };
    this.sdb.tx(() => this.sdb.insertRow('inv_part_types', partType.id, partType));
    return partType;
  }

  async importPartTypes(rows: readonly InventoryImportRow[]): Promise<InventoryImportOutcome> {
    const now = this.clock.now().toISOString();
    const projectId = this.sdb.getMeta('inv_projectId') ?? '';
    const created: string[] = [];
    const updated: string[] = [];
    const failed: InventoryImportOutcome['failed'] = [];
    this.sdb.tx(() => {
      for (const row of rows) {
        try {
          const all = this.sdb.allRows<PartType>('inv_part_types');
          const prior = all.find((p) => p.partNumber === row.partNumber);
          if (!prior) {
            const partType: PartType = {
              id: nextSequentialId('parttype-new', this.partTypeSeq),
              projectId,
              partNumber: row.partNumber,
              name: row.name,
              category: row.category,
              unit: row.unit,
              trackIndividually: false,
              totalQuantity: row.totalQuantity,
              allocations: [],
              lowStockThreshold: row.lowStockThreshold ?? 0,
              lastCountedAt: now,
              updatedAt: now,
            };
            this.sdb.insertRow('inv_part_types', partType.id, partType);
            created.push(row.partNumber);
          } else {
            const partType: PartType = {
              ...prior,
              name: row.name,
              category: row.category,
              unit: row.unit,
              totalQuantity: row.totalQuantity,
              lowStockThreshold: row.lowStockThreshold ?? prior.lowStockThreshold,
              updatedAt: now,
            };
            this.sdb.updateRow('inv_part_types', prior.id, partType);
            updated.push(row.partNumber);
          }
        } catch (err) {
          failed.push({
            line: row.line ?? 0,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }
    });
    return { created, updated, failed };
  }

  async recordPartAction(draft: PartActionDraft): Promise<PartAction> {
    return this.recordStockInAction(draft, this.clock.now());
  }

  recordStockInAction(
    draft: InventoryStockInActionDraft,
    occurredAt: Date,
  ): PartAction {
    const now = occurredAt.toISOString();
    const partType = this.sdb.getRow<PartType>('inv_part_types', draft.partTypeId);
    if (!partType) {
      throw new InvalidPartActionError(`未知零件类型: ${draft.partTypeId}`);
    }
    let tracked: TrackedPart | null = null;
    if (draft.trackedPartId) {
      tracked = this.sdb.getRow<TrackedPart>('inv_tracked_parts', draft.trackedPartId) ?? null;
      if (!tracked) {
        throw new InvalidPartActionError(`未知个体件: ${draft.trackedPartId}`);
      }
    }

    const effect = applyPartAction(
      partType,
      tracked,
      {
        kind: draft.kind,
        quantityDelta: draft.quantityDelta,
        fromHolder: draft.fromHolder,
        toHolder: draft.toHolder,
      },
      now,
    );

    const action: PartAction = {
      id: nextSequentialId('act-new', this.actionSeq),
      projectId: draft.projectId,
      partTypeId: draft.partTypeId,
      trackedPartId: draft.trackedPartId,
      kind: draft.kind,
      quantityDelta: draft.quantityDelta,
      fromHolder: draft.fromHolder,
      toHolder: draft.toHolder,
      note: draft.note,
      // REIMBURSE-PROC：入库来源 + 关联报销条目（仅 restock 有意义；optional，旧调用方不传则无此键）。
      acquisition: draft.acquisition,
      reimburseEntryId: draft.reimburseEntryId,
      reimburseItemIndex: draft.reimburseItemIndex,
      recordedBy: { source: draft.source, at: now },
      recordedAt: now,
    };

    this.sdb.tx(() => {
      this.sdb.updateRow('inv_part_types', draft.partTypeId, effect.partType);
      if (draft.trackedPartId && effect.trackedPart) {
        this.sdb.updateRow('inv_tracked_parts', draft.trackedPartId, effect.trackedPart);
      }
      this.sdb.insertRow('inv_actions', action.id, action);
    });
    return action;
  }

  async listShortfalls(): Promise<PartType[]> {
    const snapshot = await this.getInventorySnapshot();
    return deriveShortfalls(snapshot);
  }
}
