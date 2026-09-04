import { z } from 'zod';

import { isoDateTimeSchema } from '../../common.js';

/**
 * 库存 / BOM 第三支柱 buildable-now 内核（INV-BOM-CORE，D-042 决策 4 / D-072 §3.4）。
 * 当前领域规格见 `docs/domains/inventory.md`。
 *
 * 两实体 + 一条统一动作日志：
 *  - `PartType`  — 按数量件（绝大多数）：存总数 + 各机器人占用（allocations）。
 *  - `TrackedPart` — 单件追踪个体，**仅电机/电调/主控**（贵重件）；螺丝等琐碎件不建实例。
 *  - `PartAction` — **唯一 append-only 动作日志**，同时承载按数量件的 quantityDelta 与个体件的归属迁移，
 *    是「对话记账（坏了一个 3508）+ 拆装血缘」的落点。损坏=kind=damage、预留=kind=reserve（非独立实体）。
 *
 * 红线（结构约束，AGENTS §5 I0/G2/C3 + 本文 §1）：
 *  - **I0**：`recordedBy` 永无 memberId（只到来源 source=human/aiSuggested/hermes/derived），
 *    无任何「谁拆了多少件」的按人聚合视图。
 *  - **G2**：INV 自有真相、不回写飞书 Bitable。
 *  - **C3 / D-072 §3.4**：个体件拆装只移 `currentHolder`、**绝不删 TrackedPart**（保血缘）；
 *    写白名单仅 upsertPartType / recordPartAction，无通用 delete。
 *
 * REIMBURSE-PROC 扩展（报销联动一期）：`PartAction` 加 optional `acquisition`（入库来源：
 * selfPurchase=垫付自购 / sponsored=赞助，仅 restock 有意义）+ `reimburseEntryId`（关联的
 * 报销条目）+ `reimburseItemIndex`（关联的发票明细下标）。**PartType 不加来源/价格字段**——同件号可混合来源、不同批次不同价：来源在动作上，
 * 价格在报销条目上；来源构成由 `derivePartAcquisition` 从动作日志派生。旧动作行无新字段 →
 * optional parse 天然通过，三实现零迁移；无 acquisition 的老动作不计入任一来源桶（历史来源不可考，不伪造）。
 */

// HUB-MODULARIZATION 第6步（词汇注入收口）：由闭集 z.enum 放宽为开放 string——BOM 类目是租户词汇
// （机器人 motor/esc/controller vs 游戏工作室 GPU/CPU/devkit/license/consumable，见
// docs/domains/system.md 的词汇覆盖），非核心结构。机器人租户已知值见
// `verticals/robotics.ts:ROBOTICS_PART_CATEGORY_VALUES`；闭集校验（如需要）下沉到路由层
// VocabularyRegistry 校验器（尚未实现，同 schemas.ts:ArtifactRefSchema.kind 过渡态）。
export const PartCategorySchema = z.string().min(1);

export const PartActionKindSchema = z.enum([
  'stocktake', // 盘点建底：设 totalQuantity + lastCountedAt
  'restock', // 补料：totalQuantity += |delta|
  'mount', // 装机：allocations[toResource].used += |delta|
  'dismount', // 拆下：allocations[fromResource].used -= |delta|
  'reserve', // 预留：allocations[toResource].reserved += |delta|（从闲置池扣减、记在该机器人、禁他用）
  'release', // 释放预留：allocations[toResource].reserved -= |delta|
  'damage', // 损坏（一句话快记主路径）：totalQuantity -= |delta|
]);

/** 动作来源（I0：绝无 memberId）。console 录入钉 human；Hermes 将来自动记账钉 hermes。 */
export const PartActionSourceSchema = z.enum([
  'human',
  'aiSuggested',
  'hermes',
  'derived',
]);

/**
 * 入库来源（REIMBURSE-PROC，仅 kind='restock' 有意义）：selfPurchase=成员垫付自购（报销联动
 * 落账）/ sponsored=赞助入库（不关联报销条目）。旧动作无此字段 → 来源未知，不计入任何桶。
 */
export const PartAcquisitionSchema = z.enum(['selfPurchase', 'sponsored']);

/** 持有者引用：resourceId（某台机器人）或 'idle'（货架 / 闲置池）。 */
export const IDLE_HOLDER = 'idle';

/** 某 PartType 在某台机器人上的占用：used=已装、reserved=已从仓库拿出禁他用（仍记在该机器人、从闲置池扣减）。 */
export const PartAllocationSchema = z.object({
  resourceId: z.string().min(1),
  used: z.number().int().nonnegative(),
  reserved: z.number().int().nonnegative(),
});

export const PartTypeSchema = z.object({
  id: z.string().min(1), // parttype-xxx
  projectId: z.string().min(1),
  partNumber: z.string().min(1), // "GM6020" / "C620" / "main-controller"
  name: z.string().min(1),
  category: PartCategorySchema,
  unit: z.string().min(1), // "个"
  trackIndividually: z.boolean(), // true 仅电机/电调/主控
  totalQuantity: z.number().int().nonnegative(),
  allocations: z.array(PartAllocationSchema), // 各机器人已用 / 预留
  lowStockThreshold: z.number().int().nonnegative(), // 闲置低于此 → 缺料告警
  lastCountedAt: isoDateTimeSchema.nullable(),
  updatedAt: isoDateTimeSchema,
});

