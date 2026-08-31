import { z } from 'zod';
import { ActorRefSchema } from '../../common.js';
import { RobotTargetSchema } from '../pm/model.js';
import {
  ResourceSessionSchema,
  RelayHandoffSchema,
  SharedResourceSchema,
  ResourceKindSchema,
  ResourceStatusSchema,
  DefaultPresetSchema,
} from './model.js';

// 在场排班 / 接力「写侧请求契约」域文件（自 pm-requests.ts 拆出，照 RelayBoardResponseSchema 迁 relay.ts 先例）。

/**
 * POST /api/resource-sessions（D-029 差异化在场排班）：队长一拍即录的「占用窗口」写侧契约。
 * 逐字镜像 CreateNeed 范式——`ResourceSessionSchema.omit({...})` 剥掉 server clamp/补的字段：
 * - `id`、`createdAt`：store 补（id=`sess-new-N`、createdAt=clock.now）。
 * - `source`：store 钉 `human`（C5 来源 seam server 钉，客户端不冒充 derived/aiSuggested）。
 * 保留人本字段：projectId / resourceId / windowLabel / orderInWindow / holderGroupId /
 * holderTaskId(nullable) / invitedMemberIds / note(nullable)。
 * **`confirmedBy` 随请求传入**（录入即确认拍板——D-029 队长一拍即录，类比 Dependency/Need 的
 * confirmedBy 内部凭证），故**不** omit。invitedMemberIds 是合法录入字段（本窗操作名单，
 * 非派生输出，I0 允许）——但任何读视图绝不按人跨窗累计（反排名护栏）。
 */
export const CreateResourceSessionRequestSchema = ResourceSessionSchema.omit({
  id: true,
  source: true,
  createdAt: true,
});
export const CreateResourceSessionResponseSchema = z.object({
  // M6（AUDIT-FIXES / I0）：同 Dependency/Need——创建响应剥掉 confirmedBy（ActorRef）。
  // 读视图永不回人键；invitedMemberIds（本窗操作名单）保留，I0 允许。
  session: ResourceSessionSchema.omit({ confirmedBy: true }),
});

/**
 * PATCH /api/resource-sessions/:id（R1 接力画布编辑）：队长在画布上拖卡片排先后 / 选填预估完成时间。
 * 只开两字段——`orderInWindow`（画布内拖动排序）与 `eta`（可空预估完成时间）；**均 optional**
 * （拖卡只动 order、改 eta 只动 eta，互不强制）。其余字段（resourceId/holderGroupId/source/confirmedBy…）
 * 不开 PATCH 口子（C3 小作坊：受限编辑，非通用字段 update）。`eta` 沿用 ResourceSessionSchema 的 nullable
 * （""→拒；显式 null=清空）。**I0**：本请求与响应都无成员维度；窗口本身永不进派生输出。
 */
export const UpdateResourceSessionRequestSchema = ResourceSessionSchema.pick({
  orderInWindow: true,
  eta: true,
})
  .partial()
  // eta 是 .default(null)，pick 后单独传仍合法；orderInWindow 仍是 nonnegative int。两者皆可省。
  .refine(
    (data) => data.orderInWindow !== undefined || data.eta !== undefined,
    { message: 'orderInWindow 与 eta 至少给一个' },
  );
export const UpdateResourceSessionResponseSchema = z.object({
  // 同 create 系——读响应剥 confirmedBy（I0：ActorRef 永不过读边界）。
  session: ResourceSessionSchema.omit({ confirmedBy: true }),
});

/**
 * POST /api/relay-handoffs（R1 接力画布拉线）：队长在两张卡之间拉一条「接力交接线」——
 * 表 fromSession 做完先后交给 toSession 上场，**不是**任务依赖（任务依赖走 Dependency + DepGraphPage）。
 * server clamp `source='console'`、补 id/createdAt；`confirmedBy` 随请求传入（拉线即确认拍板，类比
 * ResourceSession/Dependency 内部凭证）。`windowLabel/fromSessionId/toSessionId` 人填；路由层另校验
 * from/to session 存在且不等（自环 400）、不成环（参照 wouldCreateCycle，成环 400）。
 * **反监视红线**：RelayHandoff 主键只 session/资源/组，永无 memberId。
 */
export const CreateRelayHandoffRequestSchema = RelayHandoffSchema.omit({
  id: true,
  source: true,
  createdAt: true,
});
export const RelayHandoffResponseSchema = z.object({
  // 同 create 系——剥 confirmedBy（I0）。
  handoff: RelayHandoffSchema.omit({ confirmedBy: true }),
});

