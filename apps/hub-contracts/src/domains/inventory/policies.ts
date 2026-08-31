import { IDLE_HOLDER } from './model.js';
import type {
  InventorySnapshot,
  PartAcquisition,
  PartAction,
  PartActionKind,
  PartAllocation,
  PartType,
  TrackedPart,
} from './model.js';

/**
 * 库存域纯派生 + 动作语义（domain 层，无 IO）。单测：inventory.test.ts。
 * 实体 schema 见 ./model.js；HTTP 写契约见 ./requests.js；CSV 导入见 ./import.js。
 */

/**
 * 机器人列输入（最小结构，与 PRESENCE-01 解耦）：SharedResource 当前无 `displayCode` 字段，故标 optional——
 * SharedResource（无 displayCode）结构上可赋值给本类型，库存内核今天即可独立工作；PRESENCE 给资源补
 * `displayCode`（赛季+位置+版本派生）后，矩阵机器人列自动从 name 切到 displayCode、无需改本函数。
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

/** 每 PartType 一行：闲置数 + 零件×机器人 占用矩阵的一行。 */
export interface InventoryLedgerRow {
  partType: PartType;
  idle: number; // totalQuantity − Σ(used + reserved)；不画「在造」列
  perResource: InventoryLedgerPerResource[];
}

/** 占用合计（used + reserved）跨全部 allocations。 */
function sumAllocated(partType: PartType): number {
  return partType.allocations.reduce((s, a) => s + a.used + a.reserved, 0);
}

/**
 * 库存总表派生：每 PartType 一行 `{ partType, idle, perResource }`。
 * `idle = totalQuantity − Σ(used + reserved)`（决定 F：预留=已从仓库拿出、从闲置池扣减）。
 * perResource 按传入机器人列顺序展开（机器人列复用 SharedResource，显示 displayCode ?? name）；该机器人无 allocation → 0/0。
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

/** 来源构成（derivePartAcquisition 输出）：自购/赞助两桶各自累计入库数量。 */
export interface PartAcquisitionSummary {
  selfPurchased: number;
  sponsored: number;
}

/**
 * 某 PartType 的入库来源构成派生（REIMBURSE-PROC）：只统计 `kind='restock'` 且带 `acquisition`
 * 的动作，按 quantityDelta 绝对值入桶；**无 acquisition 的老动作不计入任一桶**（历史存量来源
 * 不可考，不伪造）。损坏/拆装等动作与来源无关，天然跳过。
 */
export function derivePartAcquisition(
  partTypeId: string,
  actions: PartAction[],
): PartAcquisitionSummary {
  const summary: PartAcquisitionSummary = { selfPurchased: 0, sponsored: 0 };
  for (const action of actions) {
    if (action.partTypeId !== partTypeId || action.kind !== 'restock') {
      continue;
    }
    const qty = Math.abs(action.quantityDelta);
    if (action.acquisition === 'selfPurchase') {
      summary.selfPurchased += qty;
    } else if (action.acquisition === 'sponsored') {
      summary.sponsored += qty;
    }
  }
  return summary;
}

// ──────────────────────────────────────────────────────────────────────────
// 动作语义（纯迁移转换 + 不变量校验）——各 repository 实现复用，inventory.test.ts 单测
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

/** 取（或新建）某机器人的 allocation 行。 */
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
      throw new InvalidPartActionError(`机器人 ${a.resourceId} 的占用不能为负`);
    }
    sum += a.used + a.reserved;
  }
  if (sum > totalQuantity) {
    throw new InvalidPartActionError('各机器人占用合计超过总数（used 超 total）');
  }
}

function requireResource(holder: string | null, label: string): string {
  if (!holder || holder === IDLE_HOLDER) {
    throw new InvalidPartActionError(`${label}必须指定一台机器人（resourceId）`);
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
      allocFor(allocations, requireResource(input.toHolder, '装机')).used += qty;
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
          currentHolder: requireResource(input.toHolder, '装机'),
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
