import { z } from 'zod';

import { ActorRefSchema, isoDateTimeSchema } from './common.js';
import { BASELINE_DRIFT_LOOKAHEAD_WEEKS } from './baseline.js';
import type { MilestoneDriftLevel } from './baseline.js';

/**
 * 门检查单与欠条（GATE-CHECKLIST-IOU，D-087 / `docs/design/gate-checklist-iou.md`）。
 *
 * 一句话定位：凑合不禁止，但凑合必须贴条；条子有到期点；到期要么还、要么签字认账。
 * 门从"证据+验收"的原子点升级为**检查项的容器**；欠条 = 一种动态追加的检查项——一个机制
 * 吃下"检查单"和"技术欠条"两件事，不新建域。
 *
 * **独立域文件**（照 `baseline.ts:9-28` / `inventory.ts:106-121` 范式）：不塞 `pm-core.ts` /
 * `attribution.ts` / `GovernanceSnapshot`——独立 `checklistStore` + 独立落盘（照 kbStore/invStore/
 * baselineStore 先例；store 实现属后续步骤，本文件只落契约）。**不进 GovernanceSnapshot** ⇒ 不触碰
 * `attribution.ts` 手写同步雷区（那只在给 GovernanceSnapshot 加新数组键时才触发）。
 *
 * 红线（gate-checklist-iou.md §5，本文件把它们落到 schema 形状上）：
 * 1. **欠条不是 Task**（D-083 G4 / D-087）：`Task` 永不新增个人 `dueDate` 不受影响；欠条的
 *    `anchorDueAt` 是"债的到期点"，属**里程碑家族**（里程碑有日期合法），不是 Task 字段。
 * 2. **留名全部落在事实卡**（D-085 事实层永远带名）：`clearedBy`（清偿留名）/`waivedBy`（豁免留名，
 *    大三）是**单条记录（事实卡）上可见**的 ActorRef——与 `baseline.ts:passedBy` 的读视图剥离**刻意
 *    不同**：D-085 第三版口径"事实层永远带名"，欠条清偿/豁免正是事实卡，故本域**不做剥名 Public 变体**、
 *    读契约直接回带 `clearedBy/waivedBy`。但**永不做任何按人聚合/排行/按人筛选**的派生或端点
 *    （"谁欠条最多"排行永不做——D-085 聚合层永不做）。
 * 3. **豁免强制留名+理由**（D-087 拍板③）：`status==='waived'` ⇒ `waivedBy` 与 `waiveReason` 都非空
 *    （"书面豁免"的书面在此——暴雷后翻出来是判断失误的记录，不是甩锅的把柄）。
 * 4. **清偿留名**：`status==='passed'` ⇒ `clearedBy` 非空。
 */

// ---------------------------------------------------------------------------
// 枚举
// ---------------------------------------------------------------------------

/** 来源：'template' = 检查单模板实例化（抓不自知的凑合）/ 'iou' = 现场追加的欠条（抓自知的凑合）。 */
export const ChecklistOriginSchema = z.enum(['template', 'iou']);
/** 检查项状态：pending=未清（门判定拦截依据）/ passed=已清偿 / waived=书面豁免。 */
export const ChecklistItemStatusSchema = z.enum(['pending', 'passed', 'waived']);

// ---------------------------------------------------------------------------
// GateChecklistItem（门检查项 / 欠条一体）
// ---------------------------------------------------------------------------

/**
 * 单条检查项 / 欠条。
 *
 * **挂接二选一**（gate-checklist-iou.md §2，用户拍板①）：`anchorMilestoneId`（挂已有门/里程碑=
 * `BaselineMilestone.id`）或 `anchorDueAt`（自选到期日）**恰好填一个**——设计稿写的是嵌套
 * `anchor: {milestoneId}|{dueAt}`，架构裁定**展平成两个 optional 字段 + superRefine 互斥**（JSON/表单/
 * 落盘更顺，照 `pm-requests.ts:buildCreateArtifactRequestSchema` superRefine 先例；记入 deviations）。
 *
 * 挂门欠条的时间压力由里程碑 drift 表达 + 过门硬闸拦截；自选日期欠条走 `deriveChecklistDrift`
 * 的周粒度红黄绿（到期未清=红）。
 */
