import type {
  InventoryImportFailure,
  InventoryImportRow,
  InventorySnapshot,
  PartAction,
  PartActionSource,
  PartType,
  SharedResource,
} from '@teamhub/hub-contracts';

/**
 * 库存域 repository port（ARCH-UNIFY A4；前身 store/gov-store.ts 的 InvStore）。
 *
 * INV 是三支柱里**唯一需要扩 schema 的根**——`InventorySnapshot` 不在 `GovernanceSnapshot` 内，故 INV 不复用
 * `GovStore`，走本独立 port（组合根注入；生产唯一实现 = sqlite-repository.ts，测试 fake 在 test/support）。
 *
 * 写白名单仅 `upsertPartType / recordPartAction / importPartTypes`（C3：无通用 delete / list 全家桶）。**红线**：
 *  - **I0**：recordPartAction 的 recordedBy 永无 memberId（只 source）；无按人聚合视图。
 *  - **G2**：INV 自有真相、不回写飞书 Bitable。
 *  - **C3 / D-072 §3.4**：个体件拆装只移 currentHolder、绝不删 TrackedPart（保血缘）。
 *  - 非法迁移（负库存 / used 超 total / 缺持有者）→ recordPartAction 抛 InvalidPartActionError（路由转 400）。
 */
export type PartTypeDraft = Omit<PartType, 'id' | 'lastCountedAt' | 'updatedAt'> & {
  id?: string;
};

/**
 * recordPartAction 入参（一句话快记 / 拆装 / 预留）：人本字段 + `source`（来源 seam，路由钉 human，
 * 客户端不冒充 hermes/derived，C5）。Repository 补 id / recordedAt + 把 source 包成 `recordedBy={source,at}`
 * （**I0：绝无 memberId**）。
 */
export type PartActionDraft = Omit<
  PartAction,
  'id' | 'recordedAt' | 'recordedBy'
> & { source: PartActionSource };

/**
 * 库存批量导入结果（INV-BULK-IMPORT 刀⑪）：created/updated = **件号**（partNumber 是幂等 upsert
 * 匹配键）；failed = repository 侧拒行（行号随行指回 CSV 原行，正常路径恒空——行已 zod 预验）。
 */
export interface InventoryImportOutcome {
  created: string[];
  updated: string[];
  failed: InventoryImportFailure[];
}

export interface InventoryRepository {
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

/** 跨域只读窄口（§8.2）：search / export / gov-report 只读库存快照与缺料，不拿完整 repository。 */
export type InventoryReadPort = Pick<
  InventoryRepository,
  'getInventorySnapshot' | 'listShortfalls'
>;

/**
 * 机器人资源窄口（§8.2 跨域依赖）：库存动作 holder 校验 + 矩阵派生只需要资源清单，
 * 不拿完整 GovStore。生产由 GovStore.listResources 适配注入。
 */
export interface InventoryResourcePort {
  listResources(): Promise<SharedResource[]>;
}
