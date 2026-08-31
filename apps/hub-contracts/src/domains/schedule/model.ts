import { z } from 'zod';

import {
  ActorRefSchema,
  isoDateTimeSchema,
  WeeklyMinuteWindowBaseSchema,
  weeklyMinuteWindowRefine,
  WEEKLY_MINUTE_WINDOW_REFINE_MSG,
} from '../../common.js';
import { DepNodeKnowledgeSchema, GovActorSourceSchema, RobotTargetSchema } from '../../pm-core.js';

/**
 * 共享物理资源 + 差异化在场排班（D-029）——机器人在场层基础设施
 * （HUB-MODULARIZATION 第3步，从 governance.ts 纯搬移，约 governance.ts:364-468 段）。
 *
 * 通用 PM 调度任务、假设人可并行 / 资源抽象；本场景有「单一共享物理资源（机器人）」
 * 做硬串行点 + 物理共处要求 → "今晚 / 明天你这角色要不要在场"不是排班表，是从
 * DAG + 机器人可用性派生。差异化（程序熬夜调机器人 / 机械电路 on-call / 被卡的今晚去学）
 * 由依赖位置 + 资源状态自动落出，不手排。
 *
 * 反监视（C2/A1）：派生输出 PresenceRecommendation 的主键是 group/resource/task，
 * **无 memberId 维度**；ResourceSession.invitedMemberIds 仅是"单窗操作名单"，
 * 绝不跨窗按人累计（否则即出勤排名）——护栏落在"输出无人维度 + 不做按人聚合视图"。
 */

export const ResourceKindSchema = z.enum(['robot', 'testRig', 'instrument']);

/**
 * 资源自身状态（D-072 §3.3 机器人生命周期 + 既有 down/upgrading 兼容）。**不可上场**的状态下，
 * 整片下游 require 它的任务今晚作罢（接力释放语义，见 canBoardResource + derivePresenceSchedule）。
 *
 * 宏观维修态 = `repair`（不精确到机构，需要时附 statusReason 自由注释「撞坏底盘」）。退役/拆解手动设。
 * 既有 `down`/`upgrading` 保留（早期种子 / 测试在用，语义上等同「不可上场」），新增 D-072 三态：
 *  - `repair` 维修中（撞坏要修，修好回 available）
 *  - `retired` 退役（手动，整机留展示）
 *  - `disassembling` 拆解（退役后拆一部分，半留）
 */
export const ResourceStatusSchema = z.enum([
  'available', // 空闲可用
  'inUse', // 某窗口被占用（调试中）
  'down', // 损坏 / 不可用（legacy，等同 repair 的「不可上场」）
  'upgrading', // 升级改造中（legacy）
  'repair', // 维修中（D-072 宏观维修态）
  'retired', // 退役（手动，整机留展示）
  'disassembling', // 拆解（退役后拆一部分，半留）
]);

/** 可上场（可排班 / 显示为活跃机器人）的状态集——仅 available / inUse。其余皆「不可上场」→ 接力释放。 */
const BOARDABLE_STATUSES: ReadonlySet<ResourceStatus> = new Set<ResourceStatus>([
  'available',
  'inUse',
]);

/**
 * 该状态能否上场（D-072 §3.3：机器人状态只回答「现在能不能上 / 在不在修」）。
 * 下游接力据此提示「此刻不用来 / 可下班」（接力释放语义，非「停活」）。
 */
export function canBoardResource(status: ResourceStatus): boolean {
  return BOARDABLE_STATUSES.has(status);
}

// deriveDisplayCode（机器人编号派生，D-072 §3.2 决定 K）已移至 `verticals/robotics.ts`
// （HUB-MODULARIZATION 第6步）：presence-schedule 模块本就 robotics-only（§3.3 模块清单），本函数
// 随词汇一起搬到垂直包更贴合归属。签名/行为不变，消费点仍从包入口 `@teamhub/hub-contracts` 导入，
// 本文件内不再需要它（唯一调用点在 fixtures.ts，已改从 './verticals/robotics.js' 导入）。

/**
 * 每车默认阵型（D-082，daily-plan-presets §6 D2）：队长「使用预设」一键铺今日计划的基线来源。
 * `lineup` 通常 1 条（单组常驻，如电控独占）、可多条（多组接力/并行，如电控+视觉两条 session）。
 * `taskId` 指向该车的**常驻任务**（复用优先，§6 D1 优化：挂长期任务、不每天新建，依赖挂在它上才稳定）；
 * 可空 = 该条 lineup 只定组，任务留每天现场填。
 */
export const DefaultPresetSchema = z.object({
  lineup: z.array(
    z.object({
      groupId: z.string().min(1),
      taskId: z.string().min(1).optional(),
    }),
  ),
});

