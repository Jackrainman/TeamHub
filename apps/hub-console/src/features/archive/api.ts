import {
  ArtifactsResponseSchema,
  CreateArtifactResponseSchema,
  UploadArtifactResponseSchema,
  type ArtifactsResponse,
  type CreateArtifactRequest,
  type CreateArtifactResponse,
  type UploadArtifactResponse,
} from '@teamhub/hub-contracts';
import type { HttpContext } from '../../api/http';
import { fetchJson, postFormData, postJson } from '../../api/http';

/**
 * 归档物域 API 分段（ARCH-UNIFY A4，照 features/reimburse/api.ts 模式；前身 segments/domain.ts 的
 * artifact 段）。端点对照 server modules/archive/routes.ts。I0：归档物永无人维度。
 */
export interface ArchiveSegment {
  getArtifacts(): Promise<ArtifactsResponse>;
  createArtifact(req: CreateArtifactRequest): Promise<CreateArtifactResponse>;
  uploadArtifactFile(id: string, file: File): Promise<UploadArtifactResponse>;
}

export function createArchiveSegment(ctx: HttpContext): ArchiveSegment {
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
  };
}