export const GateChecklistItemSchema = z
  .object({
    id: z.string().min(1),
    // 引用 SeasonBaseline.id（该赛季基准线；门/里程碑挂在其 milestones 下）。
    seasonBaselineId: z.string().min(1),
    title: z.string().min(1), // "24V→5V 模块无溯源，先用着"
    // 挂接二选一（下方 superRefine 强制恰好一个）：
    anchorMilestoneId: z.string().min(1).optional(), // 挂已有门/里程碑=BaselineMilestone.id
    anchorDueAt: isoDateTimeSchema.optional(), // 自选到期日（属里程碑家族，非 Task 字段——红线1）
    origin: ChecklistOriginSchema,
    status: ChecklistItemStatusSchema,
    // 清偿/豁免留名（D-085 事实层永远带名，红线2）：事实卡上可见，本域读契约不剥离。
    clearedBy: ActorRefSchema.optional(), // 清偿留名
    waivedBy: ActorRefSchema.optional(), // 豁免留名（大三）
    waiveReason: z.string().min(1).optional(), // 豁免强制非空（"书面豁免"，红线3）
    note: z.string().min(1).optional(),
    createdAt: isoDateTimeSchema,
  })
  .superRefine((data, ctx) => {
    // ① 挂接二选一：anchorMilestoneId / anchorDueAt 恰好填一个（设计 §2，照 pm-requests 互斥先例）。
    const hasMilestone = data.anchorMilestoneId !== undefined;
    const hasDueAt = data.anchorDueAt !== undefined;
    if (hasMilestone === hasDueAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '挂接二选一：anchorMilestoneId（挂门）或 anchorDueAt（自选到期日）恰好填一个',
        path: ['anchorMilestoneId'],
      });
    }
    // ② 书面豁免强制（红线3 / D-087 拍板③）：waived ⇒ waivedBy 与 waiveReason 都非空。
    if (data.status === 'waived') {
      if (!data.waivedBy) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'status=waived 必须留名 waivedBy（豁免留名，事实层带名）',
          path: ['waivedBy'],
        });
      }
      if (!data.waiveReason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'status=waived 必须写 waiveReason（书面豁免强制非空）',
          path: ['waiveReason'],
        });
      }
    }
    // ③ 清偿留名（红线4）：passed ⇒ clearedBy 非空。
    if (data.status === 'passed' && !data.clearedBy) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'status=passed 必须留名 clearedBy（清偿留名，事实层带名）',
        path: ['clearedBy'],
      });
    }
  });

// ---------------------------------------------------------------------------
// ChecklistTemplate（跨赛季资产：门前统一问句清单）
// ---------------------------------------------------------------------------

/**
 * 检查单模板（gate-checklist-iou.md §2/§4）：抓"不自知的凑合"的触发器式条目
 *（如"无溯源电源件上车=自动欠条"）。**跨赛季资产**，与某一赛季基准线解耦。
 * seed 留空、等复盘导入（2026 一轮游检查单初稿为第一批），本轮只落形状。
 */
export const ChecklistTemplateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  gateHint: z.string().min(1).optional(), // 建议挂哪道门的提示（如 "整车级门"）
  source: z.string().min(1), // 来源，如 "复盘2026"
});

// ---------------------------------------------------------------------------
// API 读 / 写契约（跨端单一源，server + console 共用；照 baseline.ts 范式）
// ---------------------------------------------------------------------------

/** GET /api/checklist?seasonId=xxx → 该赛季所有检查项。 */
export const ChecklistQuerySchema = z.object({
  seasonId: z.string().min(1),
});

