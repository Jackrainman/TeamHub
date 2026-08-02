import { z } from 'zod';
import { ActorRefSchema } from './common.js';
import {
  TaskSchema,
  TaskStatusSchema,
  DependencySchema,
  NeedSchema,
} from './pm-core.js';

// PM 项目计划表「写侧请求契约」单一源（D-052 重复真相收口）。
// 此前 hub-server/src/contracts.ts 与 hub-console/src/api/schemas/pm.ts 各从 hub-contracts
// 派生一份同形 schema、字段表逐行重复；现下沉至此，两端 import 同一份，H4 clamp / 字段增删改一处即同步。
// I0 读写边界：confirmedBy 随请求传入（建边/建需求本人凭证），但**任何读视图永不回此对象**——
// 见 docs/design/pm-board.md §3。
//
// 写契约放置约定（CONTRACTS-REQ-RULE）：**新增写请求契约一律放按域的 `*-requests.ts` 家族**
//（pm/artifact/schedule/resource-requests），由 `EntitySchema.omit/pick` 剥掉 server 独占字段派生，
// 不在实体文件里内联。存量内联（baseline/checklist/inventory/identity）不强行搬迁，待各自域下次被触及时
// 顺手迁入。理由：写契约集中使 I0 的 ActorRef 剥离（omit confirmedBy 等）单点可审计；放置一致性是
// 可维护性纪律、非架构强制——真正的 I0 红线在**读侧**（person 键永不进派生输出，护栏见 attribution.test.ts）。

/**
 * POST /api/tasks：人本字段；server 补 id/时间戳、默认 status=pending/statusSource=console。
 * **D-042**：必填 projectId/groupId/title/rawSummary/intrinsicComplexity；
 * **HUB-MODULARIZATION 第4步**：`robotTarget`（+ 新增 `targetLabel`）随 `TaskSchema` 一并改
 * optional——本 schema 由 `TaskSchema.omit(...)` 派生，两字段不在 omit 列表里，故自动继承
 * optional 语义，无需在此单独声明；robotics 垂直租户的表单仍会照常填 robotTarget。
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

// ---------------------------------------------------------------------------
// 挂单认领制写侧动作契约（TASK-POST-CLAIM，D-088 / docs/design/task-post-claim.md）。
// 全部写 Task 本体的留名字段簇（pm-core.ts），无新实体、无 dueDate。actor（认领人/指派人/确认人/
// 完成人/验收人）注入沿 IDENTITY-LITE：身份模式服务端从 session 取、匿名模式 body 供名，路由层
// 强制其一（照 baseline 过门 passedBy 的 sessionActor 注入范式）。响应统一 `{ task: TaskSchema }`
// （与 TransitionTaskStatusResponse 一致；isBig 元信息只在 GET /api/tasks 列表响应带，见 pm-core.ts）。
// ---------------------------------------------------------------------------

/**
 * POST /api/tasks/:taskId/claim（§3 认领）：登录本人一键领挂单，**即生效、免组长确认**（挂单唯一
 * 硬闸在门上）。server 置 `ownerId` = 认领人 + `claimedAt` = now + 状态提升（pending→inProgress）。
 * `memberId` **optional**——身份模式服务端从 session 取认领人（本人领本人）；匿名模式 body 选人。
 * **无 reason**：认领零摩擦（与指派"多一格理由"对立，摩擦力就是制度，§3）。
 */
export const ClaimTaskRequestSchema = z.object({
  memberId: z.string().min(1).optional(),
});
export const ClaimTaskResponseSchema = z.object({ task: TaskSchema });

/**
 * POST /api/tasks/:taskId/assign（§3 指派 / 转派，**同一契约**）：组长选人 + **强制理由一格**
 *（"分配 = 显式培养投资"——挂单零摩擦、指派多一格，摩擦力就是制度）。转派同样走本契约、同样写理由。
 * `reason` **强制非空在 schema 层**（`min(1)`）——这是"指派必写理由"的结构强制点（`Task.assignReason`
 * 本体 optional，靠本请求 schema 兜住）。`assignedBy`（指派人留名）optional：身份模式服务端注入、
 * 匿名模式 body 供。server 置 `ownerId` + `assignReason` + `assignedBy` 留名。
 */
export const AssignTaskRequestSchema = z.object({
  ownerId: z.string().min(1),
  reason: z.string().min(1),
  assignedBy: ActorRefSchema.optional(),
});
export const AssignTaskResponseSchema = z.object({ task: TaskSchema });

/**
 * POST /api/tasks/:taskId/partner（§4 本组搭档位）：外组认领后本组补位（师傅/对接人）——"跨组是
 * 学习通道不是甩锅通道"。显式缺口黄标"待本组搭档"，**不硬阻塞干活**（A1 先例）。落地 = 写 Task
 * 一个 optional 字段 `partnerMemberId`，不建新域（§4 明示）。
 */
