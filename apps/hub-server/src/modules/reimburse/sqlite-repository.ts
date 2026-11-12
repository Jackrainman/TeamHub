import {
  GOVERNANCE_SCENARIO_NOW,
  ReimburseBatchSchema,
  ReimburseEntrySchema,
  ReimbursePayoutSchema,
  ReimburseProfileSchema,
} from '@teamhub/hub-contracts';
import type {
  ReimburseBatch,
  ReimburseEntry,
  ReimburseEvidence,
  ReimburseEvidenceDownload,
  ReimbursePayout,
  ReimburseProfile,
} from '@teamhub/hub-contracts';
import { FixedClock } from '../../clock.js';
import type { Clock } from '../../clock.js';
import { createIdSequence, nextSequentialId } from '../../store/id-sequence.js';
import type { IdSequence } from '../../store/id-sequence.js';
import type { SqliteDatabase } from '../../store/sqlite-db.js';
import { emptyReimburseSnapshot } from './repository.js';
import type {
  ReimburseBatchDraft,
  ReimburseBatchPatch,
  ReimburseEntryDraft,
  ReimburseEntryPatch,
  ReimburseEvidenceDownloadDraft,
  ReimbursePayoutDraft,
  ReimburseRepository,
  ReimburseSnapshot,
  StoredReimburseEntry,
  StoredReimbursePayout,
} from './repository.js';
import type { ReimburseStockInPort } from './service.js';

export const REIMBURSE_PROFILE_TABLE = 'reimburse_profile';
const PROFILE_ID = 'singleton';
const REIMBURSE_TABLES = [
  'reimburse_entries', 'reimburse_batches', 'reimburse_evidence_downloads', 'reimburse_payouts',
] as const;

function parseStoredEntry(row: ReimburseEntry): ReimburseEntry {
  const parsed = ReimburseEntrySchema.parse(row);
  const creationRequest = (row as StoredReimburseEntry).creationRequest;
  return creationRequest ? { ...parsed, creationRequest } as ReimburseEntry : parsed;
}

function parseStoredPayout(row: ReimbursePayout): ReimbursePayout {
  const parsed = ReimbursePayoutSchema.parse(row);
  const creationRequest = (row as StoredReimbursePayout).creationRequest;
  return creationRequest ? { ...parsed, creationRequest } as ReimbursePayout : parsed;
}

// 旧批次状态 reimbursed 没有打款事实，读时降为 submitted；完成只由 payout 驱动（D-099）。
function parseStoredBatch(row: ReimburseBatch): ReimburseBatch {
  const status = (row.status as string) === 'reimbursed' ? 'submitted' : row.status;
  return ReimburseBatchSchema.parse({ ...row, status });
}

export class SqliteReimburseRepository implements ReimburseRepository, ReimburseStockInPort {
  private entrySeq!: IdSequence;
  private batchSeq!: IdSequence;
  private payoutSeq!: IdSequence;
  private downloadSeq!: IdSequence;
  private invoiceIndex = new Map<string, string>();

