import type {
  ArchiveDocument,
  ErrorEntry,
  InventoryImportFailure,
  InventoryImportRow,
  InventorySnapshot,
  IssueCard,
  KbSnapshot,
  PartAction,
  PartActionSource,
  PartType,
} from '@teamhub/hub-contracts';
import type { ArtifactStore } from './artifact-store.js';
import type { PmCoreStore } from './pm-core-store.js';
import type { ScheduleStore } from './schedule-store.js';

// 域接口 + 其 Draft/Patch 类型的定义已按语义拆到独立文件（STORE-SPLIT-SQLITE，
// product-redefine-2026-07 §4.4 / §9-③）；本文件 `export *` 全量转发，
// 消费点（mock-gov-store.ts / file-gov-store.ts / sqlite-gov-store.ts / server.ts）
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
 * 三实现（`InMemoryGovStore` / `FileGovStore` / `SqliteGovStore` stub）与 `server.ts` 消费点
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
 * **STORE-SPLIT-SQLITE 备注**：KbStore/InvStore 本就是「先拆域接口」的先例（GovStore 此次拆分正是
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

/**
 * upsertPartType 入参（盘点建底 / 补料 / 调阈值）：人本字段；Store 补 lastCountedAt / updatedAt。
 * 带 `id` 命中既有 → 更新；否则创建（Store 钉 `parttype-new-N`）。
 */
export type PartTypeDraft = Omit<PartType, 'id' | 'lastCountedAt' | 'updatedAt'> & {
  id?: string;
};

/**
 * recordPartAction 入参（一句话快记 / 拆装 / 预留）：人本字段 + `source`（来源 seam，路由钉 human，
 * 客户端不冒充 hermes/derived，C5）。Store 补 id / recordedAt + 把 source 包成 `recordedBy={source,at}`
 * （**I0：绝无 memberId**）。
 */
export type PartActionDraft = Omit<
  PartAction,
  'id' | 'recordedAt' | 'recordedBy'
> & { source: PartActionSource };

/**
 * 库存批量导入结果（INV-BULK-IMPORT 刀⑪）：created/updated = **件号**（partNumber 是幂等 upsert
 * 匹配键）；failed = store 侧拒行（行号随行指回 CSV 原行，正常路径恒空——行已 zod 预验）。
 */
export interface InventoryImportOutcome {
  created: string[];
  updated: string[];
  failed: InventoryImportFailure[];
}

/**
 * 库存 / BOM 读写出入口契约（INV-BOM-CORE，D-042 决策 4 / D-072 §3.4）。
 *
 * INV 是三支柱里**唯一需要扩 schema 的根**——`InventorySnapshot` 不在 `GovernanceSnapshot` 内，故 INV 不复用
 * `GovStore`，走本独立扩展点（BuildHubServerOptions.invStore?，缺省 InMemoryInvStore seed inventoryScenarioFixture）。
 *
 * 写白名单仅 `upsertPartType / recordPartAction / importPartTypes`（C3：无通用 delete / list 全家桶）。**红线**：
 *  - **I0**：recordPartAction 的 recordedBy 永无 memberId（只 source）；无按人聚合视图。
 *  - **G2**：INV 自有真相、不回写飞书 Bitable。
 *  - **C3 / D-072 §3.4**：个体件拆装只移 currentHolder、绝不删 TrackedPart（保血缘）。
 *  - 非法迁移（负库存 / used 超 total / 缺持有者）→ recordPartAction 抛 InvalidPartActionError（路由转 400）。
 *
 * **实现面（刀⑪ 核实）**：INV 只有两实现——`InMemoryInvStore`（mock）+ `FileInvStore`（JSON 落盘）；
 * **无 sqlite inv 实现**（SqliteGovStore 只管 GovernanceSnapshot，InventorySnapshot 独立），
 * importPartTypes 亦只落这两实现。
 */
export interface InvStore {
  getInventorySnapshot(): Promise<InventorySnapshot>;
  /** 盘点建底 / 补料 / 调阈值（POST /api/inventory/part-types）。带 id 命中即更新，否则创建。 */
  upsertPartType(draft: PartTypeDraft): Promise<PartType>;
  /**
   * 库存批量导入（INV-BULK-IMPORT 刀⑪，POST /api/inventory/import）：partNumber 幂等 upsert——
   * 同件号更新 name/category/unit（+ lowStockThreshold 若行里给了；未给 = 保留既有阈值），
   * **totalQuantity 更新策略 = 覆盖**（CSV 是全量盘点口径：表里写多少就是多少，不做增量累加，
   * 重导同表幂等不翻倍）；trackIndividually / allocations / lastCountedAt 不动既有行；新行
   * trackIndividually=false、allocations=[]、projectId 取快照项目。失败行不落（进 failed 继续整批）。
   * **绝不删**——库里有但表里没有的零件原样保留（import 只 upsert）。
   */
  importPartTypes(rows: readonly InventoryImportRow[]): Promise<InventoryImportOutcome>;
  /**
   * 记一条动作并应用其效果（POST /api/inventory/actions）。append-only 落 PartAction +
   * 按动作语义改 PartType.allocations/totalQuantity（+ 个体件 currentHolder/status）。
   * 非法迁移抛 `InvalidPartActionError`。
   */
  recordPartAction(draft: PartActionDraft): Promise<PartAction>;
  /** 缺料告警列表（闲置 < lowStockThreshold 的 PartType；deriveShortfalls 派生）。 */
  listShortfalls(): Promise<PartType[]>;
}
