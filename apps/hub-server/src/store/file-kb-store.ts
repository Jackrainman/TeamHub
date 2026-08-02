import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import {
  ArchiveDocumentSchema,
  ErrorEntrySchema,
  IssueCardSchema,
  kbScenarioFixture,
} from '@teamhub/hub-contracts';
import type { ArchiveDocument, KbSnapshot } from '@teamhub/hub-contracts';
import { cloneArrayFields } from './clone-snapshot.js';
import { addArchiveDocumentsInto, appendCloseoutInto } from './mock-kb-store.js';
import { PersistedFile } from './persisted-file.js';
import type {
  KbAddArchiveDocsResult,
  KbCloseoutAppend,
  KbStore,
} from './gov-store.js';

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

/** 语料快照的三数组字段（appendCloseout upsert 触及的集合）——克隆隔离用。 */
const KB_ARRAY_FIELDS: (keyof KbSnapshot)[] = [
  'issueCards',
  'errorEntries',
  'archiveDocuments',
];

function cloneSnapshot(seed: KbSnapshot): KbSnapshot {
  return cloneArrayFields(seed, KB_ARRAY_FIELDS);
}

export class FileKbStore implements KbStore {
  private readonly snapshot: KbSnapshot;
  private readonly file: PersistedFile;

  private constructor(filePath: string, snapshot: KbSnapshot) {
    this.snapshot = snapshot;
    // 只读序列化：JSON.stringify 读 live snapshot（与 getKbSnapshot 克隆隔离无关，落盘内容逐字相同）。
    // 串行链/原子写/失败隔离由 PersistedFile 承载。
    this.file = new PersistedFile(filePath, () => JSON.stringify(this.snapshot, null, 2));
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
      await store.file.persist();
      return store;
    }

    // 文件存在 → 严格解析（损坏则抛，不静默覆盖团队数据）。
    const snapshot = KbSnapshotSchema.parse(JSON.parse(raw));
    return new FileKbStore(filePath, snapshot);
  }

  async getKbSnapshot(): Promise<KbSnapshot> {
    // M7：返回浅拷贝（顶层对象 + 三数组字段克隆），防外部读到 live 引用后 push/splice 绕过
    // appendCloseout upsert 白名单 mutate live store。复用 cloneSnapshot（=cloneArrayFields，
    // 与构造期同一份克隆纪律）；JSON 序列化与 live 逐字相同，writeOnce() 落盘内容不变（无落盘回归）。
    return cloneSnapshot(this.snapshot);
  }

  async appendCloseout(input: KbCloseoutAppend): Promise<void> {
    // 修复 #3：先改内存（upsert 三件物）再落盘；persist() 失败时回滚到写前快照再抛——
    // 否则「内存已变更 + 客户端 500 重试」会在语料里重复。appendCloseoutInto 是按主键 upsert（可能覆盖既有），
    // 故不能简单 pop；这里浅拷贝三条 live 数组作写前快照，失败时整体还原（内容回到调用前）。
    const before = {
      issueCards: [...this.snapshot.issueCards],
      errorEntries: [...this.snapshot.errorEntries],
      archiveDocuments: [...this.snapshot.archiveDocuments],
    };
    appendCloseoutInto(this.snapshot, input);
    try {
      await this.file.persist();
    } catch (err) {
      // 原地还原（保持 snapshot 引用不变，splice 回填写前内容）。
      this.snapshot.issueCards.splice(0, this.snapshot.issueCards.length, ...before.issueCards);
      this.snapshot.errorEntries.splice(0, this.snapshot.errorEntries.length, ...before.errorEntries);
      this.snapshot.archiveDocuments.splice(
        0,
        this.snapshot.archiveDocuments.length,
        ...before.archiveDocuments,
      );
      throw err;
    }
  }

  async addArchiveDocuments(
    docs: readonly ArchiveDocument[],
  ): Promise<KbAddArchiveDocsResult> {
    // 与 appendCloseout 同范式（修复 #3）：先改内存再落盘，persist 失败回滚到写前快照再抛——
    // 否则「内存已追加 + 客户端 500 重试」会绕过幂等判重（重试时同 issueId 全被判 skipped、
    // 报告撒谎说「已存在」）。写前只快照 archiveDocuments 一条数组（本方法唯一触及的集合）。
    const before = [...this.snapshot.archiveDocuments];
    const result = addArchiveDocumentsInto(this.snapshot, docs);
    try {
      await this.file.persist();
    } catch (err) {
      this.snapshot.archiveDocuments.splice(
        0,
        this.snapshot.archiveDocuments.length,
        ...before,
      );
      throw err;
    }
    return result;
  }
}
