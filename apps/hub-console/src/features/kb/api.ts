import {
  KbCloseoutResponseSchema,
  KbImportDocsReportSchema,
  KbSimilarResponseSchema,
  type KbCloseoutRequest,
  type KbCloseoutResponse,
  type KbImportDocsReport,
  type KbSimilarResponse,
} from '@teamhub/hub-contracts';
import type { HttpContext } from '../../api/http';
import { fetchJson, postJson, postMultiFormData } from '../../api/http';

/** GET /api/kb/similar 查询入参（前端表单 → querystring）。前端专用、不跨端，留在本地。 */
export interface KbSimilarParams {
  symptom: string;
  /** 可选项目范围限定；server KbSimilarQuerySchema 早已支持，传入后语料只从该项目取。不传则全库检索。 */
  projectId?: string;
  tags?: string[];
  limit?: number;
  minScore?: number;
}

/**
 * 知识库域 API 分段（ARCH-UNIFY A4，照 features/reimburse/api.ts 模式；前身 segments/domain.ts 的
 * kb 段 + schemas/kb.ts 转发层）。端点对照 server modules/knowledge/routes.ts。
 * A4/C4：相似检索响应的 note 是「只列候选、不断言同因」护栏措辞，前端原样呈现。
 */
export interface KnowledgeSegment {
  getKbSimilar(params: KbSimilarParams): Promise<KbSimilarResponse>;
  closeoutKb(req: KbCloseoutRequest): Promise<KbCloseoutResponse>;
  importKbDocs(files: File[]): Promise<KbImportDocsReport>;
}

export function createKnowledgeSegment(ctx: HttpContext): KnowledgeSegment {
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
