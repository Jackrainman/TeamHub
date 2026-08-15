import { DEFAULT_REIMBURSE_PROFILE } from '@teamhub/hub-contracts';
import type {
  ReimburseBatch,
  ReimburseEntry,
  ReimburseProfile,
  UpdateReimburseBatchRequest,
  UpdateReimburseEntryRequest,
} from '@teamhub/hub-contracts';

export interface ReimburseSnapshot {
  entries: ReimburseEntry[];
  batches: ReimburseBatch[];
  profile: ReimburseProfile;
}

export type ReimburseEntryDraft = Omit<ReimburseEntry, 'id' | 'createdAt' | 'updatedAt'>;
export type ReimburseBatchDraft = Omit<
  ReimburseBatch,
  'id' | 'status' | 'createdAt' | 'updatedAt'
>;
export type ReimburseEntryPatch = UpdateReimburseEntryRequest;
export type ReimburseBatchPatch = UpdateReimburseBatchRequest;

/** 报账域唯一 repository port；生产仅由统一 SQLite 实现，测试 fake 位于 test/support。 */
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
  getProfile(): ReimburseProfile;
  updateProfile(profile: ReimburseProfile): ReimburseProfile;
}

export function emptyReimburseSnapshot(): ReimburseSnapshot {
  return {
    entries: [],
    batches: [],
    profile: { ...DEFAULT_REIMBURSE_PROFILE },
  };
}
