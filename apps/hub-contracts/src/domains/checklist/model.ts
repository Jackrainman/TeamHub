import { z } from 'zod';

import { ActorRefSchema, isoDateTimeSchema } from '../../common.js';

/**
 * 门检查单与欠条（GATE-CHECKLIST-IOU，D-087 / `docs/domains/checklist.md`）。
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

interface ChecklistAnchorInput {
  anchorMilestoneId?: string;
  anchorDueAt?: string;
}

/** model/request 共用的展平 anchor 二选一规则；仅供域内组合，不进入 public API。 */
export function validateChecklistAnchor(
  data: ChecklistAnchorInput,
  context: z.RefinementCtx,
): void {
  const hasMilestone = data.anchorMilestoneId !== undefined;
  const hasDueAt = data.anchorDueAt !== undefined;
  if (hasMilestone === hasDueAt) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: '挂接二选一：anchorMilestoneId（挂门）或 anchorDueAt（自选到期日）恰好填一个',
      path: ['anchorMilestoneId'],
    });
  }
}

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
    validateChecklistAnchor(data, ctx);
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

export type ChecklistOrigin = z.infer<typeof ChecklistOriginSchema>;
export type ChecklistItemStatus = z.infer<typeof ChecklistItemStatusSchema>;
export type GateChecklistItem = z.infer<typeof GateChecklistItemSchema>;
export type ChecklistTemplate = z.infer<typeof ChecklistTemplateSchema>;
