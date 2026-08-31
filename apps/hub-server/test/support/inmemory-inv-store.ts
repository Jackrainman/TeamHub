import {
  GOVERNANCE_SCENARIO_NOW,
  InvalidPartActionError,
  applyPartAction,
  deriveShortfalls,
  inventoryScenarioFixture,
} from '@teamhub/hub-contracts';
import type {
  InventoryImportRow,
  InventorySnapshot,
  PartAction,
  PartType,
  TrackedPart,
} from '@teamhub/hub-contracts';
import { FixedClock } from '../../src/clock.js';
import type { Clock } from '../../src/clock.js';
import type {
  InventoryStockInActionDraft,
  InventoryStockInPartDraft,
  InventoryStockInPort,
} from '../../src/modules/reimburse/service.js';
import { cloneArrayFields } from '../../src/store/clone-snapshot.js';
import type {
  InventoryImportOutcome,
  InventoryRepository,
  PartActionDraft,
  PartTypeDraft,
} from '../../src/modules/inventory/repository.js';

/** 库存快照的三数组字段（写方法可能 push/replace 的集合）——构造期克隆隔离 + getInventorySnapshot 浅拷贝共用。 */
const INVENTORY_ARRAY_FIELDS: (keyof InventorySnapshot)[] = [
  'partTypes',
  'trackedParts',
  'actions',
];

/**
 * 库存 / BOM 内存参考实现（INV-BOM-CORE）：默认 seed `inventoryScenarioFixture`（GM6020/C620/主控/M4 +
 * 个体实例 + 一句话快记历史），让 `GET /api/inventory` 第一请求即有可派生矩阵（与 InMemoryPmRepository/KbStore 对称）。
 * 进程重启丢失为预期；持久层见 `旧生产 Store`（注入 options.invStore）。
 *
 * 动作语义委托纯函数 `applyPartAction`（hub-contracts），本类只负责 id / 时间戳 / recordedBy 包装 + 落数组
 * （组合复用、零漂移，等同 旧生产 Store 复用 InMemoryPmRepository）。非法迁移由 applyPartAction 抛
 * InvalidPartActionError，路由捕获后转 400。
 */
export class InMemoryInvStore implements InventoryRepository, InventoryStockInPort {
  private readonly snapshot: InventorySnapshot;
  private readonly clock: Clock;
  // 单调自增计数器（构造期 = seed 数组 length）：createX 用 `++seq` 生成 id，永不回退。
  private partTypeSeq: number;
  private actionSeq: number;