/**
 * POST /api/resource-sessions/batch（D-082 §5 表格页【确认】）：把「使用预设」/「继续昨天」铺出、
 * 队长微调过的今日计划草稿一次性原子落盘。逐条镜像 `CreateResourceSessionRequestSchema`（省 id/source/
 * createdAt，server 补 + 钉 source=`human`），但 `confirmedBy` 提到**请求整体一层**——队长点【确认】即对
 * 这一批草稿统一拍板，不逐条要求各自的确认凭证（与 `deriveTodayPlanFromPresets` 产出的
 * `TodayPlanSessionDraft[]` 天生不含 confirmedBy 对齐）。
 * **I0 双保险**：请求体允许每条草稿带 `invitedMemberIds`，但 server/store 落盘时恒强制清空为 `[]`
 * （预设/表格全程不进 memberId 维度——即便客户端夹带也在服务端原地清空，非信任客户端已清空）。
 * 路由层还须做 schema 之外的全量校验（resource/group/task 存在、同车同窗 orderInWindow 不冲突），
 * 全部通过才调用 store 原子批量创建；任一条不过 → 整批 400、不留半成功。
 */
export const CreateResourceSessionsBatchRequestSchema = z.object({
  windowLabel: z.string().min(1),
  sessions: z
    .array(
      ResourceSessionSchema.omit({
        id: true,
        source: true,
        createdAt: true,
        confirmedBy: true,
      }),
    )
    .min(1),
  confirmedBy: ActorRefSchema,
});
export const CreateResourceSessionsBatchResponseSchema = z.object({
  // 同 create 系——响应剥 confirmedBy（I0：ActorRef 永不过读边界）。
  sessions: z.array(ResourceSessionSchema.omit({ confirmedBy: true })),
});

export type CreateResourceSessionRequest = z.infer<
  typeof CreateResourceSessionRequestSchema
>;
export type CreateResourceSessionResponse = z.infer<
  typeof CreateResourceSessionResponseSchema
>;
export type UpdateResourceSessionRequest = z.infer<
  typeof UpdateResourceSessionRequestSchema
>;
export type UpdateResourceSessionResponse = z.infer<
  typeof UpdateResourceSessionResponseSchema
>;
export type CreateRelayHandoffRequest = z.infer<
  typeof CreateRelayHandoffRequestSchema
>;
export type RelayHandoffResponse = z.infer<typeof RelayHandoffResponseSchema>;
export type CreateResourceSessionsBatchRequest = z.infer<
  typeof CreateResourceSessionsBatchRequestSchema
>;
export type CreateResourceSessionsBatchResponse = z.infer<
  typeof CreateResourceSessionsBatchResponseSchema
>;

// ─── 资源（车）写侧请求契约（自 resource-requests.ts 并入）───

// 共享资源（整机/机器人）「写侧请求契约」域文件（自 pm-requests.ts 拆出，照 RelayBoardResponseSchema 迁 relay.ts 先例）。
// 反监视红线：SharedResource 结构上无成员维度，本域请求绝不收 memberId / 出勤。

/**
 * POST /api/resources（R3 机器人管理 / D-072 §3.2「机器人 = 带编号对象」）：建一台共享资源（整机）。
 * 人填字段：projectId / name / kind / robotTarget（编号位 R1/R2/shared）+ 可选 season（赛季后两位 "26"）
 * + 可选 version（第几代整机，默认 1）。
 *
 * **displayCode 禁手写**（D-072 §3.2 决定 K）——不在请求里，由 server 经 deriveDisplayCode(season, robotTarget, version)
 * 派生（version 缺省 1）。同理 id / status（新建一律 clamp `available`）/ statusReason（建时 null）/
 * statusSource（server 钉 `console`，C5 来源 seam）/ updatedAt（store 补 clock.now）皆不收。
 * **反监视红线**：SharedResource 结构上无成员维度，本请求绝不收 memberId / 出勤。
 */
export const CreateResourceRequestSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1),
  kind: ResourceKindSchema,
  robotTarget: RobotTargetSchema,
  season: z.string().min(1).optional(),
  version: z.number().int().positive().optional(),
});
export const CreateResourceResponseSchema = z.object({
  resource: SharedResourceSchema,
});

/**
 * 初始化车队批量录入（FLEET-BATCH-INIT 打磨轮刀⑩ / onboarding-init-wizard §4 刀⑩）允许的四档状态：
 * 初始化语义 = 「能用 / 在修 / 退役 / 停用（坏了）」——**不放开全 7 枚举**（inUse/upgrading/disassembling
 * 是运行期/退役后语义，初始化现场不产生）。console 向导下拉与 schema 共用此唯一来源。
 */
export const RESOURCE_INIT_STATUSES = ['available', 'repair', 'retired', 'down'] as const;

