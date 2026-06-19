import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  InventorySnapshotSchema,
  inventoryScenarioFixture,
} from '@teamhub/hub-contracts';
import type {
  InventorySnapshot,
  PartAction,
  PartType,
} from '@teamhub/hub-contracts';
import type { Clock } from '../clock.js';
import { cloneArrayFields } from './clone-snapshot.js';
import { InMemoryInvStore } from './mock-inv-store.js';
import type { InvStore, PartActionDraft, PartTypeDraft } from './gov-store.js';

/**
 * 库存 / BOM JSON 落盘实现（INV-BOM-CORE 持久层）：进程重启不丢，盘点 / 拆装 / 一句话快记累积。
 *
 * 与 FileGovStore / FileKbStore 同一套纪律（结构逐条镜像）：
 *  - 单一真相在服务器：写入只落本 Store + 整文件原子落盘（写 tmp 再 rename）。
 *  - writeChain 串行化（H2 失败隔离）：并发写不互相覆盖，一次磁盘抖动不会让写链永久 rejected。
 *  - 零额外依赖（只用 node:fs）。
 *  - 加载 fail-closed：文件不存在 → seed 起头并落一次盘；文件存在但解析/校验失败 → **抛**，不静默覆盖团队数据。
 *
 * 写白名单（upsertPartType / recordPartAction）的 id / 时间戳 / 动作语义 **复用 InMemoryInvStore**
 * （组合，零重复 / 零漂移）；本 Store 只在每次成功写后追加一次 persist()，失败回滚刚改的内存。
 */
const INVENTORY_ARRAY_FIELDS: (keyof InventorySnapshot)[] = [
  'partTypes',
  'trackedParts',
  'actions',
];

function cloneSnapshot(seed: InventorySnapshot): InventorySnapshot {
  return cloneArrayFields(seed, INVENTORY_ARRAY_FIELDS);
}

interface SnapshotArrays {
  partTypes: PartType[];
  trackedParts: InventorySnapshot['trackedParts'];
  actions: PartAction[];
}

export class FileInvStore implements InvStore {
  private readonly inner: InMemoryInvStore;
  private readonly filePath: string;
  private writeChain: Promise<void> = Promise.resolve();

  private constructor(
    filePath: string,
    snapshot: InventorySnapshot,
    clock?: Clock,
  ) {
    this.filePath = filePath;
    this.inner = clock
      ? new InMemoryInvStore(snapshot, clock)
      : new InMemoryInvStore(snapshot);
  }

  /** 异步构造：从 dataFile 加载（不存在则 seed 起头并落盘）。 */
  static async create(
    filePath: string,
    seed: InventorySnapshot = inventoryScenarioFixture,
    clock?: Clock,
  ): Promise<FileInvStore> {
    let raw: string | null = null;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (err) {
      if ((err as { code?: string }).code !== 'ENOENT') throw err;
    }

    if (raw === null) {
      const store = new FileInvStore(filePath, cloneSnapshot(seed), clock);
      await store.persist();
      return store;
    }

    const snapshot = InventorySnapshotSchema.parse(JSON.parse(raw));
    return new FileInvStore(filePath, snapshot, clock);
  }

  async getInventorySnapshot(): Promise<InventorySnapshot> {
    return this.inner.getInventorySnapshot();
  }

  async listShortfalls(): Promise<PartType[]> {
    return this.inner.listShortfalls();
  }

  async upsertPartType(draft: PartTypeDraft): Promise<PartType> {
    const before = this.capture();
    const partType = await this.inner.upsertPartType(draft);
    await this.persistOrRollback(before);
    return partType;
  }

  async recordPartAction(draft: PartActionDraft): Promise<PartAction> {
    // applyPartAction 在写数组前先校验、非法即抛（无内存副作用），故 before 仅在 persist 失败时用到。
    const before = this.capture();
    const action = await this.inner.recordPartAction(draft);
    await this.persistOrRollback(before);
    return action;
  }

  /** 写前快照三数组（浅拷贝，元素被写方法整体替换/追加，故引用快照足以还原）。 */
  private capture(): SnapshotArrays {
    const s = this.inner.snapshotForRollback();
    return {
      partTypes: [...s.partTypes],
      trackedParts: [...s.trackedParts],
      actions: [...s.actions],
    };
  }

  private restore(before: SnapshotArrays): void {
    const s = this.inner.snapshotForRollback();
    s.partTypes.splice(0, s.partTypes.length, ...before.partTypes);
    s.trackedParts.splice(0, s.trackedParts.length, ...before.trackedParts);
    s.actions.splice(0, s.actions.length, ...before.actions);
  }

  private async persistOrRollback(before: SnapshotArrays): Promise<void> {
    try {
      await this.persist();
    } catch (err) {
      this.restore(before);
      throw err;
    }
  }

  /** 原子写：写 tmp 再 rename，串行化避免并发覆盖（H2 失败隔离）。 */
  private async persist(): Promise<void> {
    const op = this.writeChain.then(() => this.writeOnce());
    this.writeChain = op.catch(() => undefined);
    return op;
  }

  private async writeOnce(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    const snapshot = await this.inner.getInventorySnapshot();
    try {
      await writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
      await rename(tmp, this.filePath);
    } catch (err) {
      await unlink(tmp).catch(() => {});
      throw err;
    }
  }
}
