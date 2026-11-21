import {
  CreateReimburseEntryResponseSchema, UpdateReimburseEntryResponseSchema,
  ReimburseBatchResponseSchema, ReimburseEntriesResponseSchema, ReimburseBatchesResponseSchema,
  GetReimburseProfileResponseSchema, UpdateReimburseProfileResponseSchema,
  ReimburseEvidenceListResponseSchema, UploadReimburseEvidenceResponseSchema,
  DeleteReimburseEvidenceResponseSchema, ReimburseEntryActionResponseSchema,
  ReimbursePayoutResponseSchema, ReimbursePayoutsResponseSchema, ReimburseSummaryResponseSchema,
  ReimburseImportJobResponseSchema, ReimburseImportJobsResponseSchema,
  type CreateReimburseEntryRequest, type CreateReimburseEntryResponse,
  type UpdateReimburseEntryRequest, type UpdateReimburseEntryResponse,
  type CreateReimburseBatchRequest, type UpdateReimburseBatchRequest,
  type ReimburseBatchResponse, type ReimburseEntriesResponse, type ReimburseEntryScope, type ReimburseBatchesResponse,
  type GetReimburseProfileResponse, type UpdateReimburseProfileRequest, type UpdateReimburseProfileResponse,
  type ReimburseEvidenceKind, type ReimburseEvidenceListResponse,
  type UploadReimburseEvidenceResponse, type DeleteReimburseEvidenceResponse,
  type ReimburseEntryAction, type ReimburseEntryActionRequest, type ReimburseEntryActionResponse,
  type CreateReimbursePayoutRequest, type ReimbursePayoutResponse, type ReimbursePayoutsResponse,
  type ReimburseSummaryQuery, type ReimburseSummaryResponse, type ReimburseExportRequest,
  type UpdateReimburseEvidenceRequest,
  type ReimburseImportJobResponse, type ReimburseImportJobsResponse, type ConfirmReimburseImportRequest,
} from '@teamhub/hub-contracts';
import type { HttpContext } from '../../api/http';
import { fetchJson, postFormData, postJson, postMultiFormData, sendJson } from '../../api/http';

