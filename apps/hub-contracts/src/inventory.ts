import { z } from 'zod';

import { isoDateTimeSchema } from './common.js';

/**
 * 库存 / BOM 第三支柱 buildable-now 内核（INV-BOM-CORE，D-042 决策 4 / D-072 §3.4）。
 * 权威实现规格见 `docs/design/inv-bom-core.md`（schema / 动作语义 / API / UI / seed 已全锁）。
 *
 * 两实体 + 一条统一动作日志：
 *  - `PartType`  — 按数量件（绝大多数）：存总数 + 各车占用（allocations）。
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
 */

export const PartCategorySchema = z.enum([
  'motor',
  'esc',
  'controller',
  'mechanical',
  'electronic',
  'other',
]);

export const PartActionKindSchema = z.enum([
  'stocktake', // 盘点建底：设 totalQuantity + lastCountedAt
  'restock', // 补料：totalQuantity += |delta|
  'mount', // 装车：allocations[toResource].used += |delta|
  'dismount', // 拆下：allocations[fromResource].used -= |delta|
  'reserve', // 预留：allocations[toResource].reserved += |delta|（从闲置池扣减、记在该车、禁他用）
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

/** 持有者引用：resourceId（某台车）或 'idle'（货架 / 闲置池）。 */
export const IDLE_HOLDER = 'idle';

/** 某 PartType 在某台车上的占用：used=已装、reserved=已从仓库拿出禁他用（仍记在该车、从闲置池扣减）。 */
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
  allocations: z.array(PartAllocationSchema), // 各车已用 / 预留
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
  reserved: z.boolean(), // 已拿出记在车上、禁他用
  status: z.enum(['ok', 'damaged', 'retired']),
  updatedAt: isoDateTimeSchema,
});

/** 动作来源凭证：只到 source（I0：绝无 memberId）+ 录入时刻。 */
export const PartActionRecordedBySchema = z.object({
  source: PartActionSourceSchema,
  at: isoDateTimeSchema,
});

/** append-only 动作日志一条（绝不删）。承载按数量件 quantityDelta + 个体件归属迁移 + 一句话快记 note。 */
export const PartActionSchema = z.object({
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
});

/** 库存读快照（与 GovernanceSnapshot / KbSnapshot 对称，独立于 GovernanceSnapshot）。 */
export const InventorySnapshotSchema = z.object({
  projectId: z.string().min(1),
  partTypes: z.array(PartTypeSchema),
  trackedParts: z.array(TrackedPartSchema),
  actions: z.array(PartActionSchema),
});

export type PartCategory = z.infer<typeof PartCategorySchema>;
export type PartActionKind = z.infer<typeof PartActionKindSchema>;
export type PartActionSource = z.infer<typeof PartActionSourceSchema>;
export type PartAllocation = z.infer<typeof PartAllocationSchema>;
export type PartType = z.infer<typeof PartTypeSchema>;
export type TrackedPart = z.infer<typeof TrackedPartSchema>;
export type PartAction = z.infer<typeof PartActionSchema>;
export type InventorySnapshot = z.infer<typeof InventorySnapshotSchema>;

// ──────────────────────────────────────────────────────────────────────────
// 纯派生函数（+单测，inventory.test.ts）
// ──────────────────────────────────────────────────────────────────────────

/**
 * 车列输入（最小结构，与 PRESENCE-01 解耦）：SharedResource 当前无 `displayCode` 字段，故标 optional——
 * SharedResource（无 displayCode）结构上可赋值给本类型，库存内核今天即可独立工作；PRESENCE 给资源补
 * `displayCode`（赛季+位置+版本派生）后，矩阵车列自动从 name 切到 displayCode、无需改本函数。
 */
export interface InventoryResourceRef {
  id: string;
  name: string;
  displayCode?: string;
}

export interface InventoryLedgerPerResource {
  resourceId: string;
  displayCode: string; // displayCode ?? name
  used: number;
  reserved: number;
}

