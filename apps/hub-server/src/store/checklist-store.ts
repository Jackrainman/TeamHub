import type {
  ActorRef,
  ChecklistTemplate,
  GateChecklistItem,
} from '@teamhub/hub-contracts';

/**
 * 门检查单 / 欠条读写出入口契约（GATE-CHECKLIST-IOU 持久层；D-087 /
 * `docs/domains/checklist.md`，S-store 落地）。
 *
 * **独立文件、独立 store、独立落盘**（照 `BaselineStore`/`InvStore`/`KbStore` 先例）：
 * `GateChecklistItem` 不进 `GovernanceSnapshot`（红线：轻量域不塞治理快照，见 checklist.ts 头部注释 +
 * inventory.ts:106 的「独立于 GovernanceSnapshot」范式），故走独立 `ChecklistStore` 而非扩 `GovStore`。
 * 方法面照 `BaselineStore` 的接口风格（最小读写集合、类型全来自 `@teamhub/hub-contracts`）。
 *
 * 方法面最小、够 C3 路由用即可（gate-checklist-iou.md §3 的三条写动作 + 两条读）：
 *  - `listItems`：`GET /api/checklist?seasonId=xxx`（该赛季基准线下所有检查项 / 欠条）；
 *  - `createItem`：`POST /api/checklist`（现场快记欠条，30 秒动线；store 补 id、钉 status=`pending`）；
 *  - `clearItem`：`POST /api/checklist/:id/clear`（标清偿，任何人可标）；
 *  - `waiveItem`：`POST /api/checklist/:id/waive`（书面豁免，仅验收人名单——鉴权在路由层）；
 *  - `listTemplates`：`GET /api/checklist/templates`（跨赛季模板，seed 留空等复盘导入）。
 *
 * 红线在方法签名上的体现：
 *  - **欠条不是 Task**（红线1）：本接口只管 `GateChecklistItem`，不触 Task；`anchorDueAt` 是债的到期点、
 *    属里程碑家族，不是 Task 字段。
 *  - **留名全部落在事实卡**（红线2，D-085 事实层永远带名）：`clearItem`/`waiveItem` 收 `ActorRef` 参数、
 *    写进单条事实卡，读契约（`listItems`）**不剥离** `clearedBy/waivedBy`（与 baseline `passedBy` 读视图剥离
 *    刻意不同——依据 D-085 第三版口径）。但本域**绝不提供任何按人聚合/排行/按人筛选**的读方法。
 *  - **状态机只许 pending 出发**（红线3/4，gate-checklist-iou.md §2）：`clearItem` 仅 `pending→passed`、
 *    `waiveItem` 仅 `pending→waived`；已清 / 已豁免的项再标为不可（返回 null，见各方法注释）。
 */
export interface ChecklistStore {
  /** 读某赛季基准线下所有检查项 / 欠条（`seasonBaselineId` = `SeasonBaseline.id`）。无命中返回空数组。 */
  listItems(seasonBaselineId: string): Promise<GateChecklistItem[]>;

  /**
   * 现场快记欠条 / 模板实例化。`draft` 为人填字段（seasonBaselineId/title/挂接二选一/origin/note/createdAt）；
   * store 生成 `id`（`chk-new-N`，照 id-sequence L1 单调自增先例）、钉 `status='pending'`，再经
   * `GateChecklistItemSchema.parse` fail-closed 校验（挂接二选一 superRefine + 状态不变式，坏 draft 即抛）。
   * `createdAt` 由调用方传入（路由层用 clock，照 baseline 过门留痕先例）。
   */
  createItem(draft: ChecklistItemDraft): Promise<GateChecklistItem>;

  /**
   * 标清偿（`pending→passed`），`clearedBy` 写进事实卡（红线2 留名）。仅 `pending` 可清：
   * id 不存在**或**当前非 `pending`（已 passed/waived）→ 返回 null（路由层据此转 404 / 409）。
   */
  clearItem(id: string, clearedBy: ActorRef): Promise<GateChecklistItem | null>;

  /**
   * 书面豁免（`pending→waived`），`waivedBy` + `waiveReason` 一并写进事实卡（红线3 书面豁免强制留名+理由）。
   * 仅 `pending` 可豁免：id 不存在**或**当前非 `pending` → 返回 null（路由层转 404 / 409）。
   * **验收人名单鉴权在路由层**（读 `Member.gateReviewer`），本方法只管状态机与留名，不做授权判断。
   */
  waiveItem(
    id: string,
    waivedBy: ActorRef,
    waiveReason: string,
  ): Promise<GateChecklistItem | null>;

  /** 读跨赛季检查单模板清单（seed 留空、等复盘导入——gate-checklist-iou.md §4）。 */
  listTemplates(): Promise<ChecklistTemplate[]>;
}

/**
 * createItem 入参：人填字段——去掉 store 自管的 `id`/`status` 与只在状态迁移时才出现的留名字段
 * （`clearedBy`/`waivedBy`/`waiveReason`，新建欠条必为无留名的 pending，防调用方在 create 时伪造留名）。
 * 保留 `createdAt`（由调用方传入）。`origin` 由路由层从 `CreateChecklistItemRequestSchema.default('iou')` 解析后带入。
 */
export type ChecklistItemDraft = Omit<
  GateChecklistItem,
  'id' | 'status' | 'clearedBy' | 'waivedBy' | 'waiveReason'
>;