/** 单件追踪个体（仅 trackIndividually=true 的件有实例）。拆装只移 currentHolder、绝不删（保血缘）。 */
export const TrackedPartSchema = z.object({
  id: z.string().min(1), // part-xxx
  projectId: z.string().min(1),
  partTypeId: z.string().min(1),
  serialLabel: z.string().min(1).nullable(), // 队内编号
  currentHolder: z.string().min(1), // resourceId | 'idle'
  reserved: z.boolean(), // 已拿出记在机器人上、禁他用
  status: z.enum(['ok', 'damaged', 'retired']),
  updatedAt: isoDateTimeSchema,
});

/** 动作来源凭证：只到 source（I0：绝无 memberId）+ 录入时刻。 */
export const PartActionRecordedBySchema = z.object({
  source: PartActionSourceSchema,
  at: isoDateTimeSchema,
});

/** append-only 动作日志一条（绝不删）。承载按数量件 quantityDelta + 个体件归属迁移 + 一句话快记 note。 */
const PartActionBaseSchema = z.object({
  id: z.string().min(1), // act-xxx
  projectId: z.string().min(1),
  partTypeId: z.string().min(1),
  trackedPartId: z.string().min(1).nullable(),
  kind: PartActionKindSchema,
  quantityDelta: z.number().int(), // 按数量件用；个体件填 0/1
  fromHolder: z.string().min(1).nullable(),
  toHolder: z.string().min(1).nullable(),
  note: z.string().min(1).nullable(), // 一句话快记："坏了一个3508、烧了"
  recordedBy: PartActionRecordedBySchema, // I0：绝无 memberId
  recordedAt: isoDateTimeSchema,
  // REIMBURSE-PROC：入库来源 + 关联报销条目（仅 restock 有意义；optional 向后兼容，见文件头）。
  acquisition: PartAcquisitionSchema.optional(),
  reimburseEntryId: z.string().min(1).optional(),
  reimburseItemIndex: z.number().int().nonnegative().optional(),
});

interface ReimburseActionLinkInput {
  kind: PartActionKind;
  acquisition?: PartAcquisition;
  reimburseEntryId?: string;
  reimburseItemIndex?: number;
}

function validateReimburseActionLink(
  action: ReimburseActionLinkInput,
  context: z.RefinementCtx,
): void {
  const hasEntry = action.reimburseEntryId !== undefined;
  const hasItem = action.reimburseItemIndex !== undefined;
  if (!hasEntry && !hasItem) {
    return;
  }
  if (action.kind !== 'restock' || action.acquisition !== 'selfPurchase') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reimburseEntryId'],
      message: '报销关联只允许用于 selfPurchase restock 动作',
    });
  }
  if (!hasEntry) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reimburseEntryId'],
      message: 'reimburseItemIndex 必须同时关联 reimburseEntryId',
    });
  }
  if (!hasItem) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reimburseItemIndex'],
      message: '报销入库动作必须关联结构化明细下标',
    });
  }
}

export const PartActionSchema = PartActionBaseSchema.superRefine(validateReimburseActionLink);

/** 库存读快照（与 GovernanceSnapshot / KbSnapshot 对称，独立于 GovernanceSnapshot）。 */
export const InventorySnapshotSchema = z.object({
  projectId: z.string().min(1),
  partTypes: z.array(PartTypeSchema),
  trackedParts: z.array(TrackedPartSchema),
  actions: z.array(PartActionSchema),
});

export const InventoryLedgerPerResourceSchema = z.object({
  resourceId: z.string().min(1),
  displayCode: z.string().min(1),
  used: z.number().int().nonnegative(),
  reserved: z.number().int().nonnegative(),
});

export const InventoryLedgerRowSchema = z.object({
  partType: PartTypeSchema,
  // idle 允许为负数（数据不一致时如实反映、不静默夹断），故 int 不加 nonnegative。
  idle: z.number().int(),
  perResource: z.array(InventoryLedgerPerResourceSchema),
});

export type PartCategory = z.infer<typeof PartCategorySchema>;
export type PartActionKind = z.infer<typeof PartActionKindSchema>;
export type PartActionSource = z.infer<typeof PartActionSourceSchema>;
export type PartAcquisition = z.infer<typeof PartAcquisitionSchema>;
export type PartAllocation = z.infer<typeof PartAllocationSchema>;
export type PartType = z.infer<typeof PartTypeSchema>;
export type TrackedPart = z.infer<typeof TrackedPartSchema>;
export type PartAction = z.infer<typeof PartActionSchema>;
export type InventorySnapshot = z.infer<typeof InventorySnapshotSchema>;

// 写契约所需的非空基础 schema（requests.ts 从实体 schema omit 生成，须同域可见）。
export { PartActionBaseSchema, validateReimburseActionLink };