export const SetTaskPartnerRequestSchema = z.object({
  partnerMemberId: z.string().min(1),
});
export const SetTaskPartnerResponseSchema = z.object({ task: TaskSchema });

/**
 * POST /api/tasks/:taskId/confirm-cross-claim（§4 跨组大任务组长事后确认）：**不是启动闸**（认领已
 * 即生效——A1 先例：暴露缺口不拦人、唯一硬闸在门上；照 gate-checklist-iou.md "确认 = 事后留名/黄标
 * 暴露"先例）。仅在事实卡留名 `crossClaimConfirmedBy`，缺信号靠组长转派权兜底。`confirmedBy`
 * optional：身份模式服务端注入（须该组组长——路由层鉴权）、匿名模式 body 供名。
 */
export const ConfirmCrossClaimRequestSchema = z.object({
  confirmedBy: ActorRefSchema.optional(),
});
export const ConfirmCrossClaimResponseSchema = z.object({ task: TaskSchema });

/**
 * POST /api/tasks/:taskId/complete（§5 标完成留名）：简单活 = 本人标完成 + 留名（学长有抽查打回权）；
 * 大活标完成后验收态仍是 `awaitingReview`（deriveTaskAcceptance），须学长 review 才 accepted。
 * server 置 `status=done` + `completedBy` 留名。`completedBy` optional：身份模式注入、匿名模式 body 供名。
 */
export const CompleteTaskRequestSchema = z.object({
  completedBy: ActorRefSchema.optional(),
});
export const CompleteTaskResponseSchema = z.object({ task: TaskSchema });

/**
 * POST /api/tasks/:taskId/review（§5 学长验收 / 抽查）：`outcome='accept'` → 验收通过（`reviewedBy`
 * 留名 → deriveTaskAcceptance 判 `accepted`）；`outcome='reject'` → 打回（写 `note` 打回理由 → 落
 * `Task.reviewNote`，status 由路由退回 inProgress/pending——五态够用，不新增枚举，体检①已核状态迁移
 * 零约束）。`reviewedBy` optional（身份模式注入、匿名模式 body 供名，路由层可另做验收人名单鉴权）；
 * `note`（验收备注 / 打回理由）optional `min(1)`——reject 时前端应引导填写打回理由（强制留在 UX 层，
 * schema 不硬绑 `reject⇒note`，避免"打回必写"卡死抽查快速打回；留名 + 打回理由都进事实卡）。
 */
export const ReviewTaskRequestSchema = z.object({
  outcome: z.enum(['accept', 'reject']),
  reviewedBy: ActorRefSchema.optional(),
  note: z.string().min(1).optional(),
});
export const ReviewTaskResponseSchema = z.object({ task: TaskSchema });

/**
 * POST /api/dependencies/:depId/waive：**软删除**连线（人工判定作废 → status=`waived`，非物理删除）。
 * 无 body 字段（depId 在 path、目标态固定 waived）。waived 边经 toDepGraphView 边循环跳过、从图上隐藏，
 * 但库里**保留** confirmedBy/createdAt（G2 单一真相可审计；区别于 satisfied=已满足、仍可见）。
 * 响应同 create——剥 confirmedBy（M6/I0：ActorRef 永不过读边界）。
 */
export const WaiveDependencyResponseSchema = z.object({
  dependency: DependencySchema.omit({ confirmedBy: true }),
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
export type ClaimTaskRequest = z.infer<typeof ClaimTaskRequestSchema>;
export type ClaimTaskResponse = z.infer<typeof ClaimTaskResponseSchema>;
export type AssignTaskRequest = z.infer<typeof AssignTaskRequestSchema>;
export type AssignTaskResponse = z.infer<typeof AssignTaskResponseSchema>;
export type SetTaskPartnerRequest = z.infer<typeof SetTaskPartnerRequestSchema>;
export type SetTaskPartnerResponse = z.infer<
  typeof SetTaskPartnerResponseSchema
>;
export type ConfirmCrossClaimRequest = z.infer<
  typeof ConfirmCrossClaimRequestSchema
>;
export type ConfirmCrossClaimResponse = z.infer<
  typeof ConfirmCrossClaimResponseSchema
>;
export type CompleteTaskRequest = z.infer<typeof CompleteTaskRequestSchema>;
export type CompleteTaskResponse = z.infer<typeof CompleteTaskResponseSchema>;
export type ReviewTaskRequest = z.infer<typeof ReviewTaskRequestSchema>;
export type ReviewTaskResponse = z.infer<typeof ReviewTaskResponseSchema>;
export type WaiveDependencyResponse = z.infer<
  typeof WaiveDependencyResponseSchema
>;
