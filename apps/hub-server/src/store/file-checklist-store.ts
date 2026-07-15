import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import {
  ChecklistTemplateSchema,
  GateChecklistItemSchema,
  type ActorRef,
  type ChecklistTemplate,
  type GateChecklistItem,
} from '@teamhub/hub-contracts';
import { InMemoryChecklistStore } from './mock-checklist-store.js';
import type { ChecklistItemDraft, ChecklistStore } from './checklist-store.js';

/**
 * 门检查单 / 欠条 JSON 落盘实现（GATE-CHECKLIST-IOU S-store 持久层）：进程重启不丢，现场快记欠条 /
 * 清偿 / 豁免留痕累积。
 *
 * **独立落盘文件 `checklist.json`**（照 baseline.json 先例）：不塞 `gov.json`/`GovernanceSnapshot`——
 * 独立轻量域走自己的文件、自己的 store。落盘格式 = `{ items, templates }` 两键对象（items=检查项/欠条、
 * templates=跨赛季模板）。
 *
 * 与 FileBaselineStore/FileInvStore 同一套纪律（结构逐条镜像）：
 *  - 单一真相在服务器：写入只落本 Store + 整文件原子落盘（写 tmp 再 rename）。
 *  - writeChain 串行化（H2 失败隔离）：并发写不互相覆盖，一次磁盘抖动不让写链永久 rejected。
 *  - 零额外依赖（只用 node:fs）。
 *  - 加载 fail-closed：文件不存在 → seed 起头（本步默认空，main.ts 按 demoSeed 传 fixtures）并落一次盘；
 *    文件存在但解析/校验失败（`ChecklistFileSchema`）→ **抛**，绝不静默覆盖团队已写的欠条数据。
 *
 * 写语义（`createItem`/`clearItem`/`waiveItem`）复用 `InMemoryChecklistStore`（组合，零重复/零漂移，
 * 同 FileBaselineStore 复用 InMemoryBaselineStore 的模式）；本 Store 只在每次成功写后追加一次 `persist()`，
 * 失败则把内存精确回滚到写前状态（借 `InMemoryChecklistStore.peek`/`restore` 的 `@internal` 缺口）。
 */
const ChecklistFileSchema = z.object({
  items: z.array(GateChecklistItemSchema),
  templates: z.array(ChecklistTemplateSchema),
});

export class FileChecklistStore implements ChecklistStore {
  private readonly inner: InMemoryChecklistStore;
  private readonly filePath: string;
  private writeChain: Promise<void> = Promise.resolve();

  private constructor(
    filePath: string,
    seedItems: GateChecklistItem[],
    seedTemplates: ChecklistTemplate[],
  ) {
    this.filePath = filePath;
    this.inner = new InMemoryChecklistStore(seedItems, seedTemplates);
  }

  /** 异步构造：从 dataFile 加载（不存在则 seed 起头并落盘）。 */
  static async create(
    filePath: string,
    seedItems: GateChecklistItem[] = [],
    seedTemplates: ChecklistTemplate[] = [],
  ): Promise<FileChecklistStore> {
    let raw: string | null = null;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (err) {
      if ((err as { code?: string }).code !== 'ENOENT') throw err;
    }

    if (raw === null) {
      const store = new FileChecklistStore(filePath, seedItems, seedTemplates);
      await store.persist();
      return store;
    }

    const parsed = ChecklistFileSchema.parse(JSON.parse(raw));
    return new FileChecklistStore(filePath, parsed.items, parsed.templates);
  }

  async listItems(seasonBaselineId: string): Promise<GateChecklistItem[]> {
    return this.inner.listItems(seasonBaselineId);
  }

  async createItem(draft: ChecklistItemDraft): Promise<GateChecklistItem> {
    const result = await this.inner.createItem(draft);
    // 新建 id 写前不存在 → 回滚 = 撤销新建（restore(id, undefined) 删掉）。
    await this.persistOrRollback(result.id, undefined);
    return result;
  }

  async clearItem(id: string, clearedBy: ActorRef): Promise<GateChecklistItem | null> {
    const before = this.inner.peek(id);
    const result = await this.inner.clearItem(id, clearedBy);
    // 仅真正发生迁移（result 非 null）才落盘；不存在 / 非 pending 未改内存，无需 persist。
    if (result) await this.persistOrRollback(id, before);
    return result;
  }

  async waiveItem(
    id: string,
    waivedBy: ActorRef,
    waiveReason: string,
  ): Promise<GateChecklistItem | null> {
    const before = this.inner.peek(id);
    const result = await this.inner.waiveItem(id, waivedBy, waiveReason);
    if (result) await this.persistOrRollback(id, before);
    return result;
  }

  async listTemplates(): Promise<ChecklistTemplate[]> {
    return this.inner.listTemplates();
  }

  private async persistOrRollback(
    id: string,
    before: GateChecklistItem | undefined,
  ): Promise<void> {
    try {
      await this.persist();
    } catch (err) {
      this.inner.restore(id, before);
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
    const payload = {
      items: this.inner.entriesItems(),
      templates: this.inner.entriesTemplates(),
    };
    try {
      await writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8');
      await rename(tmp, this.filePath);
    } catch (err) {
      await unlink(tmp).catch(() => {});
      throw err;
    }
  }
}
