import { z } from 'zod';
import { ActorRefSchema } from './common.js';
import { ResourceSessionSchema, RelayHandoffSchema } from './schedule-infra.js';

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