export const SharedResourceSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1), // "R1 比赛机器人"
  kind: ResourceKindSchema,
  robotTarget: RobotTargetSchema, // 与 Task.robotTarget 对齐；同时充当 displayCode 的「位置」位
  status: ResourceStatusSchema,
  statusReason: z.string().min(1).nullable(), // "撞坏底盘"——中性事实自由注释，非归咎于人
  statusSource: GovActorSourceSchema, // 派生优先，console 兜底
  // D-072 §3.2「机器人 = 带编号对象」：赛季后两位 + 版本代次 → displayCode 派生（禁手写）。
  // 全 optional（向后兼容既有种子 / 已落盘 JSON）：未给则读视图回退 name（见 INV ledger displayCode ?? name）。
  season: z.string().min(1).optional(), // 赛季后两位 "26"
  version: z.number().int().positive().optional(), // 第几代整机，默认 1（极低频升）
  displayCode: z.string().min(1).optional(), // deriveDisplayCode(season, robotTarget, version)
  // D-082：每车默认阵型，optional 向后兼容既有车 / 已落盘 JSON（不填 → 该车不参与「使用预设」铺底）。
  defaultPreset: DefaultPresetSchema.optional(),
  updatedAt: isoDateTimeSchema,
});

// WeeklyMinuteWindowBaseSchema / weeklyMinuteWindowRefine / WEEKLY_MINUTE_WINDOW_REFINE_MSG
// 已上移至 common.ts（core 基元层），本文件从 './common.js' import——step1 剪 growth→governance 跨域环。
// 带 refine 的上界检查（WeeklyMinuteWindowSchema / WindowDefSchema）仍属调度域，留在本文件。
export const WeeklyMinuteWindowSchema = WeeklyMinuteWindowBaseSchema.refine(
  weeklyMinuteWindowRefine,
  { message: WEEKLY_MINUTE_WINDOW_REFINE_MSG },
);

/**
 * 在场窗口的周内分钟段锚定（S1）：与 WeeklyMinuteWindowSchema 同形，独立命名以表语义
 * ——这是"某个 ResourceSession / windowLabel 实际占用的周内时段"，用于和成员 recurringBusy
 * 做重叠判定，派生组级 headcount。走独立 map 经 derivePresenceSchedule 第 4 参传入，
 * **绝不**加到 ResourceSessionSchema 上（最小侵入，未锚定时静默退化为 feasibility=null）。
 */
export const WindowDefSchema = WeeklyMinuteWindowSchema;

/**
 * 占用窗口：粗粒度（"今晚" / "明天上午"），队长一拍即录（低录入 C1）。
 * 同一 windowLabel + 同一 resource 可有多条（orderInWindow 表"先程序后机械"的接力）。
 * 精确钟点语义（startsAt/endsAt）留 open（见 D-029 open_for_decision）。
 */
export const ResourceSessionSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  resourceId: z.string().min(1),
  windowLabel: z.string().min(1), // 粗粒度标签，不锁 enum（"今晚" / "明天上午" / "周末"）
  orderInWindow: z.number().int().nonnegative(), // 窗口内接力顺序（0,1,2…）
  holderGroupId: z.string().min(1), // 该段机器人归哪个组
  holderTaskId: z.string().min(1).nullable(), // 关联任务（"R1 总联调"）
  // 队长一次可选多组多人——仅本窗操作名单，绝不跨窗按人累计（反排名护栏）。
  invitedMemberIds: z.array(z.string().min(1)),
  note: z.string().min(1).nullable(),
  source: z.enum(['human', 'aiSuggested', 'derived']),
  // aiSuggested 未确认不参与派生（C4：AI 建议不判定）。
  confirmedBy: ActorRefSchema.nullable(),
  // 队长可选填的预估完成时间（自由文本，"约 22:30" / "搞到收工"），可空。
  // .default(null) 向后兼容既有 fixtures / 已落盘 JSON（不传也过）；与 relayHandoffs
  // 同走内存、不落盘（D-029：占用窗口粗粒度临时，重启回 seed）。
  eta: z.string().min(1).nullable().default(null),
  createdAt: isoDateTimeSchema,
});

/**
 * 接力交接边（R1）：表"先做完这段、再交给下一段上场"的**先后交接**，
 * **不是**任务依赖（任务依赖走 Dependency + DepGraphPage，二者井水不犯河水）。
 * fromSessionId → toSessionId 均指向同窗 ResourceSession；队长在接力画布上拉线产生。
 * 与 session.eta 同样走内存、不落盘（D-029：粗粒度临时窗口，重启回 seed）。
 *
 * 反监视红线（与 ResourceSession 同）：主键只 session / 资源 / 组，
 * **绝不**含 memberId / 出勤维度。
 */
export const RelayHandoffSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  windowLabel: z.string().min(1),
  fromSessionId: z.string().min(1),
  toSessionId: z.string().min(1),
  source: GovActorSourceSchema,
  // 与 ResourceSession.confirmedBy 一致：ActorRef，可空（未确认 = 仅建议态）。
  confirmedBy: ActorRefSchema.nullable(),
  createdAt: isoDateTimeSchema,
});

