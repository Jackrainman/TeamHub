import {
  ArtifactsResponseSchema,
  InventoryImportReportSchema,
  InventoryPreviewResponseSchema,
  type ArtifactsResponse,
  type InventoryImportReport,
  type InventoryImportRow,
  type InventoryPreviewResponse,
} from '@teamhub/hub-contracts';
import {
  KbSimilarResponseSchema,
  KbCloseoutResponseSchema,
  KbImportDocsReportSchema,
  type KbSimilarParams,
  type KbSimilarResponse,
  type KbCloseoutRequest,
  type KbCloseoutResponse,
  type KbImportDocsReport,
} from '../schemas/kb';
import {
  CreateArtifactResponseSchema,
  UploadArtifactResponseSchema,
  type CreateArtifactRequest,
  type CreateArtifactResponse,
  type UploadArtifactResponse,
} from '../schemas/pm';
import {
  InventoryResponseSchema,
  CreatePartTypeResponseSchema,
  CreatePartActionResponseSchema,
  type InventoryResponse,
  type CreatePartTypeRequest,
  type CreatePartTypeResponse,
  type CreatePartActionRequest,
  type CreatePartActionResponse,
} from '../schemas/inv';
import type { HttpContext } from '../http';
import { fetchJson, postJson, postFormData, postMultiFormData } from '../http';

export interface DomainSegment {
  getArtifacts(): Promise<ArtifactsResponse>;
  createArtifact(req: CreateArtifactRequest): Promise<CreateArtifactResponse>;
  uploadArtifactFile(id: string, file: File): Promise<UploadArtifactResponse>;
  getKbSimilar(params: KbSimilarParams): Promise<KbSimilarResponse>;
  closeoutKb(req: KbCloseoutRequest): Promise<KbCloseoutResponse>;
  importKbDocs(files: File[]): Promise<KbImportDocsReport>;
  getInventory(): Promise<InventoryResponse>;
  upsertPartType(req: CreatePartTypeRequest): Promise<CreatePartTypeResponse>;
  recordPartAction(req: CreatePartActionRequest): Promise<CreatePartActionResponse>;
  inventoryTemplateUrl(): string;
  previewInventory(file: File): Promise<InventoryPreviewResponse>;
  importInventoryRows(rows: InventoryImportRow[]): Promise<InventoryImportReport>;
}

export function createDomainSegment(ctx: HttpContext): DomainSegment {
  const { baseUrl, fetcher, writeToken } = ctx;
  return {
    async getArtifacts() {
      return fetchJson(`${baseUrl}/api/artifacts`, ArtifactsResponseSchema, fetcher);
    },
    async createArtifact(req: CreateArtifactRequest) {
      return postJson(`${baseUrl}/api/artifacts`, req, CreateArtifactResponseSchema, fetcher, writeToken);
    },
    async uploadArtifactFile(id: string, file: File) {
      return postFormData(`${baseUrl}/api/artifacts/${encodeURIComponent(id)}/upload`, file, UploadArtifactResponseSchema, fetcher, writeToken);
    },
    async getKbSimilar(params: KbSimilarParams) {
      const qs = new URLSearchParams();
      qs.set('symptom', params.symptom);
      if (params.projectId) qs.set('projectId', params.projectId);
      if (params.tags && params.tags.length > 0) {
        qs.set('tags', params.tags.join(','));
      }
      if (params.limit != null) qs.set('limit', String(params.limit));
      if (params.minScore != null) qs.set('minScore', String(params.minScore));
      return fetchJson(`${baseUrl}/api/kb/similar?${qs.toString()}`, KbSimilarResponseSchema, fetcher);
    },
    async closeoutKb(req: KbCloseoutRequest) {
      return postJson(`${baseUrl}/api/kb/closeout`, req, KbCloseoutResponseSchema, fetcher, writeToken);
    },
    async importKbDocs(files: File[]) {
      return postMultiFormData(`${baseUrl}/api/kb/import-docs`, files, KbImportDocsReportSchema, fetcher, writeToken);
    },
    async getInventory() {
      return fetchJson(`${baseUrl}/api/inventory`, InventoryResponseSchema, fetcher);
    },
    async upsertPartType(req: CreatePartTypeRequest) {
      return postJson(`${baseUrl}/api/inventory/part-types`, req, CreatePartTypeResponseSchema, fetcher, writeToken);
    },
    async recordPartAction(req: CreatePartActionRequest) {
      return postJson(`${baseUrl}/api/inventory/actions`, req, CreatePartActionResponseSchema, fetcher, writeToken);
    },
    inventoryTemplateUrl() {
      return `${baseUrl}/api/inventory/template`;
    },
    async previewInventory(file: File) {
      return postFormData(`${baseUrl}/api/inventory/preview`, file, InventoryPreviewResponseSchema, fetcher, writeToken);
    },
    async importInventoryRows(rows: InventoryImportRow[]) {
      return postJson(`${baseUrl}/api/inventory/import`, { rows }, InventoryImportReportSchema, fetcher, writeToken);
    },
  };
}
