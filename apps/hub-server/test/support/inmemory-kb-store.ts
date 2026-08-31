import { kbScenarioFixture } from '@teamhub/hub-contracts';
import type { ArchiveDocument, KbSnapshot } from '@teamhub/hub-contracts';
import { cloneArrayFields } from '../../src/store/clone-snapshot.js';
import type {
  KbAddArchiveDocsResult,
  KbCloseoutAppend,
  KnowledgeRepository,
} from '../../src/modules/knowledge/repository.js';

/** 语料快照的三数组字段（appendCloseout upsert 触及的集合）——构造期克隆隔离 + getKbSnapshot 浅拷贝共用。 */
const KB_ARRAY_FIELDS: (keyof KbSnapshot)[] = [
  'issueCards',
  'errorEntries',
  'archiveDocuments',
];

/**
 * 知识库读语料内存实现（KB-CORE）：默认 seed `kbScenarioFixture`（跨赛季 CAN/3508/MicroROS 历史 bug），
 * 让 `GET /api/kb/similar` 从第一个请求起就能演示同类 bug 召回（与 InMemoryPmRepository seed 治理 fixture 对称）。
 * 进程重启丢失为预期；持久层见 `旧生产 Store`（注入 `options.kbStore`），SQLite 随部署审批后接（AGENTS §8）。
 *
 * 写：`appendCloseout` 回灌结案派生物（AI+知识库闭环），让 closeout 上传后下次 similar 可召回。
 */
export class InMemoryKbStore implements KnowledgeRepository {
  private readonly snapshot: KbSnapshot;

  constructor(seed: KbSnapshot = kbScenarioFixture) {
    // 克隆被写入的数组：appendCloseout 追加时不污染共享 fixture（参考 InMemoryPmRepository，复用 cloneArrayFields）。
    this.snapshot = cloneArrayFields(seed, KB_ARRAY_FIELDS);
  }

  async getKbSnapshot(): Promise<KbSnapshot> {
    // M7：返回浅拷贝（顶层对象 + 三数组字段克隆，与构造期同一份克隆纪律），
    // 防外部读到 live 引用后 push/splice 绕过 appendCloseout upsert 白名单 mutate live store。
    return cloneArrayFields(this.snapshot, KB_ARRAY_FIELDS);
  }

  async appendCloseout(input: KbCloseoutAppend): Promise<void> {
    appendCloseoutInto(this.snapshot, input);
  }

  async addArchiveDocuments(
    docs: readonly ArchiveDocument[],
  ): Promise<KbAddArchiveDocsResult> {
    return addArchiveDocumentsInto(this.snapshot, docs);
  }
}

/**
 * 批量归档文档追加（InMemory / File 共用，KB-BULK-MD-IMPORT 打磨轮刀⑫）。
 * **幂等 = 按 title 去重**：issueId 由路由从 title 确定性派生（`iss-md-<slug>-<hash>`），
 * 故判重键就是 issueId——库里已有 / 本批内重复的 issueId 一律跳过（不覆盖旧档），计入 skippedIssueIds。
 * 只 push 进 archiveDocuments，issueCards / errorEntries 不动（纯文档导入，无结案语义）。
 */
export function addArchiveDocumentsInto(
  snapshot: KbSnapshot,
  docs: readonly ArchiveDocument[],
): KbAddArchiveDocsResult {
  const seen = new Set(snapshot.archiveDocuments.map((d) => d.issueId));
  const added: ArchiveDocument[] = [];
  const skippedIssueIds: string[] = [];
  for (const doc of docs) {
    if (seen.has(doc.issueId)) {
      skippedIssueIds.push(doc.issueId);
      continue;
    }
    seen.add(doc.issueId);
    snapshot.archiveDocuments.push(doc);
    added.push(doc);
  }
  return { added, skippedIssueIds };
}

/**
 * 把一次结案派生的三件物写进语料快照（InMemory / File 共用）。三件物全按各自主键 **upsert**（不无条件 push）：
 *   - issueCard 按 `id`（结案后是 archived 版，替换原 open 卡；新卡直接加）；
 *   - errorEntry 按 `id`（路由钉 `err-${issue.id}` → 同一 issue 复结案得同 id）；
 *   - archiveDocument 按 `issueId`（一个 issue 一份归档，无独立 id 字段）。
 * 幂等动机：同一结案被客户端 500 重试 / 重复提交时，否则会在语料里堆出重复 errorEntry / archiveDocument
 * （污染 GET /api/kb/similar 排序、撑大 KB 文件）。三件物全 upsert 后，重复结案是幂等覆盖、主键不重复。
 */
export function appendCloseoutInto(
  snapshot: KbSnapshot,
  { issueCard, errorEntry, archiveDocument }: KbCloseoutAppend,
): void {
  const cardIdx = snapshot.issueCards.findIndex((card) => card.id === issueCard.id);
  if (cardIdx >= 0) {
    snapshot.issueCards[cardIdx] = issueCard;
  } else {
    snapshot.issueCards.push(issueCard);
  }
  const errIdx = snapshot.errorEntries.findIndex((e) => e.id === errorEntry.id);
  if (errIdx >= 0) {
    snapshot.errorEntries[errIdx] = errorEntry;
  } else {
    snapshot.errorEntries.push(errorEntry);
  }
  const archiveIdx = snapshot.archiveDocuments.findIndex(
    (d) => d.issueId === archiveDocument.issueId,
  );
  if (archiveIdx >= 0) {
    snapshot.archiveDocuments[archiveIdx] = archiveDocument;
  } else {
    snapshot.archiveDocuments.push(archiveDocument);
  }
}