export const PresenceModeSchema = z.enum([
  'present', // 在场（持有机器人 / 接力持有）
  'onCall', // 随叫（上游链上仍在推进，可能临时被叫）
  'free', // 今晚不用来（被卡 → 去歇 / 去学；或机器人 down）
]);

export const PresenceReasonSchema = z.enum([
  'holdsResource', // 持有机器人做这段工作
  'upstreamOnCall', // 上游链上还在推进，可能被叫
  'blockedFree', // 被卡而空闲，本窗无法推进
  'resourceDown', // 机器人不可用，整片下游今晚作罢
]);

/**
 * 组级容量护栏读数（S1，A2）：把成员私有课表压成的"无人维度组级整数 headcount"再分级。
 * **绝不**是"谁有空"——只是这个组在该窗口大概有几个人不冲突。
 * ample = 组级 headcount 充裕；tight = 偏紧；conflict = 与持有窗冲突 / 为 0。
 * 无 MemberAvailability / 窗未锚定时为 null（与改前 fixture 输出完全一致）。
 * 具体阈值（ample/tight/conflict 边界）是启发式，留 D-029 open，不在 schema 写死。
 */
export const PresenceFeasibilitySchema = z.enum(['ample', 'tight', 'conflict']);

/** 派生输出：在场建议（组键，无人维度）。 */
export const PresenceRecommendationSchema = z.object({
  id: z.string().min(1),
  windowLabel: z.string().min(1),
  // 布置任务 / 排班按小组（电控 / 视觉 / 电路 / 机械；跨小组的收敛任务如总联调挂大组）。
  groupId: z.string().min(1), // 组键（反排名核心）
  // 汇报按大组：groupId 的顶层祖先（程序 / 电路 / 机械）；顶层组自身 = groupId。
  reportingGroupId: z.string().min(1),
  mode: PresenceModeSchema,
  resourceId: z.string().min(1).nullable(),
  holderTaskLabel: z.string().min(1).nullable(), // "R1 总联调"（任务名，非人名）
  orderInWindow: z.number().int().nonnegative().nullable(), // present 时显示接力顺序
  reason: PresenceReasonSchema,
  factStatement: z.string().min(1), // 中性：只填组 / 任务 / 资源名
  // free 模式挂"这段时间可以看的资料"（A3/D-027 正面给予）。
  relatedKnowledge: z.array(DepNodeKnowledgeSchema),
  // 组级容量护栏读数（S1，A2）：仅在传入 AvailabilityContext 且该窗已锚定时填；
  // 无 MemberAvailability / 窗未锚定 → null（与改前 fixture byte-for-byte 一致）。
  // 用 .nullable().default(null)：parse 后总带 feasibility:null 键，与镜像全文件
  // .nullable()+显式 null 风格一致，且不破"缺省 null"语义与 key 遍历测。
  feasibility: PresenceFeasibilitySchema.nullable().default(null),
  detectedBy: z.literal('derived'), // 永远派生，从不是人录入
  detectedAt: isoDateTimeSchema,
});

// ---------------------------------------------------------------------------
// 列表响应包装（继承 { xxx: [] } 风格）
// ---------------------------------------------------------------------------

export const SharedResourcesResponseSchema = z.object({
  resources: z.array(SharedResourceSchema),
});
export const ResourceSessionsResponseSchema = z.object({
  sessions: z.array(ResourceSessionSchema),
});
export const PresenceScheduleResponseSchema = z.object({
  windowLabel: z.string().min(1),
  recommendations: z.array(PresenceRecommendationSchema),
});

// ---------------------------------------------------------------------------
// 类型导出
// ---------------------------------------------------------------------------

export type ResourceKind = z.infer<typeof ResourceKindSchema>;
export type ResourceStatus = z.infer<typeof ResourceStatusSchema>;
export type WeeklyMinuteWindow = z.infer<typeof WeeklyMinuteWindowSchema>;
export type WindowDef = z.infer<typeof WindowDefSchema>;
export type DefaultPreset = z.infer<typeof DefaultPresetSchema>;
export type SharedResource = z.infer<typeof SharedResourceSchema>;
export type ResourceSession = z.infer<typeof ResourceSessionSchema>;
export type RelayHandoff = z.infer<typeof RelayHandoffSchema>;
export type PresenceMode = z.infer<typeof PresenceModeSchema>;
export type PresenceReason = z.infer<typeof PresenceReasonSchema>;
export type PresenceFeasibility = z.infer<typeof PresenceFeasibilitySchema>;
export type PresenceRecommendation = z.infer<
  typeof PresenceRecommendationSchema
>;
export type SharedResourcesResponse = z.infer<
  typeof SharedResourcesResponseSchema
>;
export type ResourceSessionsResponse = z.infer<
  typeof ResourceSessionsResponseSchema
>;
export type PresenceScheduleResponse = z.infer<
  typeof PresenceScheduleResponseSchema
>;
