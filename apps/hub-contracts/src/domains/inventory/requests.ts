import { z } from 'zod';

import {
  InventoryLedgerRowSchema,
  PartActionBaseSchema,
  PartActionSchema,
  PartTypeSchema,
  TrackedPartSchema,
  validateReimburseActionLink,
} from './model.js';

/**
 * 库存域 API 读 / 写契约（跨端单一源，server + console 共用）。
 */

/**
 * GET /api/inventory → 零件 + 个体件 + 库存总表派生 + 缺料告警 + 动作日志（倒序由前端做）。
 * `actions` 承载 §5④「拆装/记账历史」列表（append-only）；**I0**：recordedBy 只到 source、绝无 memberId。
 */
export const InventoryResponseSchema = z.object({
  partTypes: z.array(PartTypeSchema),
  trackedParts: z.array(TrackedPartSchema),
  ledger: z.array(InventoryLedgerRowSchema),
  shortfalls: z.array(PartTypeSchema),
  actions: z.array(PartActionSchema),
});

/**
 * POST /api/inventory/part-types（盘点建底 / 补料 / 调阈值）：人本字段；store 补 lastCountedAt / updatedAt。
 * 带 id 命中 → 更新；否则创建（store 钉 parttype-new-N）。
 */
export const CreatePartTypeRequestSchema = PartTypeSchema.omit({
  id: true,
  lastCountedAt: true,
  updatedAt: true,
}).extend({
  id: z.string().min(1).optional(),
});
export const CreatePartTypeResponseSchema = z.object({ partType: PartTypeSchema });

/**
 * POST /api/inventory/actions（一句话快记=damage+partTypeId+quantityDelta+note；拆装=mount/dismount；
 * 预留=reserve/release）。**recordedBy 不由客户端给**——server 钉 source=human（C5 来源 seam；I0 绝无 memberId）。
 * Hermes 将来调同一接口自动填（源走 hermes，仍无 memberId）。
 * REIMBURSE-PROC：`acquisition`/`reimburseEntryId` 随 PartActionSchema 自动带入写契约（不在 omit 列表），
 * restock 时可钉来源；报账联动落账走 server 内部调用（acquisition='selfPurchase'）。
 */
export const CreatePartActionRequestSchema = PartActionBaseSchema.omit({
  id: true,
  recordedAt: true,
  recordedBy: true,
}).superRefine(validateReimburseActionLink);
export const CreatePartActionResponseSchema = z.object({ action: PartActionSchema });

export type InventoryResponse = z.infer<typeof InventoryResponseSchema>;
export type CreatePartTypeRequest = z.infer<typeof CreatePartTypeRequestSchema>;
export type CreatePartTypeResponse = z.infer<typeof CreatePartTypeResponseSchema>;
export type CreatePartActionRequest = z.infer<typeof CreatePartActionRequestSchema>;
export type CreatePartActionResponse = z.infer<typeof CreatePartActionResponseSchema>;
