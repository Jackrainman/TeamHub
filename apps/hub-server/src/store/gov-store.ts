import type {
  ArchiveDocument,
  ErrorEntry,
  IssueCard,
  KbSnapshot,
} from '@teamhub/hub-contracts';
import type { ArtifactStore } from './artifact-store.js';
import type { PmCoreStore } from './pm-core-store.js';
import type { ScheduleStore } from './schedule-store.js';

// 域接口 + 其 Draft/Patch 类型的定义已按语义拆到独立文件（STORE-SPLIT-SQLITE，
// product-redefine-2026-07 §4.4 / §9-③）；本文件 `export *` 全量转发，
// 消费点（test/support fake / 旧 JSON decorator / sqlite-gov-repository.ts / server.ts）
// 继续从 './gov-store.js' 导入、**零 import 路径改动**。
export * from './pm-core-store.js';
export * from './artifact-store.js';
export * from './schedule-store.js';

/**
 * `GovStore`（product-redefine-2026-07 §4.4 / §9-③ STORE-SPLIT-SQLITE）：三支柱共享底座的读写
 * 出入口，**域接口交叉类型**——pm-core（项目计划表核心 + 受限状态机迁移 + 身份写路径）/ artifact
 * （图纸归档提交日志）/ schedule（共享资源车 + 差异化在场排班）。
 *
 * **拆分前史**：本类型此前是单一 21+ 方法的 god-interface（混 6 域，见 §9-③ 审计账单）；
 * 拆分「纯重构」——GovStore 的方法签名集合逐字不变（仍是三个域接口方法的并集），
 * 三实现（`测试 fake` / `旧 JSON decorator` / `SqliteGovRepository` stub）与 `server.ts` 消费点
 * 继续 `implements GovStore` / `import type { GovStore }`，**零行为变化**。
 *
 * 各域接口的写白名单护栏（C2 反排名 / G2 不双写 / I0 confirmedBy 不外露 / C1 派生优先 / C3 小作坊
 * 受限 CRUD）详见 pm-core-store.ts / artifact-store.ts / schedule-store.ts 各自文档；
 * id 生成 / clamp 初始态默认值已抽独立纯函数模块（见 id-sequence.ts / clamp-defaults.ts），
 * 三实现共享同一份策略——为 SQLite 增量迁移（SS3 后续刀）铺路。
 */
export type GovStore = PmCoreStore & ArtifactStore & ScheduleStore;

/**
 * 战队知识库读出入口契约（KB-CORE；承接 base 收口刀 4-opus 对抗核实结论）。
 *
 * **为何独立于 GovStore**：相似 bug 检索（`GET /api/kb/similar` 走 `rankSimilarIssues`）的排序语料是
 * IssueCard / ErrorEntry / ArchiveDocument，**不在 `GovernanceSnapshot` 内**——base 收口刀把 kbStore
 * 暂记为 `GovStore`，对抗核实标注该处过早收窄、应在 KB-CORE 落地时收窄为独立 `KbStore`（仅触本字段、
 * 不动 GovStore / 路由签名，PM 不受影响）。本刀兑现：kbStore 类型 GovStore → KbStore。
 *
 * 注意：结案派生 `KnowledgeNode` + `knowledgeNodes/taskKnowledgeTags` 读路径**仍复用同一
 * `GovernanceSnapshot`**（经 `PmCoreStore.closeoutKbNode`）——那半对抗核实确认成立、不在本接口；
 * 本接口只管相似检索所需的 IssueCard 语料快照（`KbSnapshot`）。
 *
 * 写（`appendCloseout`，AI+知识库闭环 MVP）：结案的三件派生物（archived 卡 / 错误表 / 归档）**回灌进检索语料**——
 * 否则 closeout 上传后下次 `GET /api/kb/similar` 查不到（闭环断）。仍**无人维度**（C2）：写入主键是 issue/errorCode，
 * 不引入「谁结的案」（I0：generatedBy=ai/manual/hybrid 非人名）。
 *
 * 护栏（AGENTS §5）：语料无人维度（C2）；相似检索只列候选不断言同因（A4，见 rankSimilarIssues）。
 *
 * **STORE-SPLIT-SQLITE 备注**：KbStore 本就是「先拆域接口」的先例（GovStore 此次拆分正是；InvStore 已于 ARCH-UNIFY A4 迁入 modules/inventory/repository.ts 的 InventoryRepository）
 * 照此先例）；两者与其 Draft 类型仍物理共居本文件——未随 GovStore 三域一起挪独立文件，因其接口边界
 * 本已清晰、不在本刀「GovStore god-interface」范围内，挪动纯属额外表面积、不改变行为，留给各自
 * 后续刀（如触及 KB-CORE / INV-BOM 时）顺手做，避免本刀 diff 无谓扩大。
 */
export interface KbStore {
  getKbSnapshot(): Promise<KbSnapshot>;
  /**
   * 结案回灌：把一次 `POST /api/kb/closeout` 派生的三件物追加进相似检索语料。
   * issueCard 按 id upsert（结案后是 `archived` 版，替换原卡）；errorEntry / archiveDocument 追加。
   */
  appendCloseout(input: KbCloseoutAppend): Promise<void>;
  /**
   * 批量归档文档追加（KB-BULK-MD-IMPORT，打磨轮刀⑫）：`POST /api/kb/import-docs` 的整批落库。
   * **幂等 = 按 title 去重**：路由从文件名（=title）确定性派生 issueId（`iss-md-<slug>-<hash>`），
   * 故同 title 重导 → 同 issueId → 已存在则不进、计入 `skippedIssueIds`——不覆盖既有文档（批量导入
   * 定位是「沉淀可检索」，重导同批幂等不翻倍、也不悄悄改旧档）；本批内重复 issueId 同样只取首条。
   * **只动 archiveDocuments**，绝不碰 issueCards / errorEntries（纯文档导入，无结案语义）。
   */
  addArchiveDocuments(docs: readonly ArchiveDocument[]): Promise<KbAddArchiveDocsResult>;
}

/** `KbStore.addArchiveDocuments` 结果：落库成功的文档 + 因幂等去重跳过的 issueId（报告映射回 title）。 */
export interface KbAddArchiveDocsResult {
  added: ArchiveDocument[];
  skippedIssueIds: string[];
}

/**
 * `KbStore.appendCloseout` 入参：一次结案派生的三件物（来自 `buildCloseoutFromIssue` 结果）。
 * issueCard = `updatedIssueCard`（status=archived）。
 */
export interface KbCloseoutAppend {
  issueCard: IssueCard;
  errorEntry: ErrorEntry;
  archiveDocument: ArchiveDocument;
}