/**
 * GET /api/checklist 响应：**不做剥名 Public 变体**（与 `baseline.ts:BaselineMilestonePublicSchema`
 * 剥 `passedBy` 的先例**刻意不同**）——依据 D-085 第三版口径"事实层永远带名"：欠条清偿/豁免留名
 * 正是单条事实卡，`clearedBy/waivedBy` 应当且必须在事实卡上可见，故读契约直接回带完整 item。
 * （反监视护栏仍在：本域绝不提供任何按人聚合/排行/按人筛选的派生或端点。）
 */
export const ChecklistItemsResponseSchema = z.object({
  items: z.array(GateChecklistItemSchema),
});

/**
 * POST /api/checklist：现场快记欠条（30 秒动线，任何人可记——gate-checklist-iou.md §3）。
 * 人填字段：title + 挂接二选一（anchorMilestoneId | anchorDueAt）+ 可选 note；`origin` 缺省 `iou`
 *（模板实例化才是 template）。server 补 id/createdAt、钉 status=`pending`。
 * 同 `GateChecklistItemSchema` 的 anchor 互斥校验（superRefine）。
 */
export const CreateChecklistItemRequestSchema = z
  .object({
    title: z.string().min(1),
    anchorMilestoneId: z.string().min(1).optional(),
    anchorDueAt: isoDateTimeSchema.optional(),
    origin: ChecklistOriginSchema.default('iou'),
    note: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    const hasMilestone = data.anchorMilestoneId !== undefined;
    const hasDueAt = data.anchorDueAt !== undefined;
    if (hasMilestone === hasDueAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '挂接二选一：anchorMilestoneId（挂门）或 anchorDueAt（自选到期日）恰好填一个',
        path: ['anchorMilestoneId'],
      });
    }
  });
export const CreateChecklistItemResponseSchema = z.object({
  item: GateChecklistItemSchema,
});

/**
 * POST /api/checklist/:id/clear：标清偿（passed，任何人可标——gate-checklist-iou.md §3）。
 * `clearedBy` **optional**——身份模式下由服务端从会话注入清偿人；匿名模式 body 供名；路由层强制
 * 二者必居其一（同 baseline 过门 passedBy 的 sessionActor 注入范式）。
 */
export const ClearChecklistItemRequestSchema = z.object({
  clearedBy: ActorRefSchema.optional(),
});
export const ClearChecklistItemResponseSchema = z.object({
  item: GateChecklistItemSchema,
});

/**
 * POST /api/checklist/:id/waive：书面豁免（waived，仅**大三/验收人名单**——gate-checklist-iou.md §3）。
 * `waivedBy` optional（同 clear：身份模式服务端注入、匿名模式 body 供名，路由层强制其一）；
 * `waiveReason` **强制非空**（红线3 书面豁免）。路由层另做"验收人名单"鉴权（Member.gateReviewer）。
 */
export const WaiveChecklistItemRequestSchema = z.object({
  waivedBy: ActorRefSchema.optional(),
  waiveReason: z.string().min(1),
});
export const WaiveChecklistItemResponseSchema = z.object({
  item: GateChecklistItemSchema,
});

/** GET /api/checklist/templates → 跨赛季模板清单（seed 留空等复盘导入）。 */
export const ChecklistTemplatesResponseSchema = z.object({
  templates: z.array(ChecklistTemplateSchema),
});

// ---------------------------------------------------------------------------
// 类型导出
// ---------------------------------------------------------------------------

export type ChecklistOrigin = z.infer<typeof ChecklistOriginSchema>;
export type ChecklistItemStatus = z.infer<typeof ChecklistItemStatusSchema>;
export type GateChecklistItem = z.infer<typeof GateChecklistItemSchema>;
export type ChecklistTemplate = z.infer<typeof ChecklistTemplateSchema>;
export type ChecklistQuery = z.infer<typeof ChecklistQuerySchema>;
export type ChecklistItemsResponse = z.infer<typeof ChecklistItemsResponseSchema>;
export type CreateChecklistItemRequest = z.infer<typeof CreateChecklistItemRequestSchema>;
export type CreateChecklistItemResponse = z.infer<typeof CreateChecklistItemResponseSchema>;
export type ClearChecklistItemRequest = z.infer<typeof ClearChecklistItemRequestSchema>;
export type ClearChecklistItemResponse = z.infer<typeof ClearChecklistItemResponseSchema>;
export type WaiveChecklistItemRequest = z.infer<typeof WaiveChecklistItemRequestSchema>;
export type WaiveChecklistItemResponse = z.infer<typeof WaiveChecklistItemResponseSchema>;
export type ChecklistTemplatesResponse = z.infer<typeof ChecklistTemplatesResponseSchema>;