/** 每 PartType 一行：闲置数 + 零件×车 占用矩阵的一行。 */
export interface InventoryLedgerRow {
  partType: PartType;
  idle: number; // totalQuantity − Σ(used + reserved)；不画「在造」列
  perResource: InventoryLedgerPerResource[];
}

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

/** 占用合计（used + reserved）跨全部 allocations。 */
function sumAllocated(partType: PartType): number {
  return partType.allocations.reduce((s, a) => s + a.used + a.reserved, 0);
}

/**
 * 库存总表派生：每 PartType 一行 `{ partType, idle, perResource }`。
 * `idle = totalQuantity − Σ(used + reserved)`（决定 F：预留=已从仓库拿出、从闲置池扣减）。
 * perResource 按传入车列顺序展开（车列复用 SharedResource，显示 displayCode ?? name）；该车无 allocation → 0/0。
 */
export function deriveInventoryLedger(
  snapshot: InventorySnapshot,
  resources: InventoryResourceRef[],
): InventoryLedgerRow[] {
  return snapshot.partTypes.map((partType) => {
    const idle = partType.totalQuantity - sumAllocated(partType);
    const perResource: InventoryLedgerPerResource[] = resources.map((r) => {
      const alloc = partType.allocations.find((a) => a.resourceId === r.id);
      return {
        resourceId: r.id,
        displayCode: r.displayCode ?? r.name,
        used: alloc?.used ?? 0,
        reserved: alloc?.reserved ?? 0,
      };
    });
    return { partType, idle, perResource };
  });
}

/** 缺料告警：闲置数 `< lowStockThreshold` 的 PartType 列表。 */
export function deriveShortfalls(snapshot: InventorySnapshot): PartType[] {
  return snapshot.partTypes.filter(
    (pt) => pt.totalQuantity - sumAllocated(pt) < pt.lowStockThreshold,
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 动作语义（纯迁移转换 + 不变量校验）——mock/file InvStore 复用，inventory.test.ts 单测
// ──────────────────────────────────────────────────────────────────────────

/** 非法迁移（负库存 / used 超 total / 缺持有者 / 未知个体件）——路由捕获后转 400，不静默吞。 */
export class InvalidPartActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPartActionError';
  }
}

export interface PartActionInput {
  kind: PartActionKind;
  quantityDelta: number;
  fromHolder: string | null;
  toHolder: string | null;
}

export interface PartActionEffect {
  partType: PartType;
  trackedPart: TrackedPart | null;
}

function cloneAllocations(partType: PartType): PartAllocation[] {
  return partType.allocations.map((a) => ({ ...a }));
}

/** 取（或新建）某车的 allocation 行。 */
function allocFor(allocations: PartAllocation[], resourceId: string): PartAllocation {
  let row = allocations.find((a) => a.resourceId === resourceId);
  if (!row) {
    row = { resourceId, used: 0, reserved: 0 };
    allocations.push(row);
  }
  return row;
}

/** 校验单一不变量：total≥0、各 allocation used/reserved≥0、Σ(used+reserved)≤total（idle≥0）。 */
function assertInvariants(allocations: PartAllocation[], totalQuantity: number): void {
  if (totalQuantity < 0) {
    throw new InvalidPartActionError('总数不能为负（库存不足）');
  }
  let sum = 0;
  for (const a of allocations) {
    if (a.used < 0 || a.reserved < 0) {
      throw new InvalidPartActionError(`车 ${a.resourceId} 的占用不能为负`);
    }
    sum += a.used + a.reserved;
  }
  if (sum > totalQuantity) {
    throw new InvalidPartActionError('各车占用合计超过总数（used 超 total）');
  }
}

function requireResource(holder: string | null, label: string): string {
  if (!holder || holder === IDLE_HOLDER) {
    throw new InvalidPartActionError(`${label}必须指定一台车（resourceId）`);
  }
  return holder;
}

/**
 * 应用一条动作到 PartType（按数量件账）+ 可选 TrackedPart（个体件归属），返回更新后的不可变副本；
 * 非法迁移抛 InvalidPartActionError。**统一账模型**：矩阵真相恒由 PartType.allocations 派生，故个体件
 * 动作同时推进数量账（按 quantityDelta）+ 个体实例归属——保证矩阵反映已装个体件、idle 永不为负。
 */
