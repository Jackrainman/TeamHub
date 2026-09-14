import {
  CreateReimburseEntryResponseSchema,
  UpdateReimburseEntryResponseSchema,
  ReimburseBatchResponseSchema,
  ReimburseEntriesResponseSchema,
  ReimburseBatchesResponseSchema,
  GetReimburseProfileResponseSchema,
  UpdateReimburseProfileResponseSchema,
  StockInContextResponseSchema,
  StockInResponseSchema,
  ReimburseEvidenceListResponseSchema,
  UploadReimburseEvidenceResponseSchema,
  DeleteReimburseEvidenceResponseSchema,
  type CreateReimburseEntryRequest,
  type CreateReimburseEntryResponse,
  type UpdateReimburseEntryRequest,
  type UpdateReimburseEntryResponse,
  type CreateReimburseBatchRequest,
  type UpdateReimburseBatchRequest,
  type ReimburseBatchResponse,
  type ReimburseEntriesResponse,
  type ReimburseBatchesResponse,
  type GetReimburseProfileResponse,
  type UpdateReimburseProfileRequest,
  type UpdateReimburseProfileResponse,
  type StockInContextResponse,
  type StockInRequest,
  type StockInResponse,
  type ReimburseEvidenceKind,
  type ReimburseEvidenceListResponse,
  type UploadReimburseEvidenceResponse,
  type DeleteReimburseEvidenceResponse,
} from '@teamhub/hub-contracts';
import type { HttpContext } from '../../api/http';
import { fetchJson, postFormData, postJson, sendJson } from '../../api/http';

/**
 * 报销域 API 分段（REIMBURSE-PROC 阶段 3，照 segments/domain.ts 模式）。
 * 端点对照 server modules/reimburse/routes.ts：
 *  - GET entries 服务端已按 actor 过滤（普通成员只回本人，超管回全部）——前端不做二次过滤；
 *  - batches 三端点超管限定（调用侧用 enabled 门控，未授权不发请求）；
 *  - stock-in 入库联动由服务端应用层编排（鉴权=条目本人或超管）；
 *  - evidence 四端点是凭证唯一通道（D-094）：条目对象上永远没有凭证元数据，字节只走鉴权下载链接。
 */
export interface ReimburseSegment {
  getReimburseEntries(): Promise<ReimburseEntriesResponse>;
  createReimburseEntry(
    req: CreateReimburseEntryRequest,
  ): Promise<CreateReimburseEntryResponse>;
  updateReimburseEntry(
    id: string,
    req: UpdateReimburseEntryRequest,
  ): Promise<UpdateReimburseEntryResponse>;
  getReimburseBatches(): Promise<ReimburseBatchesResponse>;
  getReimburseProfile(): Promise<GetReimburseProfileResponse>;
  updateReimburseProfile(
    req: UpdateReimburseProfileRequest,
  ): Promise<UpdateReimburseProfileResponse>;
  getReimburseStockInContext(): Promise<StockInContextResponse>;
  createReimburseBatch(req: CreateReimburseBatchRequest): Promise<ReimburseBatchResponse>;
  updateReimburseBatch(
    id: string,
    req: UpdateReimburseBatchRequest,
  ): Promise<ReimburseBatchResponse>;
  stockInEntry(id: string, req: StockInRequest): Promise<StockInResponse>;
  getReimburseEvidence(id: string): Promise<ReimburseEvidenceListResponse>;
  uploadReimburseEvidence(
    id: string,
    kind: ReimburseEvidenceKind,
    file: File,
  ): Promise<UploadReimburseEvidenceResponse>;
  deleteReimburseEvidence(
    id: string,
    evidenceId: string,
  ): Promise<DeleteReimburseEvidenceResponse>;
  /** 凭证下载链接（cookie 鉴权的 GET，同 artifacts 下载先例）——没有静态路径。 */
  reimburseEvidenceDownloadUrl(id: string, evidenceId: string): string;
}

export function createReimburseSegment(ctx: HttpContext): ReimburseSegment {
  const { baseUrl, fetcher, writeToken } = ctx;
  return {
    async getReimburseEntries() {
      return fetchJson(`${baseUrl}/api/reimburse/entries`, ReimburseEntriesResponseSchema, fetcher);
    },
    async createReimburseEntry(req: CreateReimburseEntryRequest) {
      return postJson(
        `${baseUrl}/api/reimburse/entries`,
        req,
        CreateReimburseEntryResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async updateReimburseEntry(id: string, req: UpdateReimburseEntryRequest) {
      return sendJson(
        'PATCH',
        `${baseUrl}/api/reimburse/entries/${encodeURIComponent(id)}`,
        req,
        UpdateReimburseEntryResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async getReimburseBatches() {
      return fetchJson(`${baseUrl}/api/reimburse/batches`, ReimburseBatchesResponseSchema, fetcher);
    },
    async getReimburseProfile() {
      return fetchJson(`${baseUrl}/api/reimburse/profile`, GetReimburseProfileResponseSchema, fetcher);
    },
    async updateReimburseProfile(req: UpdateReimburseProfileRequest) {
      return sendJson(
        'PUT',
        `${baseUrl}/api/reimburse/profile`,
        req,
        UpdateReimburseProfileResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async getReimburseStockInContext() {
      return fetchJson(`${baseUrl}/api/reimburse/stock-in-context`, StockInContextResponseSchema, fetcher);
    },
    async createReimburseBatch(req: CreateReimburseBatchRequest) {
      return postJson(
        `${baseUrl}/api/reimburse/batches`,
        req,
        ReimburseBatchResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async updateReimburseBatch(id: string, req: UpdateReimburseBatchRequest) {
      return sendJson(
        'PATCH',
        `${baseUrl}/api/reimburse/batches/${encodeURIComponent(id)}`,
        req,
        ReimburseBatchResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async stockInEntry(id: string, req: StockInRequest) {
      return postJson(
        `${baseUrl}/api/reimburse/entries/${encodeURIComponent(id)}/stock-in`,
        req,
        StockInResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async getReimburseEvidence(id: string) {
      return fetchJson(
        `${baseUrl}/api/reimburse/entries/${encodeURIComponent(id)}/evidence`,
        ReimburseEvidenceListResponseSchema,
        fetcher,
      );
    },
    async uploadReimburseEvidence(id: string, kind: ReimburseEvidenceKind, file: File) {
      return postFormData(
        `${baseUrl}/api/reimburse/entries/${encodeURIComponent(id)}/evidence`,
        file,
        UploadReimburseEvidenceResponseSchema,
        fetcher,
        writeToken,
        { kind },
      );
    },
    async deleteReimburseEvidence(id: string, evidenceId: string) {
      return sendJson(
        'DELETE',
        `${baseUrl}/api/reimburse/entries/${encodeURIComponent(id)}/evidence/${encodeURIComponent(evidenceId)}`,
        undefined,
        DeleteReimburseEvidenceResponseSchema,
        fetcher,
        writeToken,
      );
    },
    reimburseEvidenceDownloadUrl(id: string, evidenceId: string) {
      return `${baseUrl}/api/reimburse/entries/${encodeURIComponent(id)}/evidence/${encodeURIComponent(evidenceId)}/download`;
    },
  };
}
