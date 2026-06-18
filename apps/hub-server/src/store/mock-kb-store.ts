import { kbScenarioFixture } from '@teamhub/hub-contracts';
import type { KbSnapshot } from '@teamhub/hub-contracts';
import { cloneArrayFields } from './clone-snapshot.js';
import type { KbCloseoutAppend, KbStore } from './gov-store.js';

/**
 * 知识库读语料内存实现（KB-CORE）：默认 seed `kbScenarioFixture`（跨赛季 CAN/3508/MicroROS 历史 bug），
 * 让 `GET /api/kb/similar` 从第一个请求起就能演示同类 bug 召回（与 InMemoryGovStore seed 治理 fixture 对称）。
 * 进程重启丢失为预期；持久层见 `FileKbStore`（注入 `options.kbStore`），SQLite 随部署审批后接（AGENTS §8）。
 *
 * 写：`appendCloseout` 回灌结案派生物（AI+知识库闭环），让 closeout 上传后下次 similar 可召回。
 */
export class InMemoryKbStore implements KbStore {
  private readonly snapshot: KbSnapshot;

  constructor(seed: KbSnapshot = kbScenarioFixture) {
    // 克隆被写入的数组：appendCloseout 追加时不污染共享 fixture（参考 InMemoryGovStore，复用 cloneArrayFields）。
    this.snapshot = cloneArrayFields(seed, [
      'issueCards',
      'errorEntries',
      'archiveDocuments',
    ]);
  }

  async getKbSnapshot(): Promise<KbSnapshot> {
    return this.snapshot;
  }

  async appendCloseout(input: KbCloseoutAppend): Promise<void> {
    appendCloseoutInto(this.snapshot, input);
  }
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
