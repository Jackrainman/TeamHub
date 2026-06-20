import { z } from 'zod';
import {
  TaskSchema,
  TaskStatusSchema,
  DependencySchema,
  NeedSchema,
  ResourceSessionSchema,
  RelayHandoffSchema,
  SharedResourceSchema,
  ResourceKindSchema,
  RobotTargetSchema,
  ResourceStatusSchema,
} from './governance.js';
import { RelayStageSchema } from './relay.js';
import { ArtifactRefSchema } from './schemas.js';

// PM 项目计划表「写侧请求契约」单一源（D-052 重复真相收口）。
// 此前 hub-server/src/contracts.ts 与 hub-console/src/api/schemas/pm.ts 各从 hub-contracts
// 派生一份同形 schema、字段表逐行重复；现下沉至此，两端 import 同一份，H4 clamp / 字段增删改一处即同步。
// I0 读写边界：confirmedBy 随请求传入（建边/建需求本人凭证），但**任何读视图永不回此对象**——
// 见 docs/design/pm-board.md §3。

/**
 * POST /api/tasks：人本字段；server 补 id/时间戳、默认 status=pending/statusSource=console。
 * **D-042**：必填 projectId/groupId/title/rawSummary/robotTarget/intrinsicComplexity；
 * **不引入 `dueDate`**（G4 无硬截止 / 甘特暂缓）。Task 无 confirmedBy 字段，本路由不触 I0 确认语义。
 */
export const CreateTaskRequestSchema = TaskSchema.omit({
  id: true,
  status: true,
  statusSource: true,
  lastProgressAt: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  // H4（AUDIT-FIXES 部署前必修）：写端点信任边界。客户端只能建「未启动 / 进行中」任务，
  // statusSource 只能是真实录入渠道（lark/git/console）。**不收 `done`/`shelved`（跳过工作伪造完成）
  // 也不收 `derived`（冒充系统派生信号、违 C5 派生优先铁律）**——非法值 Zod 直接 400 拒，不静默落库。
  // git/lark 派生信号建 `inProgress` 任务的合法用法仍允许（见 create-task-route.test）。
  status: z.enum(['pending', 'inProgress']).optional(),
  statusSource: z.enum(['lark', 'git', 'console']).optional(),
});
export const CreateTaskResponseSchema = z.object({ task: TaskSchema });

/**
 * POST /api/dependencies：人手建有向边；server clamp status=`active`、补 id/时间戳。
 * `confirmedBy`（ActorRef 内部凭证）随请求传入、仅内部归因——读视图不回此对象。
 * `fromTaskId`=上游、`toTaskId`=被卡的下游。
 */
export const CreateDependencyRequestSchema = DependencySchema.omit({
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});
export const CreateDependencyResponseSchema = z.object({
  // M6（AUDIT-FIXES / I0）：创建响应剥掉 confirmedBy（ActorRef）。读视图永不回人键——「把 ActorRef
  // 送过边界」正是本库禁止的 I0 泄漏形状，也避免成为未来 GET /api/dependencies 照抄的模板。
  dependency: DependencySchema.omit({ confirmedBy: true }),
});

/**
 * POST /api/needs：前置需求一等公民 G3；server clamp status=`open`、openedAt=now、escalatedAt=null、
 * **claimedByMemberId=null**（A2 反派单：新缺口必未认领，认领是本人后续动作；故请求 omit 之，不给队长创建即指派的口子）。
 * **A1**：providerGroupId 归组不归人。
 */
export const CreateNeedRequestSchema = NeedSchema.omit({
  id: true,
  status: true,
  openedAt: true,
  escalatedAt: true,
  claimedByMemberId: true,
});
export const CreateNeedResponseSchema = z.object({
  // M6（AUDIT-FIXES / I0）：同 Dependency——创建响应剥掉 confirmedBy，读视图永不回人键。
  need: NeedSchema.omit({ confirmedBy: true }),
});

/**
 * POST /api/tasks/:taskId/status：**既有任务**的人工状态流转（非创建）。
 * 与 CreateTaskRequest「禁 done/shelved」的区别：那条规则防的是「建任务即伪造完成」（无工作历史就声明 done）；
 * 这里是既有任务的真实推进，故五态全允许（含 `done`=标真实完成 / `shelved`=搁置）。
 * **statusSource 不由客户端给**——server 一律钉 `console`（C5：人工流转是最低优先源，git/lark/derived 派生
 * 信号可覆盖；schema 不暴露 statusSource 字段 = 结构上杜绝冒充 derived/git/lark）。lastProgressAt 不动（仅派生回填）。
 */
export const TransitionTaskStatusRequestSchema = z.object({
  status: TaskStatusSchema,
});
export const TransitionTaskStatusResponseSchema = z.object({ task: TaskSchema });

/**
 * POST /api/dependencies/:depId/waive：**软删除**连线（人工判定作废 → status=`waived`，非物理删除）。
 * 无 body 字段（depId 在 path、目标态固定 waived）。waived 边经 toDepGraphView 边循环跳过、从图上隐藏，
 * 但库里**保留** confirmedBy/createdAt（G2 单一真相可审计；区别于 satisfied=已满足、仍可见）。
 * 响应同 create——剥 confirmedBy（M6/I0：ActorRef 永不过读边界）。
 */
