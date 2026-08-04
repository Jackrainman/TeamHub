import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { ReimburseBatchSchema, ReimburseEntrySchema } from '@teamhub/hub-contracts';
import type { ReimburseBatch, ReimburseEntry } from '@teamhub/hub-contracts';
import type { Clock } from '../clock.js';
import { cloneArrayFields } from './clone-snapshot.js';
import { PersistedFile } from './persisted-file.js';
import {
  InMemoryReimburseStore,
  emptyReimburseSnapshot,
} from './reimburse-store.js';
import type {
  ReimburseBatchDraft,
  ReimburseBatchPatch,
  ReimburseEntryDraft,
  ReimburseEntryPatch,
  ReimburseSnapshot,
  ReimburseStore,
} from './reimburse-store.js';

/**
 * 报账域 JSON 落盘实现（REIMBURSE-PROC 持久层，env `TEAMHUB_REIMBURSE_DATA_FILE`）：进程重启不丢。
 *
 * 与 FileInvStore / FileKbStore 同一套纪律（结构逐条镜像）：
 *  - 单一真相在服务器：写入只落本 Store + 整文件原子落盘（写 tmp 再 rename，经 PersistedFile）。
 *  - 串行化 + H2 失败隔离由 PersistedFile 承载：并发写不互相覆盖，一次磁盘抖动不让写链永久 rejected。
 *  - 零额外依赖（只用 node:fs）。
 *  - 加载 fail-closed：文件不存在 → 空种子起头并落一次盘；文件存在但解析/校验失败 → **抛**，不静默覆盖团队数据。
 *
 * 写白名单的 id / 时间戳 **复用 InMemoryReimburseStore**（组合，零重复 / 零漂移）；本 Store 只在每次
 * 成功写后追加一次 persist()，失败回滚刚改的内存（capture/restore 同 FileInvStore 范式）。
 *
 * 落盘文件 schema：contracts 未提供 ReimburseSnapshotSchema（域快照形状属 server 持久层关切，
 * contracts 只导出实体 schema），故这里用实体 schema 组合校验——元素级真相仍单源在 contracts。
 */
const ReimburseSnapshotFileSchema = z.object({
  entries: z.array(ReimburseEntrySchema),
  batches: z.array(ReimburseBatchSchema),
});

const REIMBURSE_ARRAY_FIELDS: (keyof ReimburseSnapshot)[] = ['entries', 'batches'];

function cloneSnapshot(seed: ReimburseSnapshot): ReimburseSnapshot {
  return cloneArrayFields(seed, REIMBURSE_ARRAY_FIELDS);
}

interface SnapshotArrays {
  entries: ReimburseEntry[];
  batches: ReimburseBatch[];
}

export class FileReimburseStore implements ReimburseStore {
  private readonly inner: InMemoryReimburseStore;
  private readonly file: PersistedFile;

  private constructor(filePath: string, snapshot: ReimburseSnapshot, clock?: Clock) {
    this.inner = clock
      ? new InMemoryReimburseStore(snapshot, clock)
      : new InMemoryReimburseStore(snapshot);
    // 只读序列化：JSON.stringify 同步读取 live 引用（snapshotForRollback），与 live 逐字相同。
    this.file = new PersistedFile(filePath, () =>
      JSON.stringify(this.inner.snapshotForRollback(), null, 2),
    );
  }

  /** 异步构造：从 dataFile 加载（不存在则空种子起头并落盘）。 */
  static async create(
    filePath: string,
    seed: ReimburseSnapshot = emptyReimburseSnapshot(),
    clock?: Clock,
  ): Promise<FileReimburseStore> {
    let raw: string | null = null;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (err) {
      if ((err as { code?: string }).code !== 'ENOENT') throw err;
    }

    if (raw === null) {
      const store = new FileReimburseStore(filePath, cloneSnapshot(seed), clock);
      await store.file.persist();
      return store;
    }

    const snapshot = ReimburseSnapshotFileSchema.parse(JSON.parse(raw));
    return new FileReimburseStore(filePath, snapshot, clock);
  }

  async listEntries(): Promise<ReimburseEntry[]> {
    return this.inner.listEntries();
  }

  async getEntry(id: string): Promise<ReimburseEntry | undefined> {
    return this.inner.getEntry(id);
  }

  async findEntryByInvoiceNo(invoiceNo: string): Promise<ReimburseEntry | undefined> {
    return this.inner.findEntryByInvoiceNo(invoiceNo);
  }

  async createEntry(draft: ReimburseEntryDraft): Promise<ReimburseEntry> {
    const before = this.capture();
    const entry = await this.inner.createEntry(draft);
    await this.persistOrRollback(before);
    return entry;
  }

  async updateEntry(
    id: string,
    patch: ReimburseEntryPatch,
  ): Promise<ReimburseEntry | undefined> {
    const before = this.capture();
    const entry = await this.inner.updateEntry(id, patch);
    if (!entry) {
      return undefined; // 未知 id 无内存变化，不落盘
    }
    await this.persistOrRollback(before);
    return entry;
  }

  async listBatches(): Promise<ReimburseBatch[]> {
    return this.inner.listBatches();
  }

  async getBatch(id: string): Promise<ReimburseBatch | undefined> {
    return this.inner.getBatch(id);
  }

  async createBatch(draft: ReimburseBatchDraft): Promise<ReimburseBatch> {
    const before = this.capture();
    const batch = await this.inner.createBatch(draft);
    await this.persistOrRollback(before);
    return batch;
  }

  async updateBatch(
    id: string,
    patch: ReimburseBatchPatch,
  ): Promise<ReimburseBatch | undefined> {
    const before = this.capture();
    const batch = await this.inner.updateBatch(id, patch);
    if (!batch) {
      return undefined;
    }
    await this.persistOrRollback(before);
    return batch;
  }

  /** 写前快照两数组（浅拷贝，元素被写方法整体替换/追加，故引用快照足以还原）。 */
  private capture(): SnapshotArrays {
    const s = this.inner.snapshotForRollback();
    return {
      entries: [...s.entries],
      batches: [...s.batches],
    };
  }

  private restore(before: SnapshotArrays): void {
    const s = this.inner.snapshotForRollback();
    s.entries.splice(0, s.entries.length, ...before.entries);
    s.batches.splice(0, s.batches.length, ...before.batches);
  }

  private async persistOrRollback(before: SnapshotArrays): Promise<void> {
    await this.file.persistOrRollback(() => this.restore(before));
  }
}
