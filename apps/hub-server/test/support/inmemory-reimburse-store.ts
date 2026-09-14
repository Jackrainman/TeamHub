import { GOVERNANCE_SCENARIO_NOW, ReimburseProfileSchema } from '@teamhub/hub-contracts';
import type {
  ReimburseBatch,
  ReimburseEntry,
  ReimburseEvidence,
  ReimburseEvidenceDownload,
  ReimburseProfile,
} from '@teamhub/hub-contracts';
import { FixedClock } from '../../src/clock.js';
import type { Clock } from '../../src/clock.js';
import type { ReimburseStockInPort } from '../../src/modules/reimburse/service.js';
import { cloneArrayFields } from '../../src/store/clone-snapshot.js';
import {
  emptyReimburseSnapshot,
  type ReimburseBatchDraft,
  type ReimburseBatchPatch,
  type ReimburseEntryDraft,
  type ReimburseEntryPatch,
  type ReimburseEvidenceDownloadDraft,
  type ReimburseEvidenceDraft,
  type ReimburseSnapshot,
  type ReimburseRepository,
} from '../../src/modules/reimburse/repository.js';

const REIMBURSE_ARRAY_FIELDS: (keyof ReimburseSnapshot)[] = ['entries', 'batches'];

export class InMemoryReimburseStore implements ReimburseRepository, ReimburseStockInPort {
  private readonly snapshot: ReimburseSnapshot;
  private readonly clock: Clock;
  private entrySeq: number;
  private batchSeq: number;
  private evidenceSeq: number;
  private downloadSeq: number;
  private readonly evidenceDownloads: ReimburseEvidenceDownload[] = [];

  constructor(
    seed: ReimburseSnapshot = emptyReimburseSnapshot(),
    clock: Clock = new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW)),
  ) {
    this.snapshot = cloneArrayFields(seed, REIMBURSE_ARRAY_FIELDS);
    this.clock = clock;
    this.entrySeq = this.snapshot.entries.length;
    this.batchSeq = this.snapshot.batches.length;
    this.evidenceSeq = this.snapshot.entries.reduce((sum, entry) => sum + (entry.evidence?.length ?? 0), 0);
    this.downloadSeq = 0;
  }

  listEntries(): ReimburseEntry[] {
    return [...this.snapshot.entries];
  }

  getEntry(id: string): ReimburseEntry | undefined {
    return this.readEntryForStockIn(id);
  }

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
      evidence: [],
      id: `reimb-new-${++this.entrySeq}`,
      createdAt: now,
      updatedAt: now,
    };
    this.snapshot.entries.push(entry);
    return entry;
  }

  updateEntry(id: string, patch: ReimburseEntryPatch): ReimburseEntry | undefined {
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

  listBatches(): ReimburseBatch[] {
    return [...this.snapshot.batches];
  }

  getBatch(id: string): ReimburseBatch | undefined {
    return this.snapshot.batches.find((batch) => batch.id === id);
  }

  createBatch(draft: ReimburseBatchDraft): ReimburseBatch {
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

  updateBatch(id: string, patch: ReimburseBatchPatch): ReimburseBatch | undefined {
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

  appendEntryEvidence(
    entryId: string,
    draft: ReimburseEvidenceDraft,
  ): { entry: ReimburseEntry; evidence: ReimburseEvidence } | undefined {
    const index = this.snapshot.entries.findIndex((entry) => entry.id === entryId);
    if (index < 0) return undefined;
    const evidence: ReimburseEvidence = { ...draft, id: `revd-new-${++this.evidenceSeq}` };
    const updated: ReimburseEntry = {
      ...this.snapshot.entries[index],
      evidence: [...(this.snapshot.entries[index].evidence ?? []), evidence],
      updatedAt: this.clock.now().toISOString(),
    };
    this.snapshot.entries[index] = updated;
    return { entry: updated, evidence };
  }

  removeEntryEvidence(entryId: string, evidenceId: string): ReimburseEntry | undefined {
    const index = this.snapshot.entries.findIndex((entry) => entry.id === entryId);
    if (index < 0) return undefined;
    const prior = this.snapshot.entries[index];
    if (!(prior.evidence ?? []).some((item) => item.id === evidenceId)) return undefined;
    const updated: ReimburseEntry = {
      ...prior,
      evidence: (prior.evidence ?? []).filter((item) => item.id !== evidenceId),
      updatedAt: this.clock.now().toISOString(),
    };
    this.snapshot.entries[index] = updated;
    return updated;
  }

  appendEvidenceDownload(draft: ReimburseEvidenceDownloadDraft): ReimburseEvidenceDownload {
    const log: ReimburseEvidenceDownload = {
      ...draft,
      id: `revdl-new-${++this.downloadSeq}`,
      at: this.clock.now().toISOString(),
    };
    this.evidenceDownloads.push(log);
    return log;
  }

  listEvidenceDownloads(entryId: string): ReimburseEvidenceDownload[] {
    return this.evidenceDownloads.filter((log) => log.entryId === entryId);
  }

  getProfile(): ReimburseProfile {
    return { ...this.snapshot.profile };
  }

  updateProfile(profile: ReimburseProfile): ReimburseProfile {
    this.snapshot.profile = ReimburseProfileSchema.parse(profile);
    return this.getProfile();
  }
}