  constructor(
    seed: InventorySnapshot = inventoryScenarioFixture,
    clock: Clock = new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW)),
  ) {
    this.snapshot = cloneArrayFields(seed, INVENTORY_ARRAY_FIELDS);
    this.clock = clock;
    this.partTypeSeq = this.snapshot.partTypes.length;
    this.actionSeq = this.snapshot.actions.length;
  }

  async getInventorySnapshot(): Promise<InventorySnapshot> {
    return this.readStockInSnapshot();
  }

  readStockInSnapshot(): InventorySnapshot {
    // M7：返回浅拷贝（顶层 + 三数组克隆，与构造期同一份克隆纪律），防外部 push/splice 绕过白名单 mutate live。
    return cloneArrayFields(this.snapshot, INVENTORY_ARRAY_FIELDS);
  }

  /**
   * @internal 持久层回滚专用：返回**可变的** live 快照引用（写方法 replace/push 的同一对象），
   * 让 旧生产 Store 在 persist() 失败时撤回刚写的内存元素（不对外公开，正常读走 getInventorySnapshot）。
   */
  snapshotForRollback(): InventorySnapshot {
    return this.snapshot;
  }

  /**
   * 盘点建底 / 补料 / 调阈值。带 id 命中既有 → 合并更新（保留原 lastCountedAt，bump updatedAt）；
   * 否则创建（id=`parttype-new-N`，lastCountedAt=now=盘点建底首次计数）。
   */
  async upsertPartType(draft: PartTypeDraft): Promise<PartType> {
    return this.upsertStockInPartType(draft, this.clock.now());
  }

  upsertStockInPartType(
    draft: InventoryStockInPartDraft,
    occurredAt: Date,
  ): PartType {
    const now = occurredAt.toISOString();
    if (draft.id) {
      const idx = this.snapshot.partTypes.findIndex((p) => p.id === draft.id);
      if (idx >= 0) {
        const prior = this.snapshot.partTypes[idx];
        const updated: PartType = {
          ...prior,
          ...draft,
          id: prior.id,
          lastCountedAt: prior.lastCountedAt, // 调阈值/补料不重置盘点时刻（盘点走 stocktake 动作）
          updatedAt: now,
        };
        this.snapshot.partTypes[idx] = updated;
        return updated;
      }
    }
    const { id: _ignored, ...rest } = draft;
    void _ignored;
    const partType: PartType = {
      ...rest,
      id: `parttype-new-${++this.partTypeSeq}`,
      lastCountedAt: now,
      updatedAt: now,
    };
    this.snapshot.partTypes.push(partType);
    return partType;
  }

  /**
   * 库存批量导入（INV-BULK-IMPORT 刀⑪）：partNumber 幂等 upsert。同件号更新 name/category/unit
   * （lowStockThreshold 行里给了才覆盖、未给保留既有），**totalQuantity = 覆盖**（CSV 全量盘点口径，
   * 重导同表幂等不翻倍）；trackIndividually / allocations / lastCountedAt 不动既有行。新行钉
   * trackIndividually=false、allocations=[]、projectId=快照项目、lastCountedAt=now（盘点建底首计）。
   * 单行异常只进 failed（行号随行）不落该行、不中断整批；**绝不删**库里有但表里没有的零件。
   */
  async importPartTypes(rows: readonly InventoryImportRow[]): Promise<InventoryImportOutcome> {
    const now = this.clock.now().toISOString();
    const created: string[] = [];
    const updated: string[] = [];
    const failed: InventoryImportOutcome['failed'] = [];
    for (const row of rows) {
      try {
        const idx = this.snapshot.partTypes.findIndex((p) => p.partNumber === row.partNumber);
        if (idx === -1) {
          const partType: PartType = {
            id: `parttype-new-${++this.partTypeSeq}`,
            projectId: this.snapshot.projectId,
            partNumber: row.partNumber,
            name: row.name,
            category: row.category,
            unit: row.unit,
            trackIndividually: false, // 导入不产个体追踪；要追踪走单条新建表单
            totalQuantity: row.totalQuantity,
            allocations: [], // 新建行无机器人占用，矩阵从空起（同单条新建）
            lowStockThreshold: row.lowStockThreshold ?? 0,
            lastCountedAt: now,
            updatedAt: now,
          };
          this.snapshot.partTypes.push(partType);
          created.push(row.partNumber);
        } else {
          const prior = this.snapshot.partTypes[idx];
          const partType: PartType = {
            ...prior, // trackIndividually / allocations / lastCountedAt / projectId 全保留
            name: row.name,
            category: row.category,
            unit: row.unit,
            totalQuantity: row.totalQuantity, // 覆盖（全量盘点口径），不累加
            lowStockThreshold: row.lowStockThreshold ?? prior.lowStockThreshold,
            updatedAt: now,
          };
          this.snapshot.partTypes[idx] = partType;
          updated.push(row.partNumber);
        }
      } catch (err) {
        // 防御：行已 zod 预验，正常不至；任一单行异常只拒该行，不中断整批。
        failed.push({
          line: row.line ?? 0,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { created, updated, failed };
  }

  /**
   * 记一条动作并应用其效果。先按 applyPartAction 改 PartType（+ 个体件），再 append PartAction。
   * 非法迁移（未知 partType / 未知个体件 / 负库存 / used 超 total / 缺持有者）抛 InvalidPartActionError。
   */
  async recordPartAction(draft: PartActionDraft): Promise<PartAction> {
    return this.recordStockInAction(draft, this.clock.now());
  }

  recordStockInAction(
    draft: InventoryStockInActionDraft,
    occurredAt: Date,
  ): PartAction {
    const now = occurredAt.toISOString();
    const ptIdx = this.snapshot.partTypes.findIndex((p) => p.id === draft.partTypeId);
    if (ptIdx < 0) {
      throw new InvalidPartActionError(`未知零件类型: ${draft.partTypeId}`);
    }
    let trackedIdx = -1;
    let tracked: TrackedPart | null = null;
    if (draft.trackedPartId) {
      trackedIdx = this.snapshot.trackedParts.findIndex(
        (t) => t.id === draft.trackedPartId,
      );
      if (trackedIdx < 0) {
        throw new InvalidPartActionError(`未知个体件: ${draft.trackedPartId}`);
      }
      tracked = this.snapshot.trackedParts[trackedIdx];
    }

    // applyPartAction 抛 InvalidPartActionError 时此处未改任何数组（先算后写），无需回滚。
    const effect = applyPartAction(
      this.snapshot.partTypes[ptIdx],
      tracked,
      {
        kind: draft.kind,
        quantityDelta: draft.quantityDelta,
        fromHolder: draft.fromHolder,
        toHolder: draft.toHolder,
      },
      now,
    );
    this.snapshot.partTypes[ptIdx] = effect.partType;
    if (trackedIdx >= 0 && effect.trackedPart) {
      this.snapshot.trackedParts[trackedIdx] = effect.trackedPart;
    }

    const action: PartAction = {
      id: `act-new-${++this.actionSeq}`,
      projectId: draft.projectId,
      partTypeId: draft.partTypeId,
      trackedPartId: draft.trackedPartId,
      kind: draft.kind,
      quantityDelta: draft.quantityDelta,
      fromHolder: draft.fromHolder,
      toHolder: draft.toHolder,
      note: draft.note,
      // REIMBURSE-PROC：入库来源 + 关联报账条目（仅 restock 有意义；optional，旧调用方不传则无此键）。
      acquisition: draft.acquisition,
      reimburseEntryId: draft.reimburseEntryId,
      reimburseItemIndex: draft.reimburseItemIndex,
      recordedBy: { source: draft.source, at: now }, // I0：绝无 memberId
      recordedAt: now,
    };
    this.snapshot.actions.push(action);
    return action;
  }

  async listShortfalls(): Promise<PartType[]> {
    return deriveShortfalls(this.snapshot);
  }
}
