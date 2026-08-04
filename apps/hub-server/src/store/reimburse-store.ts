import { GOVERNANCE_SCENARIO_NOW } from '@teamhub/hub-contracts';
import type {
  ReimburseBatch,
  ReimburseEntry,
  UpdateReimburseBatchRequest,
  UpdateReimburseEntryRequest,
} from '@teamhub/hub-contracts';
import { FixedClock } from '../clock.js';
import type { Clock } from '../clock.js';
import { cloneArrayFields } from './clone-snapshot.js';

/**
 * 报账域读写出入口契约 + 内存参考实现（REIMBURSE-PROC 一期，计划 taskmaster-impulse-steel 阶段 2）。
 *
 * 与 InvStore 同一套纪律（结构逐条镜像 mock-inv-store.ts）：
 *  - 独立域：`ReimburseEntry`/`ReimburseBatch` 不在 GovernanceSnapshot 内，走独立 Store 扩展点
 *    （BuildHubServerOptions.reimburseStore?，缺省 InMemoryReimburseStore 空种子）。
 *  - 写白名单仅 createEntry / updateEntry / createBatch / updateBatch（C3：无通用 delete / list 全家桶；
 *    条目与批次**永不删**，与 inv 动作 append-only 同哲学——错单走 note 标注，不留删除口子）。
 *  - id / 时间戳由 Store 补（`reimb-new-N` / `rbatch-new-N` 单调自增，同 id-sequence L1 纪律）；
 *    建批次 clamp status='collecting'（状态流转只走 updateBatch）。
 *  - **I0**：条目带 memberId 属事实层（钱要还给本人）；按人过滤在路由层（本 Store 回全量，不派生视图）。
 *  - 发票号查重键：`findEntryByInvoiceNo` 全库查找（空号草稿由路由层跳过、不调用本方法）。
 *
 * 持久层见 `FileReimburseStore`（组合本类 + PersistedFile）与 `SqliteReimburseStore`（独立实现）。
 */

/** 报账域快照（File 落盘整文件形状；两数组字段写方法可能 push/replace）。 */
export interface ReimburseSnapshot {
  entries: ReimburseEntry[];
  batches: ReimburseBatch[];
}

/** createEntry 入参：客户端写契约 + 路由钉入的 memberId/batchId；id/createdAt/updatedAt Store 补。 */
export type ReimburseEntryDraft = Omit<ReimburseEntry, 'id' | 'createdAt' | 'updatedAt'>;

/** createBatch 入参：name/projectId；status 由 Store clamp 'collecting'，id/时间戳 Store 补。 */
export type ReimburseBatchDraft = Omit<
  ReimburseBatch,
  'id' | 'status' | 'createdAt' | 'updatedAt'
>;

/** PATCH 白名单（照 contracts 写契约，全 optional）：材料 checklist / 实际物资名称 / 备注 / 装批移出。 */
export type ReimburseEntryPatch = UpdateReimburseEntryRequest;

/** 批次 PATCH 白名单：名称改 / 状态流转（三档全允许，无回退限制——contracts 写契约同款）。 */
export type ReimburseBatchPatch = UpdateReimburseBatchRequest;

export interface ReimburseStore {
  listEntries(): Promise<ReimburseEntry[]>;
  getEntry(id: string): Promise<ReimburseEntry | undefined>;
  /** 发票号全库查重（防重复防护，tidoc 同款）；只查非空号，命中返回既有条目。 */
  findEntryByInvoiceNo(invoiceNo: string): Promise<ReimburseEntry | undefined>;
  /** 新建条目（id=`reimb-new-N`、createdAt/updatedAt=now）。memberId 由路由钉 sessionActor。 */
  createEntry(draft: ReimburseEntryDraft): Promise<ReimburseEntry>;
  /** 白名单 PATCH（材料 checklist / actualItemName / note / batchId 装批移出）；未知 id → undefined（路由 404）。 */
  updateEntry(id: string, patch: ReimburseEntryPatch): Promise<ReimburseEntry | undefined>;
  listBatches(): Promise<ReimburseBatch[]>;
  getBatch(id: string): Promise<ReimburseBatch | undefined>;
  /** 新建批次（id=`rbatch-new-N`，clamp status='collecting'）。 */
  createBatch(draft: ReimburseBatchDraft): Promise<ReimburseBatch>;
  /** 批次名称改 / 状态流转；未知 id → undefined（路由 404）。 */
  updateBatch(id: string, patch: ReimburseBatchPatch): Promise<ReimburseBatch | undefined>;
}

