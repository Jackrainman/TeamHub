import type {
  PassMilestoneRequest,
  SeasonBaseline,
  UpdateBaselineRequest,
} from '@teamhub/hub-contracts';

/**
 * 倒排基准线读写出入口契约（BASELINE-CORE 持久层；`product-redefine-2026-07.md` §4.1 /
 * `docs/design/baseline-design.md` §3/§5，S3 落地）。
 *
 * **独立文件，不塞进 `gov-store.ts`**：`KbStore`/`InvStore` 接口历史上共居 `gov-store.ts`
 * 是既有事实、不是应当延续的规范——`product-redefine-2026-07.md` §4.4/§9-③ 已把 `GovStore`
 * 21 方法混 6 域列为债，路线 v4 第 4 步「store 拆分」朝的正是「按域独立文件」这个方向；
 * 基准线域晚于该审计诞生，没有理由往同一个雷区里再加一笔（本步的最小化决策，非
 * baseline-design.md 明文，记入 deviations）。方法面照 `KbStore`/`InvStore` 的接口风格
 * （最小读写集合、类型全部来自 `@teamhub/hub-contracts`）。
 *
 * 方法面最小、够 S4 路由用即可（baseline-design.md §3 的三条路由契约，见 `baseline.ts`）：
 *  - `getBaseline`：`GET /api/baseline?seasonId=xxx`（未生成模板 → null，前端引导"生成模板"）；
 *  - `upsertBaseline`：`PATCH /api/baseline`（生成模板 / 队长手写覆盖；v1 整段覆盖式合并，C3 最小实现）；
 *  - `passMilestone`：`POST /api/baseline/milestones/:milestoneId/pass`（大三验收留名过门）。
 *
 * 红线在方法签名上的体现：
 *  - Task 永不新增 `dueDate`（红线1）：本接口只管 `SeasonBaseline`，不触 Task；
 *  - `passedBy` 只是写侧收集的验收留名，不做"谁慢了"聚合展示（红线2，读视图沿既有 `confirmedBy`
 *    I0 处理先例）；
 *  - 基准线本体独立于 `GovernanceSnapshot`（红线3）：本接口零依赖 `GovStore`；
 *  - `evidenceRefs` 只收字符串 `artifactId` 引用，接口无任何二进制写口（红线4）。
 */
export interface BaselineStore {
  /** 读某赛季基准线；尚未生成模板时返回 null（不是 404——GET 语义上"还没有"是合法状态）。 */
  getBaseline(seasonId: string): Promise<SeasonBaseline | null>;

  /**
   * 生成模板 / 队长手写覆盖。该赛季无基准线时以 patch 字段为初始值创建（缺省字段落空 `{}`/`[]`）；
   * 已存在时整段覆盖式合并（v1 不做逐字段 diff patch，`UpdateBaselineRequestSchema` 已限定
   * 不可经此改 `id`/`seasonId`）。
   */
  upsertBaseline(
    seasonId: string,
    patch: UpdateBaselineRequest,
  ): Promise<SeasonBaseline>;

  /**
   * 验证门过门：按 `milestoneId` 定位里程碑并更新 `status`/`passedBy`/`evidenceRefs`/`note`
   * （未提供的可选字段维持原值，不覆空）。`seasonId` 无基准线，或 `milestoneId` 未命中 →
   * 返回 null（路由层转 404）。
   */
  passMilestone(
    seasonId: string,
    milestoneId: string,
    input: PassMilestoneRequest,
  ): Promise<SeasonBaseline | null>;
}