  private constructor(
    private readonly sdb: SqliteDatabase,
    private readonly clock: Clock = new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW)),
  ) {
    this.resyncSequences();
  }

  static fromSharedDb(
    sdb: SqliteDatabase,
    seed: ReimburseSnapshot = emptyReimburseSnapshot(),
    clock?: Clock,
  ): SqliteReimburseRepository {
    sdb.ensureEntityTables(REIMBURSE_TABLES);
    sdb.ensureSingletonEntityTable(REIMBURSE_PROFILE_TABLE, PROFILE_ID);
    if (sdb.getMeta('reimburse_seeded') === undefined) {
      sdb.tx(() => {
        sdb.setMeta('reimburse_seeded', '1');
        sdb.bulkInsert('reimburse_entries', seed.entries);
        sdb.bulkInsert('reimburse_batches', seed.batches);
        sdb.bulkInsert('reimburse_payouts', seed.payouts);
        sdb.insertRow(REIMBURSE_PROFILE_TABLE, PROFILE_ID, ReimburseProfileSchema.parse(seed.profile));
      });
    } else if (sdb.getRow(REIMBURSE_PROFILE_TABLE, PROFILE_ID) === undefined) {
      throw new Error('报销域已初始化但 reimburse_profile 单例缺失');
    }
    return new SqliteReimburseRepository(sdb, clock);
  }

  private resyncSequences(): void {
    this.entrySeq = createIdSequence(this.sdb.maxSuffix('reimburse_entries', 'reimb-new'));
    this.batchSeq = createIdSequence(this.sdb.maxSuffix('reimburse_batches', 'rbatch-new'));
    this.payoutSeq = createIdSequence(this.sdb.maxSuffix('reimburse_payouts', 'rpayout-new'));
    this.downloadSeq = createIdSequence(this.sdb.maxSuffix('reimburse_evidence_downloads', 'revdl-new'));
    this.invoiceIndex.clear();
    for (const entry of this.sdb.allRows<ReimburseEntry>('reimburse_entries')) {
      if (entry.invoiceNo) this.invoiceIndex.set(entry.invoiceNo, entry.id);
    }
  }

  listEntries(): ReimburseEntry[] {
    return this.sdb.allRows<ReimburseEntry>('reimburse_entries').map((row) => parseStoredEntry(row));
  }

  getEntry(id: string): ReimburseEntry | undefined {
    return this.readEntryForStockIn(id);
  }

  readEntryForStockIn(id: string): ReimburseEntry | undefined {
    const row = this.sdb.getRow<ReimburseEntry>('reimburse_entries', id);
    return row ? parseStoredEntry(row) : undefined;
  }

  findEntryByInvoiceNo(invoiceNo: string): ReimburseEntry | undefined {
    const id = this.invoiceIndex.get(invoiceNo);
    return id ? this.getEntry(id) : undefined;
  }

  createEntry(draft: ReimburseEntryDraft): ReimburseEntry {
    const now = this.clock.now().toISOString();
    const entry: ReimburseEntry = {
      ...draft,
      evidence: [],
      workflowStatus: 'draft',
      revision: 1,
      recognitionConfirmedRevision: null,
      checkedRevision: null,
      reviewedRevision: null,
      approvedAmountFen: null,
      reviewNote: null,
      returnReason: null,
      payoutId: null,
      history: [{ action: 'created', actorId: draft.memberId, at: now, revision: 1, from: null, to: 'draft', reason: null, changedFields: [] }],
      id: nextSequentialId('reimb-new', this.entrySeq),
      createdAt: now,
      updatedAt: now,
    };
    this.sdb.tx(() => this.sdb.insertRow('reimburse_entries', entry.id, entry));
    if (entry.invoiceNo) this.invoiceIndex.set(entry.invoiceNo, entry.id);
    return entry;
  }

  updateEntry(id: string, patch: ReimburseEntryPatch): ReimburseEntry | undefined {
    const prior = this.getEntry(id);
    if (!prior) return undefined;
    const updated: ReimburseEntry = { ...prior, ...patch, id, updatedAt: this.clock.now().toISOString() };
    this.sdb.tx(() => this.sdb.updateRow('reimburse_entries', id, updated));
    if (prior.invoiceNo !== updated.invoiceNo) {
      if (prior.invoiceNo) this.invoiceIndex.delete(prior.invoiceNo);
      if (updated.invoiceNo) this.invoiceIndex.set(updated.invoiceNo, id);
    }
    return updated;
  }

  listBatches(): ReimburseBatch[] {
    return this.sdb.allRows<ReimburseBatch>('reimburse_batches').map((row) => parseStoredBatch(row));
  }

  getBatch(id: string): ReimburseBatch | undefined {
    const row = this.sdb.getRow<ReimburseBatch>('reimburse_batches', id);
    return row ? parseStoredBatch(row) : undefined;
  }

  createBatch(draft: ReimburseBatchDraft): ReimburseBatch {
    const now = this.clock.now().toISOString();
    const batch: ReimburseBatch = {
      ...draft,
      id: nextSequentialId('rbatch-new', this.batchSeq),
      status: 'collecting',
      createdAt: now,
      updatedAt: now,
    };
    this.sdb.tx(() => this.sdb.insertRow('reimburse_batches', batch.id, batch));
    return batch;
  }

  updateBatch(id: string, patch: ReimburseBatchPatch): ReimburseBatch | undefined {
    const prior = this.getBatch(id);
    if (!prior) return undefined;
    const updated: ReimburseBatch = { ...prior, ...patch, id, updatedAt: this.clock.now().toISOString() };
    this.sdb.tx(() => this.sdb.updateRow('reimburse_batches', id, updated));
    return updated;
  }

  listPayouts(): ReimbursePayout[] {
    return this.sdb.allRows<ReimbursePayout>('reimburse_payouts').map((row) => parseStoredPayout(row));
  }

  getPayout(id: string): ReimbursePayout | undefined {
    const row = this.sdb.getRow<ReimbursePayout>('reimburse_payouts', id);
    return row ? parseStoredPayout(row) : undefined;
  }

  createPayout(draft: ReimbursePayoutDraft): ReimbursePayout {
    const payout: ReimbursePayout = {
      ...draft,
      id: nextSequentialId('rpayout-new', this.payoutSeq),
      recordedAt: this.clock.now().toISOString(),
    };
    this.sdb.tx(() => this.sdb.insertRow('reimburse_payouts', payout.id, payout));
    return payout;
  }

  appendEntryEvidence(entryId: string, evidence: ReimburseEvidence, patch: ReimburseEntryPatch = {}): ReimburseEntry | undefined {
    const prior = this.getEntry(entryId);
    if (!prior) return undefined;
    const updated: ReimburseEntry = {
      ...prior,
      ...patch,
      evidence: [...prior.evidence, evidence],
      updatedAt: this.clock.now().toISOString(),
    };
    this.sdb.tx(() => this.sdb.updateRow('reimburse_entries', entryId, updated));
    return updated;
  }

  removeEntryEvidence(entryId: string, evidenceId: string, patch: ReimburseEntryPatch = {}): ReimburseEntry | undefined {
    const prior = this.getEntry(entryId);
    if (!prior || !prior.evidence.some((item) => item.id === evidenceId)) return undefined;
    const updated: ReimburseEntry = {
      ...prior,
      ...patch,
      evidence: prior.evidence.filter((item) => item.id !== evidenceId),
      updatedAt: this.clock.now().toISOString(),
    };
    this.sdb.tx(() => this.sdb.updateRow('reimburse_entries', entryId, updated));
    return updated;
  }

  appendEvidenceDownload(draft: ReimburseEvidenceDownloadDraft): ReimburseEvidenceDownload {
    const log: ReimburseEvidenceDownload = {
      ...draft,
      id: nextSequentialId('revdl-new', this.downloadSeq),
      at: this.clock.now().toISOString(),
    };
    this.sdb.tx(() => this.sdb.insertRow('reimburse_evidence_downloads', log.id, log));
    return log;
  }

  listEvidenceDownloads(entryId: string): ReimburseEvidenceDownload[] {
    return this.sdb.allRows<ReimburseEvidenceDownload>('reimburse_evidence_downloads')
      .filter((log) => log.entryId === entryId);
  }

  getProfile(): ReimburseProfile {
    const profile = this.sdb.getRow<unknown>(REIMBURSE_PROFILE_TABLE, PROFILE_ID);
    if (profile === undefined) throw new Error('reimburse_profile 单例不存在');
    return ReimburseProfileSchema.parse(profile);
  }

  updateProfile(profile: ReimburseProfile): ReimburseProfile {
    const validated = ReimburseProfileSchema.parse(profile);
    if (this.sdb.updateRow(REIMBURSE_PROFILE_TABLE, PROFILE_ID, validated) !== 1) {
      throw new Error('reimburse_profile 单例不存在，拒绝隐式创建');
    }
    return validated;
  }
}
