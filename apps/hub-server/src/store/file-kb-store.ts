import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import {
  ArchiveDocumentSchema,
  ErrorEntrySchema,
  IssueCardSchema,
  kbScenarioFixture,
} from '@teamhub/hub-contracts';
import type { KbSnapshot } from '@teamhub/hub-contracts';
import { appendCloseoutInto } from './mock-kb-store.js';
import type { KbCloseoutAppend, KbStore } from './gov-store.js';

/**
 * 知识库语料 JSON 落盘实现（AI+知识库闭环 MVP 持久层）：进程重启不丢、closeout 回灌后累积。
 *
 * 单一真相在服务器：skill POST /api/kb/closeout → 路由 appendCloseout → 本 Store 改内存 + 整文件原子落盘。
 * 零依赖（只用 node:fs；不引 sqlite——SQLite 留作后续扩展，照 sqlite-gov-store.ts stub 模式）。
 *
 * 加载策略（fail-closed）：文件不存在 → 用 seed 起头并落一次盘；文件存在但解析/校验失败 → **抛**，
 * 绝不静默用 seed 覆盖（不毁团队已攒数据）。
 */
const KbSnapshotSchema = z.object({
  projectId: z.string().min(1),
  issueCards: z.array(IssueCardSchema),
  errorEntries: z.array(ErrorEntrySchema),
  archiveDocuments: z.array(ArchiveDocumentSchema),
});

function cloneSnapshot(seed: KbSnapshot): KbSnapshot {
  return {
    ...seed,
    issueCards: [...seed.issueCards],
    errorEntries: [...seed.errorEntries],
    archiveDocuments: [...seed.archiveDocuments],
  };
}

export class FileKbStore implements KbStore {
  private readonly snapshot: KbSnapshot;
  private readonly filePath: string;
  // 串行化落盘：并发 appendCloseout 不互相覆盖。
  private writeChain: Promise<void> = Promise.resolve();

  private constructor(filePath: string, snapshot: KbSnapshot) {
    this.filePath = filePath;
    this.snapshot = snapshot;
  }

  /** 异步构造：从 dataFile 加载（不存在则 seed 起头并落盘）。 */
  static async create(
    filePath: string,
    seed: KbSnapshot = kbScenarioFixture,
  ): Promise<FileKbStore> {
    let raw: string | null = null;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (err) {
      if ((err as { code?: string }).code !== 'ENOENT') throw err;
    }

    if (raw === null) {
      // 文件不存在 → seed 起头 + 落一次盘（首启动落种子语料）。
      const store = new FileKbStore(filePath, cloneSnapshot(seed));
      await store.persist();
      return store;
    }

    // 文件存在 → 严格解析（损坏则抛，不静默覆盖团队数据）。
    const snapshot = KbSnapshotSchema.parse(JSON.parse(raw));
    return new FileKbStore(filePath, snapshot);
  }

  async getKbSnapshot(): Promise<KbSnapshot> {
    return this.snapshot;
  }

  async appendCloseout(input: KbCloseoutAppend): Promise<void> {
    appendCloseoutInto(this.snapshot, input);
    await this.persist();
  }

  /** 原子写：写 tmp 再 rename，串行化避免并发覆盖。 */
  private async persist(): Promise<void> {
    const op = this.writeChain.then(() => this.writeOnce());
    // H2（AUDIT-FIXES 部署前必修）：失败隔离。推进写链时**吞掉本次错误**（reset 为 resolved），
    // 否则一次瞬时磁盘抖动（ENOSPC/EACCES）会让 writeChain 永久 rejected → 之后每次 persist 的
    // .then 回调被静默跳过、内存与磁盘分叉、store 以为存了却再不落盘。调用方仍拿到本次真实错误（op）。
    this.writeChain = op.catch(() => undefined);
    return op;
  }

  private async writeOnce(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    try {
      await writeFile(tmp, JSON.stringify(this.snapshot, null, 2), 'utf8');
      await rename(tmp, this.filePath);
    } catch (err) {
      // L2：rename 后失败会漏 .tmp；写失败也清残留，避免孤儿临时文件堆积。
      await unlink(tmp).catch(() => {});
      throw err;
    }
  }
}
