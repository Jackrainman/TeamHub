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
import { FixedClock } from '../../src/clock.js';
import type { Clock } from '../../src/clock.js';
import type { ReimburseStockInPort } from '../../src/modules/reimburse/service.js';
import {
  emptyReimburseSnapshot,
  type ReimburseBatchDraft,
  type ReimburseBatchPatch,
  type ReimburseEntryDraft,
  type ReimburseEntryPatch,
  type ReimburseEvidenceDownloadDraft,
  type ReimbursePayoutDraft,
  type ReimburseSnapshot,
  type ReimburseRepository,
} from '../../src/modules/reimburse/repository.js';

export class InMemoryReimburseStore implements ReimburseRepository, ReimburseStockInPort {
  private readonly snapshot: ReimburseSnapshot;
  private readonly clock: Clock;
  private entrySeq: number;
  private batchSeq: number;
  private payoutSeq: number;
  private downloadSeq = 0;
  private readonly evidenceDownloads: ReimburseEvidenceDownload[] = [];

  constructor(seed: ReimburseSnapshot = emptyReimburseSnapshot(), clock: Clock = new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW))) {
    this.snapshot = {
      entries: seed.entries.map((entry) => ReimburseEntrySchema.parse(entry)),
      batches: seed.batches.map((batch) => ReimburseBatchSchema.parse(batch)),
      payouts: seed.payouts.map((payout) => ReimbursePayoutSchema.parse(payout)),
      profile: ReimburseProfileSchema.parse(seed.profile),
    };
    this.clock = clock;
    this.entrySeq = this.snapshot.entries.length;
    this.batchSeq = this.snapshot.batches.length;
    this.payoutSeq = this.snapshot.payouts.length;
  }

  listEntries(): ReimburseEntry[] { return [...this.snapshot.entries]; }
  getEntry(id: string): ReimburseEntry | undefined { return this.readEntryForStockIn(id); }
  readEntryForStockIn(id: string): ReimburseEntry | undefined {
    return this.snapshot.entries.find((entry) => entry.id === id);
  }
  findEntryByInvoiceNo(invoiceNo: string): ReimburseEntry | undefined {
    return this.snapshot.entries.find((entry) => entry.invoiceNo === invoiceNo);
  }

  createEntry(draft: ReimburseEntryDraft): ReimburseEntry {
    const now = this.clock.now().toISOString();
    const entry: ReimburseEntry = {
      ...draft,
      evidence: [], workflowStatus: 'draft', revision: 1, recognitionConfirmedRevision: null,
      checkedRevision: null, reviewedRevision: null, approvedAmountFen: null, reviewNote: null,
      returnReason: null, payoutId: null,
      history: [{ action: 'created', actorId: draft.memberId, at: now, revision: 1, from: null, to: 'draft', reason: null, changedFields: [] }],
      id: `reimb-new-${++this.entrySeq}`, createdAt: now, updatedAt: now,
    };
    this.snapshot.entries.push(entry);
    return entry;
  }

  updateEntry(id: string, patch: ReimburseEntryPatch): ReimburseEntry | undefined {
    const index = this.snapshot.entries.findIndex((entry) => entry.id === id);
    if (index < 0) return undefined;
    const updated = { ...this.snapshot.entries[index], ...patch, id, updatedAt: this.clock.now().toISOString() };
    this.snapshot.entries[index] = updated;
    return updated;
  }

  listBatches(): ReimburseBatch[] { return [...this.snapshot.batches]; }
  getBatch(id: string): ReimburseBatch | undefined { return this.snapshot.batches.find((batch) => batch.id === id); }
  createBatch(draft: ReimburseBatchDraft): ReimburseBatch {
    const now = this.clock.now().toISOString();
    const batch: ReimburseBatch = { ...draft, id: `rbatch-new-${++this.batchSeq}`, status: 'collecting', createdAt: now, updatedAt: now };
    this.snapshot.batches.push(batch);
    return batch;
  }
  updateBatch(id: string, patch: ReimburseBatchPatch): ReimburseBatch | undefined {
    const index = this.snapshot.batches.findIndex((batch) => batch.id === id);
    if (index < 0) return undefined;
    const updated = { ...this.snapshot.batches[index], ...patch, id, updatedAt: this.clock.now().toISOString() };
    this.snapshot.batches[index] = updated;
    return updated;
  }

  listPayouts(): ReimbursePayout[] { return [...this.snapshot.payouts]; }
  getPayout(id: string): ReimbursePayout | undefined { return this.snapshot.payouts.find((payout) => payout.id === id); }
  createPayout(draft: ReimbursePayoutDraft): ReimbursePayout {
    const payout: ReimbursePayout = {
      ...draft, id: `rpayout-new-${++this.payoutSeq}`, recordedAt: this.clock.now().toISOString(),
    };
    this.snapshot.payouts.push(payout);
    return payout;
  }

  appendEntryEvidence(entryId: string, evidence: ReimburseEvidence, patch: ReimburseEntryPatch = {}): ReimburseEntry | undefined {
    const index = this.snapshot.entries.findIndex((entry) => entry.id === entryId);
    if (index < 0) return undefined;
    const updated = { ...this.snapshot.entries[index], ...patch, evidence: [...this.snapshot.entries[index].evidence, evidence], updatedAt: this.clock.now().toISOString() };
    this.snapshot.entries[index] = updated;
    return updated;
  }
  removeEntryEvidence(entryId: string, evidenceId: string, patch: ReimburseEntryPatch = {}): ReimburseEntry | undefined {
    const index = this.snapshot.entries.findIndex((entry) => entry.id === entryId);
    if (index < 0) return undefined;
    const prior = this.snapshot.entries[index];
    if (!prior.evidence.some((item) => item.id === evidenceId)) return undefined;
    const updated = { ...prior, ...patch, evidence: prior.evidence.filter((item) => item.id !== evidenceId), updatedAt: this.clock.now().toISOString() };
    this.snapshot.entries[index] = updated;
    return updated;
  }
  appendEvidenceDownload(draft: ReimburseEvidenceDownloadDraft): ReimburseEvidenceDownload {
    const log = { ...draft, id: `revdl-new-${++this.downloadSeq}`, at: this.clock.now().toISOString() };
    this.evidenceDownloads.push(log);
    return log;
  }
  listEvidenceDownloads(entryId: string): ReimburseEvidenceDownload[] {
    return this.evidenceDownloads.filter((log) => log.entryId === entryId);
  }
  getProfile(): ReimburseProfile { return { ...this.snapshot.profile }; }
  updateProfile(profile: ReimburseProfile): ReimburseProfile {
    this.snapshot.profile = ReimburseProfileSchema.parse(profile);
    return this.getProfile();
  }
}
