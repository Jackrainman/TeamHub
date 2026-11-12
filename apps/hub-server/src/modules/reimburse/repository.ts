import { DEFAULT_REIMBURSE_PROFILE } from '@teamhub/hub-contracts';
import type {
  CreateReimburseEntryRequest,
  ReimburseBatch,
  ReimburseEntry,
  ReimburseEvidence,
  ReimburseEvidenceDownload,
  ReimbursePayout,
  ReimburseProfile,
  UpdateReimburseBatchRequest,
} from '@teamhub/hub-contracts';

export interface ReimburseSnapshot {
  entries: ReimburseEntry[];
  batches: ReimburseBatch[];
  payouts: ReimbursePayout[];
  profile: ReimburseProfile;
}

export type ReimburseEntryDraft = Omit<
  ReimburseEntry,
  'id' | 'createdAt' | 'updatedAt' | 'evidence' | 'workflowStatus' | 'revision'
  | 'recognitionConfirmedRevision' | 'checkedRevision' | 'reviewedRevision'
  | 'approvedAmountFen' | 'reviewNote' | 'returnReason' | 'payoutId' | 'history'
> & { creationRequest?: { id: string; fingerprint: string } };
export type StoredReimburseEntry = ReimburseEntry & Pick<ReimburseEntryDraft, 'creationRequest'>;
export type ReimburseEntryInput = CreateReimburseEntryRequest & Pick<ReimburseEntry, 'memberId' | 'batchId'>;
/** Repository 只接内部已鉴权补丁；请求中的 expectedRevision/changeReason 不得写入 JSON 行。 */
export type ReimburseEntryPatch = Partial<Omit<ReimburseEntry, 'id' | 'projectId' | 'memberId' | 'createdAt'>>;
export type ReimburseBatchDraft = Omit<ReimburseBatch, 'id' | 'status' | 'createdAt' | 'updatedAt'>;
export type ReimburseBatchPatch = UpdateReimburseBatchRequest;
export type ReimburseEvidenceDownloadDraft = Omit<ReimburseEvidenceDownload, 'id' | 'at'>;
export type ReimbursePayoutDraft = Omit<ReimbursePayout, 'id' | 'recordedAt'> & {
  creationRequest?: { id: string; fingerprint: string };
};
export type StoredReimbursePayout = ReimbursePayout & Pick<ReimbursePayoutDraft, 'creationRequest'>;

/** 报销域唯一 repository port；生产仅由统一 SQLite 实现，测试 fake 位于 test/support。 */
export interface ReimburseRepository {
  listEntries(): ReimburseEntry[];
  getEntry(id: string): ReimburseEntry | undefined;
  findEntryByInvoiceNo(invoiceNo: string): ReimburseEntry | undefined;
  createEntry(draft: ReimburseEntryDraft): ReimburseEntry;
  updateEntry(id: string, patch: ReimburseEntryPatch): ReimburseEntry | undefined;
  listBatches(): ReimburseBatch[];
  getBatch(id: string): ReimburseBatch | undefined;
  createBatch(draft: ReimburseBatchDraft): ReimburseBatch;
  updateBatch(id: string, patch: ReimburseBatchPatch): ReimburseBatch | undefined;
  listPayouts(): ReimbursePayout[];
  getPayout(id: string): ReimbursePayout | undefined;
  createPayout(draft: ReimbursePayoutDraft): ReimbursePayout;
  getProfile(): ReimburseProfile;
  updateProfile(profile: ReimburseProfile): ReimburseProfile;
  appendEntryEvidence(entryId: string, evidence: ReimburseEvidence, patch?: ReimburseEntryPatch): ReimburseEntry | undefined;
  removeEntryEvidence(entryId: string, evidenceId: string, patch?: ReimburseEntryPatch): ReimburseEntry | undefined;
  appendEvidenceDownload(draft: ReimburseEvidenceDownloadDraft): ReimburseEvidenceDownload;
  listEvidenceDownloads(entryId: string): ReimburseEvidenceDownload[];
}

export interface ReimburseEvidenceStorage {
  dir(): string | null;
  sha256(buf: Buffer): string;
  write(dir: string, id: string, ext: string, buf: Buffer): Promise<string>;
  read(dir: string, id: string): Promise<{ filename: string; ext: string; content: Buffer } | null>;
  remove(dir: string, id: string): Promise<void>;
}

export function emptyReimburseSnapshot(): ReimburseSnapshot {
  return {
    entries: [],
    batches: [],
    payouts: [],
    profile: { ...DEFAULT_REIMBURSE_PROFILE },
  };
}
