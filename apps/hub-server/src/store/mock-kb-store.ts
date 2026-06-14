import { kbScenarioFixture } from '@teamhub/hub-contracts';
import type { KbSnapshot } from '@teamhub/hub-contracts';
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
    // 克隆被写入的数组：appendCloseout 追加时不污染共享 fixture（参考 InMemoryGovStore）。
    this.snapshot = {
      ...seed,
      issueCards: [...seed.issueCards],
      errorEntries: [...seed.errorEntries],
      archiveDocuments: [...seed.archiveDocuments],
    };
  }

  async getKbSnapshot(): Promise<KbSnapshot> {
    return this.snapshot;
  }

  async appendCloseout(input: KbCloseoutAppend): Promise<void> {
    appendCloseoutInto(this.snapshot, input);
  }
}

/**
 * 把一次结案派生的三件物写进语料快照（InMemory / File 共用）：issueCard 按 id upsert
 * （结案后是 archived 版，替换原 open 卡；新卡直接加），errorEntry / archiveDocument 追加。
 */
export function appendCloseoutInto(
  snapshot: KbSnapshot,
  { issueCard, errorEntry, archiveDocument }: KbCloseoutAppend,
): void {
  const idx = snapshot.issueCards.findIndex((card) => card.id === issueCard.id);
  if (idx >= 0) {
    snapshot.issueCards[idx] = issueCard;
  } else {
    snapshot.issueCards.push(issueCard);
  }
  snapshot.errorEntries.push(errorEntry);
  snapshot.archiveDocuments.push(archiveDocument);
}
