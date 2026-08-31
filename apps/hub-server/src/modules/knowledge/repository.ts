import type {
  ArchiveDocument,
  ErrorEntry,
  IssueCard,
  KbSnapshot,
  KnowledgeNode,
} from '@teamhub/hub-contracts';
// KnowledgeNodeDraft 归 pm 域（A5 拆 GovStore 时随 pm 迁出）；本模块只经窄口消费其类型。
import type { KnowledgeNodeDraft } from '../../store/pm-core-store.js';

/**
 * 知识库域 repository port（ARCH-UNIFY A4；前身 store/gov-store.ts 的 KbStore）。
 *
 * **为何独立于 GovStore**：相似 bug 检索（`GET /api/kb/similar` 走 `rankSimilarIssues`）的排序语料
 * （IssueCard/ErrorEntry/ArchiveDocument）不在 `GovernanceSnapshot` 内；结案派生 KnowledgeNode 那半
 * 走 `KnowledgeNodeCloseoutPort`（pm 域窄口）。
 */
export interface KnowledgeRepository {
  getKbSnapshot(): Promise<KbSnapshot>;
  /**
   * 结案回灌：把一次 `POST /api/kb/closeout` 派生的三件物追加进相似检索语料。
   * issueCard 按 id upsert（结案后是 `archived` 版，替换原卡）；errorEntry / archiveDocument 追加。
   */
  appendCloseout(input: KbCloseoutAppend): Promise<void>;
  /**
   * 批量归档文档追加（KB-BULK-MD-IMPORT）：`POST /api/kb/import-docs` 的整批落库。
   * **幂等 = 按 title 去重**：service 从文件名（=title）确定性派生 issueId（`iss-md-<slug>-<hash>`），
   * 故同 title 重导 → 同 issueId → 已存在则不进、计入 `skippedIssueIds`。重导同批幂等不翻倍、
   * 也不悄悄改旧档；本批内重复 issueId 同样只取首条。
   * **只动 archiveDocuments**，绝不碰 issueCards / errorEntries（纯文档导入，无结案语义）。
   */
  addArchiveDocuments(docs: readonly ArchiveDocument[]): Promise<KbAddArchiveDocsResult>;
}

/** 跨域只读窄口（§8.2）：search 聚合只读语料快照，不拿完整 repository。 */
export type KnowledgeReadPort = Pick<KnowledgeRepository, 'getKbSnapshot'>;

/** `addArchiveDocuments` 结果：落库成功的文档 + 因幂等去重跳过的 issueId（报告映射回 title）。 */
export interface KbAddArchiveDocsResult {
  added: ArchiveDocument[];
  skippedIssueIds: string[];
}

/**
 * `appendCloseout` 入参：一次结案派生的三件物（来自 `buildCloseoutFromIssue` 结果）。
 * issueCard = `updatedIssueCard`（status=archived）。
 */
export interface KbCloseoutAppend {
  issueCard: IssueCard;
  errorEntry: ErrorEntry;
  archiveDocument: ArchiveDocument;
}

/**
 * 结案派生知识节点的窄 port（§8.2 跨域写）：KnowledgeNode 在 pm 域（GovernanceSnapshot.knowledgeNodes），
 * knowledge 域只经本口回挂，不拿完整 GovStore。生产由 GovStore.closeoutKbNode 适配注入。
 */
export interface KnowledgeNodeCloseoutPort {
  closeoutKbNode(draft: KnowledgeNodeDraft): Promise<KnowledgeNode>;
}
