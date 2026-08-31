import {
  CreatePartActionResponseSchema,
  CreatePartTypeResponseSchema,
  InventoryImportReportSchema,
  InventoryPreviewResponseSchema,
  InventoryResponseSchema,
  type CreatePartActionRequest,
  type CreatePartActionResponse,
  type CreatePartTypeRequest,
  type CreatePartTypeResponse,
  type InventoryImportReport,
  type InventoryImportRow,
  type InventoryPreviewResponse,
  type InventoryResponse,
} from '@teamhub/hub-contracts';
import type { HttpContext } from '../../api/http';
import { fetchJson, postFormData, postJson } from '../../api/http';

/**
 * 库存域 API 分段（ARCH-UNIFY A4，照 features/reimburse/api.ts 模式；前身 segments/domain.ts 的
 * inventory 段）。端点对照 server modules/inventory/routes.ts：
 *  - GET /api/inventory 服务端已派生占用矩阵 + 缺料告警，前端只渲染；
 *  - preview 只解析不落库（行内编辑后走 importInventoryRows JSON 双收形态）；
 *  - I0：动作来源由服务端钉 human，客户端不传 recordedBy。
 */
export interface InventorySegment {
  getInventory(): Promise<InventoryResponse>;
  upsertPartType(req: CreatePartTypeRequest): Promise<CreatePartTypeResponse>;
  recordPartAction(req: CreatePartActionRequest): Promise<CreatePartActionResponse>;
  inventoryTemplateUrl(): string;
  previewInventory(file: File): Promise<InventoryPreviewResponse>;
  importInventoryRows(rows: InventoryImportRow[]): Promise<InventoryImportReport>;
}

export function createInventorySegment(ctx: HttpContext): InventorySegment {
  const { baseUrl, fetcher, writeToken } = ctx;
  return {
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
