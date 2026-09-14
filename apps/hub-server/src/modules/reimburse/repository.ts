import { DEFAULT_REIMBURSE_PROFILE } from '@teamhub/hub-contracts';
import type {
  ReimburseBatch,
  ReimburseEntry,
  ReimburseEvidence,
  ReimburseEvidenceDownload,
  ReimburseProfile,
  UpdateReimburseBatchRequest,
  UpdateReimburseEntryRequest,
} from '@teamhub/hub-contracts';

export interface ReimburseSnapshot {
  entries: ReimburseEntry[];
  batches: ReimburseBatch[];
  profile: ReimburseProfile;
}

/**
 * 凭证只能经受控上传端点 append，故 draft 类型层面就没有 evidence 键：
 * 创建/更新体注入元数据这条路走不通（D-094）。
 */
export type ReimburseEntryDraft = Omit<
  ReimburseEntry,
  'id' | 'createdAt' | 'updatedAt' | 'evidence'
>;
/** 条目可空键（Create 请求允许省略，service 规整为 null 后再进 repository）。 */
type ReimburseEntryNullableKey =
  | 'invoiceNo'
  | 'invoiceDate'
  | 'seller'
  | 'purchaserName'
  | 'purchaserTaxNo'
  | 'actualItemName'
  | 'note';
export type ReimburseEntryInput = Omit<ReimburseEntryDraft, ReimburseEntryNullableKey> &
  Partial<Pick<ReimburseEntryDraft, ReimburseEntryNullableKey>>;
export type ReimburseBatchDraft = Omit<
  ReimburseBatch,
  'id' | 'status' | 'createdAt' | 'updatedAt'
>;
export type ReimburseEntryPatch = UpdateReimburseEntryRequest;
export type ReimburseBatchPatch = UpdateReimburseBatchRequest;
/** 凭证元数据草稿：id 由 repository 序列生成（与条目/批次 id 同一所有权）。 */
export type ReimburseEvidenceDraft = Omit<ReimburseEvidence, 'id'>;
export type ReimburseEvidenceDownloadDraft = Omit<ReimburseEvidenceDownload, 'id' | 'at'>;

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
  getProfile(): ReimburseProfile;
  updateProfile(profile: ReimburseProfile): ReimburseProfile;
  appendEntryEvidence(
    entryId: string,
    draft: ReimburseEvidenceDraft,
  ): { entry: ReimburseEntry; evidence: ReimburseEvidence } | undefined;
  removeEntryEvidence(entryId: string, evidenceId: string): ReimburseEntry | undefined;
  appendEvidenceDownload(draft: ReimburseEvidenceDownloadDraft): ReimburseEvidenceDownload;
  listEvidenceDownloads(entryId: string): ReimburseEvidenceDownload[];
}

/**
 * 凭证字节存储 port（D-094：字节存受控目录，库内只留指针）。生产唯一实现 =
 * LocalEvidenceFileStorage（TEAMHUB_EVIDENCE_FILES_DIR）；形状与 archive 的
 * ArtifactFileStorage 对齐，日后换对象存储只新增实现。
 */
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
    profile: { ...DEFAULT_REIMBURSE_PROFILE },
  };
}
