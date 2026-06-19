import {
  GOVERNANCE_SCENARIO_NOW,
  InvalidPartActionError,
  applyPartAction,
  deriveShortfalls,
  inventoryScenarioFixture,
} from '@teamhub/hub-contracts';
import type {
  InventorySnapshot,
  PartAction,
  PartType,
  TrackedPart,
} from '@teamhub/hub-contracts';
import { FixedClock } from '../clock.js';
import type { Clock } from '../clock.js';
import { cloneArrayFields } from './clone-snapshot.js';
import type { InvStore, PartActionDraft, PartTypeDraft } from './gov-store.js';

/** 库存快照的三数组字段（写方法可能 push/replace 的集合）——构造期克隆隔离 + getInventorySnapshot 浅拷贝共用。 */
const INVENTORY_ARRAY_FIELDS: (keyof InventorySnapshot)[] = [
  'partTypes',
  'trackedParts',
  'actions',
];

/**
 * 库存 / BOM 内存参考实现（INV-BOM-CORE）：默认 seed `inventoryScenarioFixture`（GM6020/C620/主控/M4 +
 * 个体实例 + 一句话快记历史），让 `GET /api/inventory` 第一请求即有可派生矩阵（与 InMemoryGovStore/KbStore 对称）。
 * 进程重启丢失为预期；持久层见 `FileInvStore`（注入 options.invStore）。
 *
 * 动作语义委托纯函数 `applyPartAction`（hub-contracts），本类只负责 id / 时间戳 / recordedBy 包装 + 落数组
 * （组合复用、零漂移，等同 FileGovStore 复用 InMemoryGovStore）。非法迁移由 applyPartAction 抛
 * InvalidPartActionError，路由捕获后转 400。
 */
export class InMemoryInvStore implements InvStore {
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
    // M7：返回浅拷贝（顶层 + 三数组克隆，与构造期同一份克隆纪律），防外部 push/splice 绕过白名单 mutate live。
    return cloneArrayFields(this.snapshot, INVENTORY_ARRAY_FIELDS);
  }

  /**
   * @internal 持久层回滚专用：返回**可变的** live 快照引用（写方法 replace/push 的同一对象），
   * 让 FileInvStore 在 persist() 失败时撤回刚写的内存元素（不对外公开，正常读走 getInventorySnapshot）。
   */
  snapshotForRollback(): InventorySnapshot {
    return this.snapshot;
  }

  /**
   * 盘点建底 / 补料 / 调阈值。带 id 命中既有 → 合并更新（保留原 lastCountedAt，bump updatedAt）；
   * 否则创建（id=`parttype-new-N`，lastCountedAt=now=盘点建底首次计数）。
   */
  async upsertPartType(draft: PartTypeDraft): Promise<PartType> {
    const now = this.clock.now().toISOString();
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
   * 记一条动作并应用其效果。先按 applyPartAction 改 PartType（+ 个体件），再 append PartAction。
   * 非法迁移（未知 partType / 未知个体件 / 负库存 / used 超 total / 缺持有者）抛 InvalidPartActionError。
   */
  async recordPartAction(draft: PartActionDraft): Promise<PartAction> {
    const now = this.clock.now().toISOString();
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