/**
 * POST /api/resources/batch（FLEET-BATCH-INIT 刀⑩）：初始化向导「车队」步一次录全部车。
 * 行 = 单台建车（POST /api/resources）的最小字段 + 初始化语义的可选 status/statusReason：
 *  - `kind` 可省，默认 `robot`（初始化录的都是整机；测试台/仪器走设置页单建）。
 *  - `status` 限 RESOURCE_INIT_STATUSES 四档，省略 = available；**displayCode 仍禁手写**（server 派生不变）。
 *  - 行内不含 projectId（C3 单团队单项目，server 钉 'prj-robots'，同 console 单建表单的钉法）。
 * **原子性（照 /api/resource-sessions/batch 全量先验范式）**：zod 对整包先验——任一行坏 → 整批 400、
 * 一台不落（detail 带第几台的原因）；全过才逐台落库。数组 min 1（空批无意义）max 50（初始化规模上限）。
 * **反监视红线**：与单建同——SharedResource 无成员维度，本请求绝不收 memberId / 出勤。
 */
export const CreateResourcesBatchRequestSchema = z.object({
  resources: z
    .array(
      z.object({
        name: z.string().min(1),
        kind: ResourceKindSchema.default('robot'),
        robotTarget: RobotTargetSchema,
        season: z.string().min(1).optional(),
        version: z.number().int().positive().optional(),
        status: z.enum(RESOURCE_INIT_STATUSES).optional(),
        statusReason: z.string().min(1).optional(),
      }),
    )
    .min(1)
    .max(50),
});
export const CreateResourcesBatchResponseSchema = z.object({
  resources: z.array(SharedResourceSchema),
});

/**
 * PATCH /api/resources/:id/status（R3 改状态 / D-072 §3.3 机器人生命周期）：既有机器人的状态迁移
 *（维修 repair / 退役 retired / 拆解 disassembling / 回 available 等）。**退役 = 状态迁移、非物理删除**
 *（整机留展示——ResourceSession 仍引用 resourceId，物删会悬空；故无 DELETE 路由）。
 *
 * `statusReason`（"撞坏底盘" 等中性事实自由注释，非归咎于人）optional+nullable：省略=不动既有 reason、
 * 显式 null=清空、非空串=改写（""→拒）。statusSource 不由客户端给——server 一律钉 `console`（C5）。
 * displayCode / season / version 不开 PATCH 口子（机器人编号一经派生不改；改代次=建新机器人）。
 */
export const UpdateResourceStatusRequestSchema = z.object({
  status: ResourceStatusSchema,
  statusReason: z.string().min(1).nullable().optional(),
});
export const UpdateResourceResponseSchema = z.object({
  resource: SharedResourceSchema,
});

/**
 * PATCH /api/resources/:id/preset（D-082 daily-plan-presets §6 D2）：既有车的默认阵型整体写回。
 * 镜像 PATCH /api/resources/:id/status 同模式——单字段 body、safeParse→400、id 不存在→404。
 * `defaultPreset` 传对象=设置/整体替换该车预设；传 `null`=清除（该车退出「使用预设」铺底，
 * 回到 §6 D1 手填路径）。不开 PATCH 局部合并 lineup 的口子（C3 小作坊：受限编辑，整体替换而非增量）。
 */
export const UpdateResourceDefaultPresetRequestSchema = z.object({
  defaultPreset: DefaultPresetSchema.nullable(),
});
export const UpdateResourceDefaultPresetResponseSchema = z.object({
  resource: SharedResourceSchema,
});

export type CreateResourceRequest = z.infer<
  typeof CreateResourceRequestSchema
>;
export type CreateResourceResponse = z.infer<
  typeof CreateResourceResponseSchema
>;
// Request 用 z.input 而非 z.infer（output）：kind 带 .default('robot')，output 类型里 kind 必填，
// 但客户端本就该省略它（服务端补默认）——input 才是「线上请求体」的真实形状。
export type CreateResourcesBatchRequest = z.input<
  typeof CreateResourcesBatchRequestSchema
>;
export type CreateResourcesBatchResponse = z.infer<
  typeof CreateResourcesBatchResponseSchema
>;
export type UpdateResourceStatusRequest = z.infer<
  typeof UpdateResourceStatusRequestSchema
>;
export type UpdateResourceResponse = z.infer<
  typeof UpdateResourceResponseSchema
>;
export type UpdateResourceDefaultPresetRequest = z.infer<
  typeof UpdateResourceDefaultPresetRequestSchema
>;
export type UpdateResourceDefaultPresetResponse = z.infer<
  typeof UpdateResourceDefaultPresetResponseSchema
>;
