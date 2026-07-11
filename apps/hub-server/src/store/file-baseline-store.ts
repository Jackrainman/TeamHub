import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { SeasonBaselineSchema } from '@teamhub/hub-contracts';
import type {
  PassMilestoneRequest,
  SeasonBaseline,
  UpdateBaselineRequest,
} from '@teamhub/hub-contracts';
import { InMemoryBaselineStore } from './mock-baseline-store.js';
import type { BaselineStore } from './baseline-store.js';

/**
 * 倒排基准线 JSON 落盘实现（BASELINE-CORE 持久层）：进程重启不丢，队长手写覆盖 / 验证门过门留痕累积。
 *
 * **独立落盘文件 `baseline.json`**（红线3，baseline-design.md §5）：不塞 `gov.json`/`GovernanceSnapshot`
 * ——三处手写同步是既有雷区（attribution.ts:46/69/90），基准线走自己的文件、自己的 store。
 *
 * 与 FileInvStore/FileKbStore 同一套纪律（结构逐条镜像）：
 *  - 单一真相在服务器：写入只落本 Store + 整文件原子落盘（写 tmp 再 rename）。
 *  - writeChain 串行化（H2 失败隔离）：并发写不互相覆盖，一次磁盘抖动不会让写链永久 rejected。
 *  - 零额外依赖（只用 node:fs）。
 *  - 加载 fail-closed：文件不存在 → seed 起头（本步默认空数组，S6 会补 fixtures）并落一次盘；
 *    文件存在但解析/校验失败（`SeasonBaselineSchema`）→ **抛**，绝不静默覆盖团队已写的基准线数据。
 *
 * 落盘格式 = 该战队全部赛季基准线的数组（一个战队理论上可有多条赛季链，尽管 v1 常态只有一条 active）。
 *
 * 写语义（`upsertBaseline`/`passMilestone`）复用 `InMemoryBaselineStore`（组合，零重复/零漂移，
 * 同 FileInvStore 复用 InMemoryInvStore 的模式）；本 Store 只在每次成功写后追加一次 `persist()`，
 * 失败则把内存精确回滚到写前状态（借 `InMemoryBaselineStore.peek`/`restore` 的 `@internal` 缺口）。
 */
const BaselineFileSchema = z.array(SeasonBaselineSchema);

export class FileBaselineStore implements BaselineStore {
  private readonly inner: InMemoryBaselineStore;
  private readonly filePath: string;
  private writeChain: Promise<void> = Promise.resolve();

  private constructor(filePath: string, seed: SeasonBaseline[]) {
    this.filePath = filePath;
    this.inner = new InMemoryBaselineStore(seed);
  }

  /** 异步构造：从 dataFile 加载（不存在则 seed 起头并落盘）。 */
  static async create(
    filePath: string,
    seed: SeasonBaseline[] = [],
  ): Promise<FileBaselineStore> {
    let raw: string | null = null;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (err) {
      if ((err as { code?: string }).code !== 'ENOENT') throw err;
    }

    if (raw === null) {
      const store = new FileBaselineStore(filePath, seed);
      await store.persist();
      return store;
    }

    const baselines = BaselineFileSchema.parse(JSON.parse(raw));
    return new FileBaselineStore(filePath, baselines);
  }

  async getBaseline(seasonId: string): Promise<SeasonBaseline | null> {
    return this.inner.getBaseline(seasonId);
  }

  async upsertBaseline(
    seasonId: string,
    patch: UpdateBaselineRequest,
  ): Promise<SeasonBaseline> {
    const before = this.inner.peek(seasonId);
    const result = await this.inner.upsertBaseline(seasonId, patch);
    await this.persistOrRollback(seasonId, before);
    return result;
  }

  async passMilestone(
    seasonId: string,
    milestoneId: string,
    input: PassMilestoneRequest,
  ): Promise<SeasonBaseline | null> {
    const before = this.inner.peek(seasonId);
    const result = await this.inner.passMilestone(seasonId, milestoneId, input);
    await this.persistOrRollback(seasonId, before);
    return result;
  }

  private async persistOrRollback(
    seasonId: string,
    before: SeasonBaseline | undefined,
  ): Promise<void> {
    try {
      await this.persist();
    } catch (err) {
      this.inner.restore(seasonId, before);
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
    const payload = this.inner.entries();
    try {
      await writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8');
      await rename(tmp, this.filePath);
    } catch (err) {
      await unlink(tmp).catch(() => {});
      throw err;
    }
  }
}