// ---------------------------------------------------------------------------
// 派生纯函数（照 baseline.ts:deriveInvestmentWarnings 姊妹范式；纯函数、无 IO）。
// **不改 deriveBaselineDrift**——那的 MilestoneDrift 主键是 milestoneId、dueAt 欠条塞不进，
// 架构裁定并列新增独立函数（设计 §2 写的是"deriveBaselineDrift 扩展一条分支"，记入 deviations）。
// ---------------------------------------------------------------------------

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** 单条自选日期欠条的 drift 判定结果（最小形状：只 itemId + level，调用方自行 join 展示字段）。 */
export interface ChecklistItemDrift {
  itemId: string;
  level: MilestoneDriftLevel; // 复用 baseline 的红黄绿档位类型（同一套周粒度）
}

/**
 * 自选日期欠条的周粒度红黄绿（gate-checklist-iou.md §2，与 `deriveBaselineDrift` 同一套档位）：
 * - **红**：`anchorDueAt` 已过（到期未清=红——设计 §2）。
 * - **黄**：距 `anchorDueAt` ≤ `BASELINE_DRIFT_LOOKAHEAD_WEEKS` 周（复用 baseline 同一常量）。
 * - **绿**：其余（远期）。
 *
 * **只判 `anchorDueAt` 且 `status==='pending'` 的欠条**：
 * - 已 passed/waived 的欠条不再有时间压力，不出条目；
 * - **挂门欠条（`anchorMilestoneId`）不进本函数**——其时间压力已由挂靠里程碑的 `deriveBaselineDrift`
 *   表达 + 过门硬闸（`listBlockingChecklistItems`）拦截，不重复示警。
 *
 * 与 `deriveBaselineDrift` 的黄档不同：欠条无挂接任务，黄档纯按时间判（无完成度阈值）——
 * 本就是欠条语义（一句话贴条，无任务完成度可算），非设计稿字面偏离。
 */
export function deriveChecklistDrift(items: GateChecklistItem[], now: Date): ChecklistItemDrift[] {
  const nowMs = now.getTime();
  const lookaheadMs = BASELINE_DRIFT_LOOKAHEAD_WEEKS * MS_PER_WEEK;
  const out: ChecklistItemDrift[] = [];

  for (const item of items) {
    if (item.anchorDueAt === undefined) continue; // 挂门欠条不进本函数
    if (item.status !== 'pending') continue; // 已清/已豁免无时间压力
    const dueMs = new Date(item.anchorDueAt).getTime();

    let level: MilestoneDriftLevel;
    if (dueMs < nowMs) {
      level = 'red';
    } else if (dueMs - nowMs <= lookaheadMs) {
      level = 'yellow';
    } else {
      level = 'green';
    }
    out.push({ itemId: item.id, level });
  }

  return out;
}

/**
 * 过门拦截判定核（gate-checklist-iou.md §2："门判定只有一条规则=挂该门的检查项全部非 pending"）：
 * 返回挂在 `milestoneId` 上、仍 `pending` 的检查项。路由层在 `passMilestone` 前调用——非空即 400
 * 拦下过门（照 `server.ts` evidenceRefs 孤儿校验的"读另一 store、命中即 400"同形先例）。
 */
export function listBlockingChecklistItems(
  items: GateChecklistItem[],
  milestoneId: string,
): GateChecklistItem[] {
  return items.filter(
    (item) => item.status === 'pending' && item.anchorMilestoneId === milestoneId,
  );
}
