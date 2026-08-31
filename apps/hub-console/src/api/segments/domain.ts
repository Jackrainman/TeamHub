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
import type { HttpContext } from '../http';
import { fetchJson, postJson, postMultiFormData } from '../http';

export interface DomainSegment {
  getKbSimilar(params: KbSimilarParams): Promise<KbSimilarResponse>;
  closeoutKb(req: KbCloseoutRequest): Promise<KbCloseoutResponse>;
  importKbDocs(files: File[]): Promise<KbImportDocsReport>;
}

export function createDomainSegment(ctx: HttpContext): DomainSegment {
  const { baseUrl, fetcher, writeToken } = ctx;
  return {
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
  };
}
