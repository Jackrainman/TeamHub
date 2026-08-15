import type { ReimburseBatch, ReimburseEntry } from '@teamhub/hub-contracts';
import { GOVERNANCE_SCENARIO_NOW } from '@teamhub/hub-contracts';
import { FixedClock } from '../clock.js';
import type { Clock } from '../clock.js';
import type { ReimburseStockInPort } from '../application/reimburse-stock-in-service.js';
import { createIdSequence, nextSequentialId } from './id-sequence.js';
import type { IdSequence } from './id-sequence.js';
import type { SqliteDatabase } from './sqlite-db.js';
import {
  emptyReimburseSnapshot,
} from './reimburse-store.js';
import type {
  ReimburseBatchDraft,
  ReimburseBatchPatch,
  ReimburseEntryDraft,
  ReimburseEntryPatch,
  ReimburseSnapshot,
  ReimburseStore,
} from './reimburse-store.js';

/**
 * 报账域 SQLite repository（REIMBURSE-PROC，由 sqlite-unified 挂载）：
 * 独立实现（非组合 InMemory），与 SqliteInvStore 同一套纪律——
 * 表 `reimburse_entries` / `reimburse_batches` 走 `ensureEntityTables` 的 KV JSON 模式（整行 JSON、
 * 与 File 同一份序列化真相，schema 加 optional 字段天然向后兼容、零迁移）；
 * id 生成复用 id-sequence 纯函数 + `maxSuffix` 冷启动对齐（L1：单调自增、只增不减）。
 */
const REIMBURSE_TABLES = ['reimburse_entries', 'reimburse_batches'] as const;

export class SqliteReimburseStore implements ReimburseStore, ReimburseStockInPort {
  private readonly sdb: SqliteDatabase;
  private readonly clock: Clock;
  private entrySeq!: IdSequence;
  private batchSeq!: IdSequence;

  private constructor(sdb: SqliteDatabase, clock?: Clock) {
    this.sdb = sdb;
    this.clock = clock ?? new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW));
    this.resyncSequences();
  }

  static fromSharedDb(
    sdb: SqliteDatabase,
    seed: ReimburseSnapshot = emptyReimburseSnapshot(),
    clock?: Clock,
  ): SqliteReimburseStore {
    sdb.ensureEntityTables(REIMBURSE_TABLES);
    if (sdb.getMeta('reimburse_seeded') === undefined) {
      sdb.tx(() => {
        sdb.setMeta('reimburse_seeded', '1');
        sdb.bulkInsert('reimburse_entries', seed.entries);
        sdb.bulkInsert('reimburse_batches', seed.batches);
      });
    }
    return new SqliteReimburseStore(sdb, clock);
  }

  private resyncSequences(): void {
    this.entrySeq = createIdSequence(this.sdb.maxSuffix('reimburse_entries', 'reimb-new'));
    this.batchSeq = createIdSequence(this.sdb.maxSuffix('reimburse_batches', 'rbatch-new'));
  }

  async listEntries(): Promise<ReimburseEntry[]> {
    return this.sdb.allRows('reimburse_entries');
  }

  async getEntry(id: string): Promise<ReimburseEntry | undefined> {
    return this.readEntryForStockIn(id);
  }

  readEntryForStockIn(id: string): ReimburseEntry | undefined {
    return this.sdb.getRow<ReimburseEntry>('reimburse_entries', id);
  }

  async findEntryByInvoiceNo(invoiceNo: string): Promise<ReimburseEntry | undefined> {
    return this.sdb
      .allRows<ReimburseEntry>('reimburse_entries')
      .find((e) => e.invoiceNo === invoiceNo);
  }

  async createEntry(draft: ReimburseEntryDraft): Promise<ReimburseEntry> {
    const now = this.clock.now().toISOString();
    const entry: ReimburseEntry = {
      ...draft,
      id: nextSequentialId('reimb-new', this.entrySeq),
      createdAt: now,
      updatedAt: now,
    };
    this.sdb.tx(() => this.sdb.insertRow('reimburse_entries', entry.id, entry));
    return entry;
  }

  async updateEntry(
    id: string,
    patch: ReimburseEntryPatch,
  ): Promise<ReimburseEntry | undefined> {
    const prior = this.sdb.getRow<ReimburseEntry>('reimburse_entries', id);
    if (!prior) {
      return undefined;
    }
    const updated: ReimburseEntry = {
      ...prior,
      ...patch,
      id,
      updatedAt: this.clock.now().toISOString(),
    };
    this.sdb.tx(() => this.sdb.updateRow('reimburse_entries', id, updated));
    return updated;
  }

  async listBatches(): Promise<ReimburseBatch[]> {
    return this.sdb.allRows('reimburse_batches');
  }

  async getBatch(id: string): Promise<ReimburseBatch | undefined> {
    return this.sdb.getRow<ReimburseBatch>('reimburse_batches', id);
  }

  async createBatch(draft: ReimburseBatchDraft): Promise<ReimburseBatch> {
    const now = this.clock.now().toISOString();
    const batch: ReimburseBatch = {
      ...draft,
      id: nextSequentialId('rbatch-new', this.batchSeq),
      status: 'collecting', // clamp：新批次必收集态，状态流转只走 updateBatch
      createdAt: now,
      updatedAt: now,
    };
    this.sdb.tx(() => this.sdb.insertRow('reimburse_batches', batch.id, batch));
    return batch;
  }

  async updateBatch(
    id: string,
    patch: ReimburseBatchPatch,
  ): Promise<ReimburseBatch | undefined> {
    const prior = this.sdb.getRow<ReimburseBatch>('reimburse_batches', id);
    if (!prior) {
      return undefined;
    }
    const updated: ReimburseBatch = {
      ...prior,
      ...patch,
      id,
      updatedAt: this.clock.now().toISOString(),
    };
    this.sdb.tx(() => this.sdb.updateRow('reimburse_batches', id, updated));
    return updated;
  }
}