/** 空种子（报账域无演示 fixture——真实垫付数据不伪造；demo 首屏批次区为空属预期）。 */
export function emptyReimburseSnapshot(): ReimburseSnapshot {
  return { entries: [], batches: [] };
}

const REIMBURSE_ARRAY_FIELDS: (keyof ReimburseSnapshot)[] = ['entries', 'batches'];

export class InMemoryReimburseStore implements ReimburseStore {
  private readonly snapshot: ReimburseSnapshot;
  private readonly clock: Clock;
  // 单调自增计数器（构造期 = seed 数组 length）：createX 用 `++seq` 生成 id，永不回退。
  private entrySeq: number;
  private batchSeq: number;

  constructor(
    seed: ReimburseSnapshot = emptyReimburseSnapshot(),
    clock: Clock = new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW)),
  ) {
    this.snapshot = cloneArrayFields(seed, REIMBURSE_ARRAY_FIELDS);
    this.clock = clock;
    this.entrySeq = this.snapshot.entries.length;
    this.batchSeq = this.snapshot.batches.length;
  }

  async listEntries(): Promise<ReimburseEntry[]> {
    return [...this.snapshot.entries];
  }

  async getEntry(id: string): Promise<ReimburseEntry | undefined> {
    return this.snapshot.entries.find((e) => e.id === id);
  }

  async findEntryByInvoiceNo(invoiceNo: string): Promise<ReimburseEntry | undefined> {
    return this.snapshot.entries.find((e) => e.invoiceNo === invoiceNo);
  }

  async createEntry(draft: ReimburseEntryDraft): Promise<ReimburseEntry> {
    const now = this.clock.now().toISOString();
    const entry: ReimburseEntry = {
      ...draft,
      id: `reimb-new-${++this.entrySeq}`,
      createdAt: now,
      updatedAt: now,
    };
    this.snapshot.entries.push(entry);
    return entry;
  }

  async updateEntry(
    id: string,
    patch: ReimburseEntryPatch,
  ): Promise<ReimburseEntry | undefined> {
    const idx = this.snapshot.entries.findIndex((e) => e.id === id);
    if (idx < 0) {
      return undefined;
    }
    const updated: ReimburseEntry = {
      ...this.snapshot.entries[idx],
      ...patch,
      id,
      updatedAt: this.clock.now().toISOString(),
    };
    this.snapshot.entries[idx] = updated;
    return updated;
  }

  async listBatches(): Promise<ReimburseBatch[]> {
    return [...this.snapshot.batches];
  }

  async getBatch(id: string): Promise<ReimburseBatch | undefined> {
    return this.snapshot.batches.find((b) => b.id === id);
  }

  async createBatch(draft: ReimburseBatchDraft): Promise<ReimburseBatch> {
    const now = this.clock.now().toISOString();
    const batch: ReimburseBatch = {
      ...draft,
      id: `rbatch-new-${++this.batchSeq}`,
      status: 'collecting', // clamp：新批次必收集态，状态流转只走 updateBatch
      createdAt: now,
      updatedAt: now,
    };
    this.snapshot.batches.push(batch);
    return batch;
  }

  async updateBatch(
    id: string,
    patch: ReimburseBatchPatch,
  ): Promise<ReimburseBatch | undefined> {
    const idx = this.snapshot.batches.findIndex((b) => b.id === id);
    if (idx < 0) {
      return undefined;
    }
    const updated: ReimburseBatch = {
      ...this.snapshot.batches[idx],
      ...patch,
      id,
      updatedAt: this.clock.now().toISOString(),
    };
    this.snapshot.batches[idx] = updated;
    return updated;
  }

  /**
   * @internal 持久层回滚专用：返回**可变的** live 快照引用（写方法 replace/push 的同一对象），
   * 让 FileReimburseStore 在 persist() 失败时撤回刚写的内存元素（不对外公开，同 InvStore 先例）。
   */
  snapshotForRollback(): ReimburseSnapshot {
    return this.snapshot;
  }
}
