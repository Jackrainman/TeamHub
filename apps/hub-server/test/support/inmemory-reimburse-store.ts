import { GOVERNANCE_SCENARIO_NOW } from '@teamhub/hub-contracts';
import type { ReimburseBatch, ReimburseEntry } from '@teamhub/hub-contracts';
import { FixedClock } from '../../src/clock.js';
import type { Clock } from '../../src/clock.js';
import type { ReimburseStockInPort } from '../../src/application/reimburse-stock-in-service.js';
import { cloneArrayFields } from '../../src/store/clone-snapshot.js';
import {
  emptyReimburseSnapshot,
  type ReimburseBatchDraft,
  type ReimburseBatchPatch,
  type ReimburseEntryDraft,
  type ReimburseEntryPatch,
  type ReimburseSnapshot,
  type ReimburseStore,
} from '../../src/store/reimburse-store.js';

const REIMBURSE_ARRAY_FIELDS: (keyof ReimburseSnapshot)[] = ['entries', 'batches'];

export class InMemoryReimburseStore implements ReimburseStore, ReimburseStockInPort {
  private readonly snapshot: ReimburseSnapshot;
  private readonly clock: Clock;
  private entrySeq: number;
  private batchSeq: number;

  constructor(
    seed: ReimburseSnapshot = emptyReimburseSnapshot(),
    clock: Clock = new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW)),
  ) {
    this.snapshot = cloneArrayFields(seed, REIMBURSE_ARRAY_FIELDS);
    this.clock = clock;
    this.entrySeq = this.snapshot.entries.length;
    this.batchSeq = this.snapshot.batches.length;
  }

  async listEntries(): Promise<ReimburseEntry[]> {
    return [...this.snapshot.entries];
  }

  async getEntry(id: string): Promise<ReimburseEntry | undefined> {
    return this.readEntryForStockIn(id);
  }

  readEntryForStockIn(id: string): ReimburseEntry | undefined {
    return this.snapshot.entries.find((entry) => entry.id === id);
  }

  async findEntryByInvoiceNo(invoiceNo: string): Promise<ReimburseEntry | undefined> {
    return this.snapshot.entries.find((entry) => entry.invoiceNo === invoiceNo);
  }

  async createEntry(draft: ReimburseEntryDraft): Promise<ReimburseEntry> {
    const now = this.clock.now().toISOString();
    const entry: ReimburseEntry = {
      ...draft,
      id: `reimb-new-${++this.entrySeq}`,
      createdAt: now,
      updatedAt: now,
    };
    this.snapshot.entries.push(entry);
    return entry;
  }

  async updateEntry(id: string, patch: ReimburseEntryPatch): Promise<ReimburseEntry | undefined> {
    const index = this.snapshot.entries.findIndex((entry) => entry.id === id);
    if (index < 0) return undefined;
    const updated: ReimburseEntry = {
      ...this.snapshot.entries[index],
      ...patch,
      id,
      updatedAt: this.clock.now().toISOString(),
    };
    this.snapshot.entries[index] = updated;
    return updated;
  }

  async listBatches(): Promise<ReimburseBatch[]> {
    return [...this.snapshot.batches];
  }

  async getBatch(id: string): Promise<ReimburseBatch | undefined> {
    return this.snapshot.batches.find((batch) => batch.id === id);
  }

  async createBatch(draft: ReimburseBatchDraft): Promise<ReimburseBatch> {
    const now = this.clock.now().toISOString();
    const batch: ReimburseBatch = {
      ...draft,
      id: `rbatch-new-${++this.batchSeq}`,
      status: 'collecting',
      createdAt: now,
      updatedAt: now,
    };
    this.snapshot.batches.push(batch);
    return batch;
  }

  async updateBatch(id: string, patch: ReimburseBatchPatch): Promise<ReimburseBatch | undefined> {
    const index = this.snapshot.batches.findIndex((batch) => batch.id === id);
    if (index < 0) return undefined;
    const updated: ReimburseBatch = {
      ...this.snapshot.batches[index],
      ...patch,
      id,
      updatedAt: this.clock.now().toISOString(),
    };
    this.snapshot.batches[index] = updated;
    return updated;
  }
}