export interface ReimburseSegment {
  getReimburseEntries(scope?: ReimburseEntryScope): Promise<ReimburseEntriesResponse>;
  createReimburseEntry(req: CreateReimburseEntryRequest): Promise<CreateReimburseEntryResponse>;
  updateReimburseEntry(id: string, req: UpdateReimburseEntryRequest): Promise<UpdateReimburseEntryResponse>;
  getReimburseBatches(): Promise<ReimburseBatchesResponse>;
  getReimburseProfile(): Promise<GetReimburseProfileResponse>;
  updateReimburseProfile(req: UpdateReimburseProfileRequest): Promise<UpdateReimburseProfileResponse>;
  createReimburseBatch(req: CreateReimburseBatchRequest): Promise<ReimburseBatchResponse>;
  updateReimburseBatch(id: string, req: UpdateReimburseBatchRequest): Promise<ReimburseBatchResponse>;
  getReimburseEvidence(id: string): Promise<ReimburseEvidenceListResponse>;
  uploadReimburseEvidence(id: string, kind: ReimburseEvidenceKind, file: File, expectedRevision: number): Promise<UploadReimburseEvidenceResponse>;
  deleteReimburseEvidence(id: string, evidenceId: string, expectedRevision: number): Promise<DeleteReimburseEvidenceResponse>;
  reimburseEntryAction(id: string, action: ReimburseEntryAction, req: ReimburseEntryActionRequest): Promise<ReimburseEntryActionResponse>;
  createReimbursePayout(req: CreateReimbursePayoutRequest): Promise<ReimbursePayoutResponse>;
  getReimbursePayouts(): Promise<ReimbursePayoutsResponse>;
  getReimburseSummary(req: ReimburseSummaryQuery): Promise<ReimburseSummaryResponse>;
  exportReimburse(req: ReimburseExportRequest): Promise<{ blob: Blob; filename: string }>;
  updateReimburseEvidenceKind(id: string, evidenceId: string, req: UpdateReimburseEvidenceRequest): Promise<UploadReimburseEvidenceResponse>;
  getReimburseImports(): Promise<ReimburseImportJobsResponse>;
  uploadReimburseImport(files: File[]): Promise<ReimburseImportJobResponse>;
  confirmReimburseImport(id: string, req: ConfirmReimburseImportRequest): Promise<ReimburseImportJobResponse>;
  reparseReimburseImport(id: string): Promise<ReimburseImportJobResponse>;
  deleteReimburseImportFile(id: string, fileId: string): Promise<ReimburseImportJobResponse>;
  dismissReimburseImportPair(id: string, pairId: string): Promise<ReimburseImportJobResponse>;
  closeReimburseImport(id: string): Promise<ReimburseImportJobResponse>;
  reimburseImportFileContentUrl(id: string, fileId: string): string;
  reimburseEvidenceDownloadUrl(id: string, evidenceId: string): string;
}
export function createReimburseSegment(ctx: HttpContext): ReimburseSegment {
  const { baseUrl, fetcher, writeToken } = ctx;
  return {
    async getReimburseEntries(scope) {
      const query = scope ? `?scope=${scope}` : '';
      return fetchJson(`${baseUrl}/api/reimburse/entries${query}`, ReimburseEntriesResponseSchema, fetcher);
    },
    async createReimburseEntry(req) { return postJson(`${baseUrl}/api/reimburse/entries`, req, CreateReimburseEntryResponseSchema, fetcher, writeToken); },
    async updateReimburseEntry(id, req) { return sendJson('PATCH', `${baseUrl}/api/reimburse/entries/${encodeURIComponent(id)}`, req, UpdateReimburseEntryResponseSchema, fetcher, writeToken); },
    async getReimburseBatches() { return fetchJson(`${baseUrl}/api/reimburse/batches`, ReimburseBatchesResponseSchema, fetcher); },
    async getReimburseProfile() { return fetchJson(`${baseUrl}/api/reimburse/profile`, GetReimburseProfileResponseSchema, fetcher); },
    async updateReimburseProfile(req) { return sendJson('PUT', `${baseUrl}/api/reimburse/profile`, req, UpdateReimburseProfileResponseSchema, fetcher, writeToken); },
    async createReimburseBatch(req) { return postJson(`${baseUrl}/api/reimburse/batches`, req, ReimburseBatchResponseSchema, fetcher, writeToken); },
    async updateReimburseBatch(id, req) { return sendJson('PATCH', `${baseUrl}/api/reimburse/batches/${encodeURIComponent(id)}`, req, ReimburseBatchResponseSchema, fetcher, writeToken); },
    async getReimburseEvidence(id) { return fetchJson(`${baseUrl}/api/reimburse/entries/${encodeURIComponent(id)}/evidence`, ReimburseEvidenceListResponseSchema, fetcher); },
    async uploadReimburseEvidence(id, kind, file, expectedRevision) {
      return postFormData(`${baseUrl}/api/reimburse/entries/${encodeURIComponent(id)}/evidence`, file,
        UploadReimburseEvidenceResponseSchema, fetcher, writeToken, { kind, expectedRevision: String(expectedRevision) });
    },
    async deleteReimburseEvidence(id, evidenceId, expectedRevision) {
      return sendJson('DELETE', `${baseUrl}/api/reimburse/entries/${encodeURIComponent(id)}/evidence/${encodeURIComponent(evidenceId)}`,
        { expectedRevision }, DeleteReimburseEvidenceResponseSchema, fetcher, writeToken);
    },
    async reimburseEntryAction(id, action, req) {
      return postJson(`${baseUrl}/api/reimburse/entries/${encodeURIComponent(id)}/workflow/${action}`, req,
        ReimburseEntryActionResponseSchema, fetcher, writeToken);
    },
    async createReimbursePayout(req) { return postJson(`${baseUrl}/api/reimburse/payouts`, req, ReimbursePayoutResponseSchema, fetcher, writeToken); },
    async getReimbursePayouts() { return fetchJson(`${baseUrl}/api/reimburse/payouts`, ReimbursePayoutsResponseSchema, fetcher); },
    async getReimburseSummary(req) {
      const query = new URLSearchParams(Object.entries(req).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
      return fetchJson(`${baseUrl}/api/reimburse/summary${query.size ? `?${query}` : ''}`, ReimburseSummaryResponseSchema, fetcher);
    },
    async exportReimburse(req) {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (writeToken) headers.authorization = `Bearer ${writeToken}`;
      const response = await fetcher(`${baseUrl}/api/reimburse/export`, { method: 'POST', headers, body: JSON.stringify(req) });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(`${response.status}: ${body?.detail ?? '导出失败'}`);
      }
      const disposition = response.headers.get('content-disposition') ?? '';
      const encoded = /filename\*=UTF-8''([^;]+)/.exec(disposition)?.[1];
      return { blob: await response.blob(), filename: encoded ? decodeURIComponent(encoded) : '报账导出' };
    },
    updateReimburseEvidenceKind(id, evidenceId, req) {
      return sendJson('PATCH', `${baseUrl}/api/reimburse/entries/${encodeURIComponent(id)}/evidence/${encodeURIComponent(evidenceId)}`,
        req, UploadReimburseEvidenceResponseSchema, fetcher, writeToken);
    },
    async getReimburseImports() { return fetchJson(`${baseUrl}/api/reimburse/imports`, ReimburseImportJobsResponseSchema, fetcher); },
    async uploadReimburseImport(files) {
      return postMultiFormData(`${baseUrl}/api/reimburse/imports`, files, ReimburseImportJobResponseSchema, fetcher, writeToken);
    },
    async confirmReimburseImport(id, req) {
      return postJson(`${baseUrl}/api/reimburse/imports/${encodeURIComponent(id)}/confirm`, req, ReimburseImportJobResponseSchema, fetcher, writeToken);
    },
    async reparseReimburseImport(id) {
      return postJson(`${baseUrl}/api/reimburse/imports/${encodeURIComponent(id)}/reparse`, {}, ReimburseImportJobResponseSchema, fetcher, writeToken);
    },
    async deleteReimburseImportFile(id, fileId) {
      return sendJson('DELETE', `${baseUrl}/api/reimburse/imports/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}`, undefined, ReimburseImportJobResponseSchema, fetcher, writeToken);
    },
    async dismissReimburseImportPair(id, pairId) {
      return postJson(`${baseUrl}/api/reimburse/imports/${encodeURIComponent(id)}/pairs/${encodeURIComponent(pairId)}/dismiss`, {}, ReimburseImportJobResponseSchema, fetcher, writeToken);
    },
    async closeReimburseImport(id) {
      return sendJson('DELETE', `${baseUrl}/api/reimburse/imports/${encodeURIComponent(id)}`, undefined, ReimburseImportJobResponseSchema, fetcher, writeToken);
    },
    reimburseImportFileContentUrl(id, fileId) {
      return `${baseUrl}/api/reimburse/imports/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}/content`;
    },
    reimburseEvidenceDownloadUrl(id, evidenceId) {
      return `${baseUrl}/api/reimburse/entries/${encodeURIComponent(id)}/evidence/${encodeURIComponent(evidenceId)}/download`;
    },
  };
}