export function applyPartAction(
  partType: PartType,
  trackedPart: TrackedPart | null,
  input: PartActionInput,
  now: string,
): PartActionEffect {
  const qty = Math.abs(input.quantityDelta);
  // 非盘点动作必须实际搬动至少 1 个单位（统一账模型下个体件 mount 也须移 1 单位，否则矩阵失真）。
  if (input.kind !== 'stocktake' && qty < 1) {
    throw new InvalidPartActionError('quantityDelta 必须为非零整数');
  }

  const allocations = cloneAllocations(partType);
  let totalQuantity = partType.totalQuantity;
  let lastCountedAt = partType.lastCountedAt;

  switch (input.kind) {
    case 'stocktake':
      // 盘点建底：设绝对总数（quantityDelta 承载新总数）+ lastCountedAt。
      totalQuantity = qty;
      lastCountedAt = now;
      break;
    case 'restock':
      totalQuantity += qty;
      break;
    case 'mount':
      allocFor(allocations, requireResource(input.toHolder, '装车')).used += qty;
      break;
    case 'dismount':
      allocFor(allocations, requireResource(input.fromHolder, '拆下')).used -= qty;
      break;
    case 'reserve':
      allocFor(allocations, requireResource(input.toHolder, '预留')).reserved += qty;
      break;
    case 'release':
      allocFor(allocations, requireResource(input.toHolder, '释放预留')).reserved -= qty;
      break;
    case 'damage':
      // 一句话快记主路径：总数减一（mounted 个体件须先 dismount，否则 idle 转负被 assertInvariants 拒）。
      totalQuantity -= qty;
      break;
  }

  assertInvariants(allocations, totalQuantity);

  const nextPartType: PartType = {
    ...partType,
    totalQuantity,
    allocations,
    lastCountedAt,
    updatedAt: now,
  };

  // 个体件归属迁移（仅装/拆/预留/释放/损坏有个体效果；盘点/补料对个体件 no-op）。
  let nextTracked: TrackedPart | null = trackedPart;
  if (trackedPart) {
    switch (input.kind) {
      case 'mount':
        nextTracked = {
          ...trackedPart,
          currentHolder: requireResource(input.toHolder, '装车'),
          reserved: false,
          updatedAt: now,
        };
        break;
      case 'dismount':
        nextTracked = { ...trackedPart, currentHolder: IDLE_HOLDER, updatedAt: now };
        break;
      case 'reserve':
        nextTracked = {
          ...trackedPart,
          reserved: true,
          currentHolder: requireResource(input.toHolder, '预留'),
          updatedAt: now,
        };
        break;
      case 'release':
        nextTracked = { ...trackedPart, reserved: false, updatedAt: now };
        break;
      case 'damage':
        nextTracked = { ...trackedPart, status: 'damaged', updatedAt: now };
        break;
      default:
        nextTracked = trackedPart;
    }
  }

  return { partType: nextPartType, trackedPart: nextTracked };
}

// ──────────────────────────────────────────────────────────────────────────
// API 读 / 写契约（跨端单一源，server + console 共用）
// ──────────────────────────────────────────────────────────────────────────

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
 */
export const CreatePartActionRequestSchema = PartActionSchema.omit({
  id: true,
  recordedAt: true,
  recordedBy: true,
});
export const CreatePartActionResponseSchema = z.object({ action: PartActionSchema });

export type InventoryResponse = z.infer<typeof InventoryResponseSchema>;
export type CreatePartTypeRequest = z.infer<typeof CreatePartTypeRequestSchema>;
export type CreatePartTypeResponse = z.infer<typeof CreatePartTypeResponseSchema>;
export type CreatePartActionRequest = z.infer<typeof CreatePartActionRequestSchema>;
export type CreatePartActionResponse = z.infer<typeof CreatePartActionResponseSchema>;