export const WaiveDependencyResponseSchema = z.object({
  dependency: DependencySchema.omit({ confirmedBy: true }),
});

/**
 * POST /api/artifacts：图纸档案 v2「机械/电路分组的图纸版本库」写侧请求契约（HUB-ARTIFACT-ARCHIVE-V2，append-only）。
 * 人填字段：ownerGroup（学科组 机械/电路）+ season（赛季 "25"）+ robotCode（机器人代号 R1/R2）+ mechanism（机构，分组键）
 * + name/uri + 可选 subType（电路子类型 图纸/驱动）+ 可选 relatedRepo/relatedCommit。
 *
 * **C5 来源 seam 由 server/路由钉，客户端不给**——故 omit submittedVia（store 钉 `console`）+ kind/versionNo/revision
 *（路由经纯函数派生：versionNo=nextArtifactVersionNo 四键自增、kind=deriveArtifactKind、revision=`v${versionNo}`）。
 *
 * **I0 图纸日志永无人维度**：ArtifactRef 无任何 person 字段，本请求也绝不收提交人/确认人——日志主键是
 * 学科组 + 赛季 + 机器人 + 机构 + 版本 + 归档物，不是「谁提交」（与 PmCreatePanel 的 confirmer 不同；ArtifactRef
 * 无 confirmedBy，也不得新增）。**C3 append-only**：只追加、不开 update/delete；版本回退按 supersede（追加新版）。
 * **G4**：不引入 dueDate。
 *
 * base ArtifactRefSchema 把这些字段标 optional（向后兼容既有 8 条种子 + 旧 JSON），故这里用 `.extend` 把
 * ownerGroup/season/robotCode/mechanism 收紧为写侧必填（不动 ArtifactRefSchema 本身——否则旧种子的可选字段
 * 会破坏 fail-closed 加载与读契约）。`.superRefine`：电路组必须带 subType（区分图纸/驱动）、机械组必须不带。
 */
export const CreateArtifactRequestSchema = ArtifactRefSchema.omit({
  id: true,
  createdAt: true,
  submittedVia: true,
  kind: true,
  versionNo: true,
  revision: true,
})
  .extend({
    ownerGroup: z.enum(['mechanical', 'electrical', 'ec', 'vision']),
    season: z.string().min(1),
    // 适配机器人三选：R1 / R2 / universal（通用·不上固定机器人）。是版本属性、不进版本键。
    robotCode: z.enum(['R1', 'R2', 'universal']),
    mechanism: z.string().min(1),
    subType: z.enum(['drawing', 'driver']).optional(),
  })
  .superRefine((data, ctx) => {
    // subType（图纸/驱动）只属于电路组：电路必须带，机械/电控/视觉不得带。
    if (data.ownerGroup === 'electrical' && data.subType === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '电路组归档物必须指定 subType（drawing / driver）',
        path: ['subType'],
      });
    }
    if (data.ownerGroup !== 'electrical' && data.subType !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '只有电路组归档物可带 subType',
        path: ['subType'],
      });
    }
  });
export const CreateArtifactResponseSchema = z.object({
  artifact: ArtifactRefSchema,
});

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
 * GET /api/relay?windowLabel= 读响应（R1 接力画布读视图）：一排接力站（RelayStage）+ 站间交接线。
 * 由 deriveRelayBoard 纯函数派生（无 IO）。handoffs 经读边界**剥 confirmedBy**（I0：ActorRef 永不过边界）。
 * **反监视红线**：stages / handoffs 任何字段都无 memberId / invitedMemberIds / 出勤计数——
 * RelayStageSchema 结构上无人维度，RelayHandoff 剥 confirmedBy 后亦无人键。
 */
export const RelayBoardResponseSchema = z.object({
  stages: z.array(RelayStageSchema),
  handoffs: z.array(RelayHandoffSchema.omit({ confirmedBy: true })),
});

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

export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;
export type CreateTaskResponse = z.infer<typeof CreateTaskResponseSchema>;
export type CreateDependencyRequest = z.infer<
  typeof CreateDependencyRequestSchema
>;
export type CreateDependencyResponse = z.infer<
  typeof CreateDependencyResponseSchema
>;
export type CreateNeedRequest = z.infer<typeof CreateNeedRequestSchema>;
export type CreateNeedResponse = z.infer<typeof CreateNeedResponseSchema>;
export type TransitionTaskStatusRequest = z.infer<
  typeof TransitionTaskStatusRequestSchema
>;
export type TransitionTaskStatusResponse = z.infer<
  typeof TransitionTaskStatusResponseSchema
>;
export type WaiveDependencyResponse = z.infer<
  typeof WaiveDependencyResponseSchema
>;
export type CreateArtifactRequest = z.infer<
  typeof CreateArtifactRequestSchema
>;
export type CreateArtifactResponse = z.infer<
  typeof CreateArtifactResponseSchema
>;
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
export type RelayBoardResponse = z.infer<typeof RelayBoardResponseSchema>;
export type CreateResourceRequest = z.infer<
  typeof CreateResourceRequestSchema
>;
export type CreateResourceResponse = z.infer<
  typeof CreateResourceResponseSchema
>;
export type UpdateResourceStatusRequest = z.infer<
  typeof UpdateResourceStatusRequestSchema
>;
export type UpdateResourceResponse = z.infer<
  typeof UpdateResourceResponseSchema
>;
