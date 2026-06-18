import { z } from 'zod';
import {
  TaskSchema,
  TaskStatusSchema,
  DependencySchema,
  NeedSchema,
} from './governance.js';
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
 * 人填字段：ownerGroup（学科组 机械/电路）+ season（赛季 "25"）+ robotCode（车代号 R1/R2）+ mechanism（机构，分组键）
 * + name/uri + 可选 subType（电路子类型 图纸/驱动）+ 可选 relatedRepo/relatedCommit。
 *
 * **C5 来源 seam 由 server/路由钉，客户端不给**——故 omit submittedVia（store 钉 `console`）+ kind/versionNo/revision
 *（路由经纯函数派生：versionNo=nextArtifactVersionNo 四键自增、kind=deriveArtifactKind、revision=`v${versionNo}`）。
 *
 * **I0 图纸日志永无人维度**：ArtifactRef 无任何 person 字段，本请求也绝不收提交人/确认人——日志主键是
 * 学科组 + 赛季 + 车 + 机构 + 版本 + 归档物，不是「谁提交」（与 PmCreatePanel 的 confirmer 不同；ArtifactRef
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
    ownerGroup: z.enum(['mechanical', 'electrical']),
    season: z.string().min(1),
    robotCode: z.string().min(1),
    mechanism: z.string().min(1),
    subType: z.enum(['drawing', 'driver']).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.ownerGroup === 'electrical' && data.subType === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '电路组归档物必须指定 subType（drawing / driver）',
        path: ['subType'],
      });
    }
    if (data.ownerGroup === 'mechanical' && data.subType !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '机械组归档物不应带 subType',
        path: ['subType'],
      });
    }
  });
export const CreateArtifactResponseSchema = z.object({
  artifact: ArtifactRefSchema,
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
