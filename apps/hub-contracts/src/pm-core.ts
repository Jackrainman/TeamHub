import { z } from 'zod';

import { ActorRefSchema, isoDateTimeSchema } from './common.js';
import { TaskInvestmentSchema } from './baseline.js';

/**
 * 治理数据真相层（D-026 第①层）+ 阻塞归因派生输出 + DepGraph 前端视图契约。
 *
 * 红线（AGENTS.md §5）落在 schema 形状上：
 * - 反排名（C2/A1）：阻塞归因/负载/DepGraph 视图的主键全是 task/group/dependency/need，
 *   **没有 memberId 维度、没有对人计数/时长聚合**，结构上无法 groupBy 出"谁慢了"。
 * - 派生优先（C1/C5）：Member/Task 的状态带 `statusSource`/`updatedBy` 标 derived/git/lark。
 * - AI 不替人拍板（C4）：Dependency/Need 的 aiSuggested 必须人 `confirmedBy` 后才生效。
 *
 * 本文件 = PM 通用 CASE 层实体（HUB-MODULARIZATION 第3步，从 governance.ts 纯搬移）：
 * Season/Project/Group/Member/Task/Dependency/Need + 其枚举 + 派生归因/DepGraph 视图契约。
 * 机器人在场层（SharedResource/ResourceSession/RelayHandoff/Presence*）已迁至 `schedule-infra.ts`。
 *
 * **HUB-MODULARIZATION 第4步（RobotTarget 去渗透）**：`Task.robotTarget` / `Project.robotTargets`
 * 由必填改 `.optional()`——核心（无机器人租户）不再强制填写机器人枚举；新增中性泛化槽
 * `Task.targetLabel?: string` 承载"目标标签"这一更通用的语义（robotics 垂直仍显示 R1/R2/shared，
 * 由 step6 词汇注入层把 `targetLabel` 收紧回 `RobotTargetSchema` 三值枚举；本步 UI/表单暂留
 * `robotTarget` 硬编码下拉作为 fallback，不等 step6）。**放弃的编译期保证**：`robotTarget` 曾是
 * `z.enum` 强校验，非法值在 schema parse 阶段就被拒；改 optional 后，闭集校验下沉到"路由层
 * VocabularyRegistry 校验器"（尚未实现，见 docs/design/modularization-feasibility.md §3.4 A①），
 * 在该校验器补齐前，服务器对 `targetLabel` 自由字符串**不做闭集校验**，只能靠测试兜底。
 */

// ---------------------------------------------------------------------------
// 公共枚举
// ---------------------------------------------------------------------------

/** 状态来源：'derived' = 系统派生（C5 优先于 console 录入）。 */
export const GovActorSourceSchema = z.enum(['lark', 'git', 'console', 'derived']);

export const RobotTargetSchema = z.enum(['R1', 'R2', 'shared']);

// ---------------------------------------------------------------------------
// Season / Project（按赛季分项目）
// ---------------------------------------------------------------------------

/**
 * S1 接线（product-redefine-2026-07 §4.1/§9-①）：曾是死脚手架（`SeasonsResponseSchema` 从未消费、
 * fixtures 里 seasonId 只是字面量）；现已接入真相层——`GovernanceSnapshot.seasons: Season[]`
 * （attribution.ts）+ `GET /api/seasons`（server.ts）+ fixtures 种一条 active season。
 * 是倒排基准线（BASELINE-DESIGN）`SeasonBaseline.seasonId` 未来引用的实体真相源。
 */
export const SeasonSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema.nullable(),
  status: z.enum(['active', 'archived']),
});

export const ProjectSchema = z.object({
  id: z.string().min(1),
  seasonId: z.string().min(1),
  name: z.string().min(1),
  // R1/R2 用标签，不为每台机器人割裂出 Project（保留跨机器人共享散件依赖）。
  // HUB-MODULARIZATION 第4步：改 optional——无机器人租户的 Project 不必填此机器人枚举数组
  // （Project 目前未进 GovernanceSnapshot/落盘，属尚未接线的 scaffolding 类型，改动零消费点回归面）。
  robotTargets: z.array(RobotTargetSchema).min(1).optional(),
  // 中性泛化槽，与 Task.targetLabel 对称（数组形态承接 robotTargets 复数）；同样尚无消费点，
  // 迁移脚本 scripts/migrate-robottarget.mjs 预留回填逻辑，供未来 Project 真正接入落盘时使用。
  targetLabels: z.array(z.string().min(1)).optional(),
  status: z.enum(['active', 'archived']),
  createdAt: isoDateTimeSchema,
});

// ---------------------------------------------------------------------------
// Group（可配置组织树，自引用）
// ---------------------------------------------------------------------------

/**
 * 已知组 kind（历史 fixtures 值 + 现存四组用到的字面量），仅供 UI 下拉 / 文档提示参考，
 * **非闭集校验依据**（AUDIT-DEBT-2026-07 §9-④）。`GroupKindSchema` 曾是焊死的四值 `z.enum`，
 * D-072「设置页可增减组」要求能新建闭集外的自定义组（如"宣传组"），故放宽为开放非空串——
 * 校验收紧下沉到未来"路由层 VocabularyRegistry 校验器"（同文件头部 RobotTarget 放宽先例的同一过渡态）。
 * 旧 gov.json 已落盘的四个字面量值仍是合法非空串，加载零改动（向后兼容）。
 */
export const KNOWN_GROUP_KINDS = [
  'mechanical',
  'electrical',
  'program',
  'custom',
] as const;

export const GroupKindSchema = z.string().min(1);

export const GroupSchema = z.object({
  id: z.string().min(1),
  seasonId: z.string().min(1),
  // 自引用：null = 顶层组；电控/视觉可并入程序，由配置决定，不写死（C3）。
  parentGroupId: z.string().min(1).nullable(),
  name: z.string().min(1),
  kind: GroupKindSchema,
});

// ---------------------------------------------------------------------------
// Member（+role+资历）
// ---------------------------------------------------------------------------

// 组织身份两档（MEMBER-PM-FLAG，公测补强刀②b，onboarding-pin-deadlock-2026-07-24 §3 刀②b）：
// member / groupAdmin。原 superAdmin 档由正交旗标 `Member.projectManager` 取代——单值枚举装不下
// 「队长兼组长」（= role:groupAdmin + projectManager:true），2026-07-24 用户提案采纳。
// 旧数据 role:'superAdmin' 由 MemberSchema 加载侧归一（见下 preprocess），枚举本身不再含它。
export const MemberRoleSchema = z.enum(['groupAdmin', 'member']);

/** 资历维度，仅服务 G5（对低资历更主动兜底）；绝不用于产能对比。 */
export const MemberGradeSchema = z.enum([
  'freshman',
  'sophomore',
  'junior',
  'senior',
  'graduate',
]);

export const MemberStatusSchema = z.enum([
  'idle',
  'working',
  'blocked',
  'offline',
]);

export const MemberObjectSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  role: MemberRoleSchema,
  grade: MemberGradeSchema,
  groupId: z.string().min(1),
  status: MemberStatusSchema,
  // 旧 BridgeMemberState.currentTask(free-text) → FK 外键。
  currentTaskId: z.string().min(1).nullable(),
  // 故意不放 blockedOn：被谁卡是 Task/Dependency 的结构事实，不是人的属性（反排名核心）。
  updatedBy: GovActorSourceSchema,
  updatedAt: isoDateTimeSchema,
  // ── 轻身份登录凭证（IDENTITY-LITE，D-083 §4.2）─────────────────────────────────────────────
  // **optional**：匿名模式（默认）永不填；身份模式下成员可自设 PIN（无 pinHash = 免 PIN 登录）。
  // **格式 = `scrypt:<saltHex>:<hashHex>`**（node:crypto scrypt + 随机盐，绝不存明文，见 hub-server/identity/pin.ts）。
  // **密钥纪律**：pinHash 只在落盘 gov.json 里存在，**任何返回 Member 的读视图/快照响应必须剥离**——
  // 用下方 `MemberPublicSchema`（.omit pinHash）过读边界，照 confirmedBy/passedBy 的 I0 剥离先例。
  // 旧 gov.json（无此字段）optional 兜底、照常加载（D-080 向后兼容）。
  pinHash: z.string().min(1).optional(),
  // ── 门验收人名单（GATE-CHECKLIST-IOU，D-087 拍板②/体检报告 ②-2）──────────────────────────
  // **optional 布尔位**：`true` = 该成员在「验收人名单」上（有权豁免欠条 waived + 门验收兜底）。
  // 落点选 Member 布尔位而非新实体 / 新 MemberRole 档（additive、非 refactor-first——体检 ②-2 裁定）。
  // **语义=每年换届更新**：验收人=大三，换届交接门的一项（gate-checklist-iou.md §3）。旧 gov.json
  // 无此字段 optional 兜底、照常加载（D-080 向后兼容）。**I0**：资格布尔而已，绝不做按人聚合/排行。
  gateReviewer: z.boolean().optional(),
  // ── 项目管理旗标（MEMBER-PM-FLAG，公测补强刀②b）──────────────────────────────────────────
  // **optional 布尔位，缺省 false**：`true` = 该成员持「项目管理」旗标——原 superAdmin 角色的正交化，
  // 与组长身份不冲突（队长兼组长 = role:groupAdmin + projectManager:true）。旧 gov.json 无此字段
  // optional 兜底、照常加载；旧数据 `role:'superAdmin'` 由下方 MemberSchema 的 preprocess 加载归一
  // （flag=true + role:'member'），FileGovStore/SqliteGovStore 无需迁移脚本、fail-closed 校验不误杀。
  // **I0**：权限布尔而已，绝不做按人聚合/排行。
  projectManager: z.boolean().optional(),
});

/**
 * 旧数据归一（MEMBER-PM-FLAG 双读兼容）：v0.28 及更早落盘里 `role:'superAdmin'` 的成员，
 * 加载时归一为 `projectManager:true + role:'member'`——契约只加 optional 字段 + 本 preprocess，
 * store 层零迁移脚本。写侧从此只产两档 role + 旗标（授旗/收旗走 PUT /api/members/:id/project-manager）。
 */
function normalizeLegacyMember(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && (raw as { role?: unknown }).role === 'superAdmin') {
    return { ...(raw as Record<string, unknown>), role: 'member', projectManager: true };
  }
  return raw;
}

export const MemberSchema = z.preprocess(normalizeLegacyMember, MemberObjectSchema);

/**
 * 读视图用成员（IDENTITY-LITE）：剥 `pinHash`（密钥纪律——凭证散列永不过读边界，即便是散列也不外露）。
 * 照 `pm-requests.ts` 的 `DependencySchema.omit({ confirmedBy: true })` 范式：所有返回 Member 的端点
 *（`GET /api/members` 名册、`PUT /api/members/:id/pin` 回带、未来我的视图）一律经本 schema 过——
 * zod `.parse` 默认剥未知键，故经本 schema parse 的对象绝不含 pinHash。
 */
export const MemberPublicSchema = MemberObjectSchema.omit({ pinHash: true });

/**
 * PUT /api/members/:id/gate-reviewer（验收人名单维护，GATE-CHECKLIST-IOU / D-087 拍板②）：
 * 设 / 撤该成员的门验收人资格（`Member.gateReviewer` 布尔位）。**每年换届更新**（换届交接门的一项，
 * gate-checklist-iou.md §3）。授权语义（路由层）v1 = 宿主级写门即可（身份模式须登录、不再细分
 * "须现任验收人/管理员"——家庭影院级取舍，同 PIN 首次设置先例；见 gate-checklist-iou.md §7 偏离注记）。
 * 豁免鉴权本身走 `authz.ts` 的 `isGateReviewer` helper（403），与本写口权限相互独立。
 * 响应回带该成员**公开视图**（`MemberPublicSchema` 剥 pinHash，密钥纪律）。放本文件、照 identity.ts
 * 的 `SetPinRequestSchema`/`SetPinResponseSchema` 邻位范式（gateReviewer 字段与 MemberPublicSchema 皆在此）。
 */
export const SetGateReviewerRequestSchema = z.object({
  gateReviewer: z.boolean(),
});
export const SetGateReviewerResponseSchema = z.object({
  member: MemberPublicSchema,
});

/**
 * PUT /api/members/:id/role（成员角色维护，K1 权限地基）：设成员组织身份（groupAdmin/member 两档，
 * MEMBER-PM-FLAG 后项目管理权限不再经本写口——授旗/收旗走下方 PUT /api/members/:id/project-manager）。
 * 授权语义（路由层）：**匿名模式=宿主级写门即可**（v1，与 SetGateReviewer 对称，家庭影院级取舍）；
 * **身份模式=须 isSuperAdmin**（authz.ts helper，否则 403）。响应回带该成员公开视图
 * （MemberPublicSchema 剥 pinHash，密钥纪律）。放本文件、照上方 SetGateReviewer 邻位范式。
 */
export const SetMemberRoleRequestSchema = z.object({
  role: MemberRoleSchema,
});
export const SetMemberRoleResponseSchema = z.object({
  member: MemberPublicSchema,
});

/**
 * PUT /api/members/:id/project-manager（项目管理旗标授/收，MEMBER-PM-FLAG 公测补强刀②b）：
 * 设 / 撤该成员的 `projectManager` 布尔位（原 superAdmin 角色的正交化——与 role 写口拆分，
 * 「队长兼组长」天然成立）。授权语义（路由层）：**匿名模式=宿主级写门即可**；**身份模式=须
 * isSuperAdmin**（403）。**降级保护**（两模式统一，收进 store 同一临界区）：目标是最后一个持旗
 * 成员且新值=false → 409（防把全队锁死在无管理员态，原 superAdmin 降级保护的旗标版）。响应回带
 * 该成员公开视图（MemberPublicSchema 剥 pinHash，密钥纪律）。照上方 SetMemberRole 邻位范式。
 */
export const SetProjectManagerRequestSchema = z.object({
  projectManager: z.boolean(),
});
export const SetProjectManagerResponseSchema = z.object({
  member: MemberPublicSchema,
});

// ---------------------------------------------------------------------------
// Task（一等公民）
// ---------------------------------------------------------------------------

export const TaskStatusSchema = z.enum([
  'pending', // 待启动
  'inProgress', // 进行中
  'blocked', // 卡住
  'done', // 已完成
  'shelved', // 已搁置
]);

/** 任务自身难度（非工期估算、不进 CPM）；让"本来简单却被卡"可见。 */
export const TaskComplexitySchema = z.enum(['trivial', 'normal', 'hard']);

/**
 * 收敛任务范围字面量单源（AUDIT-DEBT-2026-07 §9-④）：此前 `'allLeafGroups'` 在
 * `pm-core.ts`（schema 定义）/`schedule.ts:332`/`attribution.ts:437` 三处各写一遍字符串字面量做
 * `===` 判断，三处一旦要扩展新的收敛范围值就要同改三处、极易漂移。改为从本常量单源派生
 * `TaskSchema.convergenceScope` 的 zod 枚举 + 消费端的判等，值不变（向后兼容）。
 */
export const CONVERGENCE_SCOPE_ALL_LEAF_GROUPS = 'allLeafGroups' as const;

export const TaskSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  groupId: z.string().min(1),
  title: z.string().min(1),
  rawSummary: z.string().min(1), // 人原话（C4 双存）
  polishedSummary: z.string().min(1).optional(), // AI 润色（C4 双存）
  status: TaskStatusSchema,
  statusSource: GovActorSourceSchema, // C5：git/lark/derived 优先于 console
  ownerId: z.string().min(1).nullable(),
  collaboratorIds: z.array(z.string().min(1)),
  // HUB-MODULARIZATION 第4步：改 optional——无机器人租户建任务不必填机器人枚举。
  robotTarget: RobotTargetSchema.optional(),
  // 中性泛化槽：无机器人租户填"目标平台/特性域"等自由标签；robotics 垂直暂仍走 robotTarget
  // 三值枚举（表单/卡片 fallback，step6 收口）。派生投影（toDepGraphView）读 targetLabel ?? robotTarget。
  targetLabel: z.string().min(1).optional(),
  intrinsicComplexity: TaskComplexitySchema,
  // 收敛任务标记（optional，仅总联调类型）：'allLeafGroups' = 所有叶子组各到至少一人在场
  // （全组各一人，D-072 决定 L）。未填 = 普通任务（普通 groupId 持有语义，行为完全不变）。
  // 纯增量 optional：既有 fixture / 落盘 JSON 不填 → parse 为 undefined，向后兼容。
  convergenceScope: z.enum([CONVERGENCE_SCOPE_ALL_LEAF_GROUPS]).optional(),
  lastProgressAt: isoDateTimeSchema.nullable(), // 最近推进信号（commit/check-in 派生）
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  // BASELINE-CORE（D-083 §4.1，baseline-design.md §3/§5 红线1）：里程碑挂接，多对一（一个里程碑
  // 挂多个 Task），"哪个组慢了"从挂接任务的组归属派生，不单独建模。**绝不加 dueDate**——快慢
  // 只从 `milestoneId` 指向的 `BaselineMilestone.plannedAt` 派生，压力落在事上不落在人的日期上。
  milestoneId: z.string().min(1).optional(),
  // 投资类任务三维分类（baseline-design.md §1 细节4）：horizon×value×timeAccumulation。
  // 纯增量 optional，形状定义见 baseline.ts:TaskInvestmentSchema（避免两处定义漂移）。
  investment: TaskInvestmentSchema.optional(),
  // ── 挂单认领制留名字段簇（TASK-POST-CLAIM，D-088 / D-085 名字三层）───────────────────────────
  // 全为**事实卡留名位**（认领/指派/搭档/确认/完成/验收），无一新实体、**无一 dueDate**（红线：
  // Task 永不加个人截止日期，D-083 G4）。名字只在**单条任务卡（事实层）**可见——聚合层永不做
  // （不按人排行/频次/按人筛选，唯一例外=既有「我的视图」本人过滤）。逐字段照上方 milestoneId?/
  // investment? 纯增量 optional 先例——旧 fixture / 落盘 JSON 不填 → parse 为 undefined，向后兼容（D-080）。
  // **架构裁定**（arch-checkup-2026-07-15 D1 债路径②）：task-post-claim.md §8 字面"三个字段"扩为
  // 本字段簇（§3 认领时刻 + §3 指派理由/指派人 + §4 搭档位 + §4 组长确认留名 + §5 两档完成/验收留名），
  // 全落 Task 本体 optional 标量，**不复活 TaskProgressSignal 死脚手架**（体检 D2 / ③-4 避坑）。
  //
  // §3 认领时刻：认领即生效免确认（挂单唯一硬闸在门上）。认领人 = `ownerId` 本身（登录本人一键领），
  // 故事实卡 = `ownerId` + `claimedAt` 两字段合读，不另存"认领人"（避免与 ownerId 冗余漂移）。
  claimedAt: isoDateTimeSchema.optional(),
  // §3 指派 / 转派强制理由（"分配 = 显式培养投资"——挂单零摩擦、指派多一格，摩擦力就是制度）。
  // schema 层只声明 optional（既有任务无此字段）；"指派/转派时理由必填"由写路由的
  // `AssignTaskRequestSchema.reason.min(1)` 在 schema 层强制（见 pm-requests.ts），Task 本体不强制。
  assignReason: z.string().min(1).optional(),
  // §3 指派人留名（谁把这活派给 `ownerId`）。ActorRef 事实卡留名，**非启动闸**。
  assignedBy: ActorRefSchema.optional(),
  // §4 本组搭档位：外组认领后本组补位的成员 id（师傅/对接人，组长默认可自任）——"跨组是学习通道
  // 不是甩锅通道"。显式缺口 = 黄标（"待本组搭档"），**不硬阻塞干活**（A1 先例：暴露缺口不拦人）。
  // 落地 = 一个 optional 字段，不建新域（task-post-claim.md §4 明示）。
  partnerMemberId: z.string().min(1).optional(),
  // §4 跨组认领"大任务"的组长事后确认留名——**不是启动闸**（认领已即生效；A1 先例：暴露缺口
  // 不拦人、全系统唯一硬闸在门上；照 gate-checklist-iou.md 的"确认 = 事后留名/黄标暴露"先例）。
  // 缺信号靠组长转派权兜底（事前结构信号、事后转派两层）。照 Dependency.confirmedBy / baseline
  // passedBy 的 ActorRef 留名先例。
  crossClaimConfirmedBy: ActorRefSchema.optional(),
  // §5 标完成留名（简单活 = 本人标完成 + 留名；学长有抽查打回权，不强制每单看）。ActorRef 事实卡。
  completedBy: ActorRefSchema.optional(),
  // §5 学长验收 / 抽查留名（大活 = 必须学长验收留名才算完）。**验收态是派生的**（deriveTaskAcceptance），
  // 不动 TaskStatus 枚举——done 后大活仍显"待验收"徽章，reviewedBy 留名后才 accepted。
  reviewedBy: ActorRefSchema.optional(),
  // §5 验收备注 / 打回理由（reject 时写打回理由；accept 时可空或写抽查备注）。事实卡留名同处。
  reviewNote: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------
// 挂单认领制结构尺与验收态派生（TASK-POST-CLAIM，D-088）：纯函数、无 IO，
// 照 baseline.ts:deriveInvestmentWarnings 姊妹范式（阈值/规则做成可调导出常量，人人能心算）。
// **判定 = 纯函数、最小 schema、不建新实体**（D-088 防屎山基准）。
// ---------------------------------------------------------------------------

/**
 * "大任务"结构尺的调节旋钮（**TODO 位，暂不实现**——task-post-claim.md §4 已知边界）：
 * 赛季后期几乎全图都在关键路径上 → "大任务"变密、审核/验收变多。若真压垮学长带宽，调节旋钮
 * 现成 = 收紧"大"的定义（如只计 N 周内到期的门的挂接）——那时把本常量设为周数，在 `isBigTask`
 * 里加"门 plannedAt 距今 ≤N 周"过滤即可。现阶段 `null` = 不设窗口（有门挂接即算大），v1 判定最简。
 */
export const BIG_TASK_GATE_LOOKAHEAD_WEEKS: number | null = null;

/**
 * "大任务"判定（task-post-claim.md §4："不看大小看结构"，机器可判、**无新增字段**）：
 * - 挂门/里程碑（`task.milestoneId != null`，有门等）**或**
 * - 有下游依赖边（`dependencies` 里存在 `fromTaskId === task.id` 且 `status !== 'waived'`，有人等）。
 *
 * 只看结构信号（门 + 下游），不引入"基础性/重要度"字段（§4 明确拒绝，防屎山）。**waived 边不算
 * "有人等"**——已判定作废的依赖不构成下游压力（与 toDepGraphView 跳过 waived 边一致）。
 * 大任务 = 跨组认领需组长事后确认 + 完成须学长验收（见 `deriveTaskAcceptance`）。
 * 调节旋钮见 `BIG_TASK_GATE_LOOKAHEAD_WEEKS`（暂未实现）。
 */
export function isBigTask(
  task: Pick<Task, 'id' | 'milestoneId'>,
  dependencies: Pick<Dependency, 'fromTaskId' | 'status'>[],
): boolean {
  if (task.milestoneId != null) return true;
  return dependencies.some(
    (d) => d.fromTaskId === task.id && d.status !== 'waived',
  );
}

/** 任务验收态（派生态，**非 TaskStatus 枚举值**——见 deriveTaskAcceptance 头注）。 */
export type TaskAcceptanceState =
  | 'notDone'
  | 'selfDone'
  | 'awaitingReview'
  | 'accepted';

/**
 * 验收态派生（task-post-claim.md §5 两档制，D-088）——**派生态，不动 TaskStatus 枚举**（体检已核
 * 五态够用）："大活必须学长验收才算完" = done 后仍显"待验收"徽章，reviewedBy 留名后才 accepted：
 * - `notDone`：`status !== 'done'`（还没标完成，无所谓验收）。
 * - `selfDone`：done + 简单活（`!isBig`）——本人标完成即算完，学长仅抽查打回权。
 * - `awaitingReview`：done + 大活（`isBig`）+ 未验收（`!reviewedBy`）——done 了但仍"待验收"。
 * - `accepted`：done + 大活 + 已 `reviewedBy` 留名——学长验收过，真正算完。
 *
 * `isBig` 由调用方先算（`isBigTask`）传入，避免本函数重复查依赖边（照 deriveGroupsBehind 传 drift 先例）。
 */
export function deriveTaskAcceptance(
  task: Pick<Task, 'status' | 'reviewedBy'>,
  isBig: boolean,
): TaskAcceptanceState {
  if (task.status !== 'done') return 'notDone';
  if (!isBig) return 'selfDone';
  return task.reviewedBy ? 'accepted' : 'awaitingReview';
}

/**
 * 挂单态派生（task-post-claim.md §3："挂单 = ownerId 为空的活的显式状态"，**零新增字段**）：
 * `ownerId === null` 且 `status` 非 `done`/`shelved` —— 无主、仍待做的活即挂单（posted）。
 * done/shelved 的无主任务不算挂单（已完成/已搁置，池子里不再需要有人领）。
 * 纯派生、不落库：posted 不是 TaskStatus 枚举值（体检①已核 `ownerId` 已 nullable，零 schema 改动）。
 */
export function isPostedTask(task: Pick<Task, 'ownerId' | 'status'>): boolean {
  return (
    task.ownerId === null &&
    task.status !== 'done' &&
    task.status !== 'shelved'
  );
}

// ---------------------------------------------------------------------------
// Dependency（有向边，DAG）
// ---------------------------------------------------------------------------

export const DependencyTypeSchema = z.enum([
  'blocks', // from 阻塞 to
  'sharesResource', // 共享稀缺资源（机器人），互斥（同时用会撞）
]);

export const DependencyStatusSchema = z.enum([
  'active', // 上游未满足 → 下游被卡
  'satisfied', // 上游已完成 / Need 已提供 → 解封
  'waived', // 人工判定作废（AI 建议不判定，本人/组长 waive）
]);

export const DependencySourceSchema = z.enum(['human', 'aiSuggested', 'derived']);

export const DependencySchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  fromTaskId: z.string().min(1), // 上游
  toTaskId: z.string().min(1), // 下游（被卡的）
  type: DependencyTypeSchema,
  status: DependencyStatusSchema,
  source: DependencySourceSchema,
  // aiSuggested 边 confirmedBy=null 时只进"建议视图"，不参与归因传播（C4）。
  confirmedBy: ActorRefSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

// ---------------------------------------------------------------------------
// Need（前置需求，一等公民）
// ---------------------------------------------------------------------------

export const NeedStatusSchema = z.enum([
  'open', // 已暴露，未认领
  'claimed', // 有提供方认领
  'satisfied', // 已提供
  'escalated', // 持续无人认领 → 升级缺口级可见（A4：升级的是事不是人）
]);

export const NeedSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  onTaskId: z.string().min(1),
  description: z.string().min(1),
  // 缺口归组（"任务缺懂 RTOS 的人"），不归人（A1）。
  providerGroupId: z.string().min(1).nullable(),
  claimedByMemberId: z.string().min(1).nullable(), // 本人主动认领才填，非派单
  status: NeedStatusSchema,
  neededSkills: z.array(z.string().min(1)),
  source: z.enum(['human', 'aiSuggested']),
  confirmedBy: ActorRefSchema.nullable(),
  openedAt: isoDateTimeSchema,
  escalatedAt: isoDateTimeSchema.nullable(),
});

// ---------------------------------------------------------------------------
// TaskProgressSignal（派生信号薄载体）
// ---------------------------------------------------------------------------

export const ProgressSignalKindSchema = z.enum([
  'gitCommit', // 派生（C5 上游：Git）
  'larkCheckIn', // 派生（C5 上游：飞书一键 check-in）
  'manualNote', // 兜底录入（C1：录入是兜底）
]);

export const TaskProgressSignalSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  actor: ActorRefSchema, // 规范层约束只能本人；schema 不强制
  kind: ProgressSignalKindSchema,
  rawText: z.string().min(1),
  polishedText: z.string().min(1).optional(),
  at: isoDateTimeSchema,
});

// ---------------------------------------------------------------------------
// 阻塞归因输出（派生算法产物；任务键，无 memberId 维度）
// ---------------------------------------------------------------------------

export const BlockAttributionReasonSchema = z.enum([
  'upstreamBlocked',
  'upstreamInProgress',
  'unmetNeed',
  'sharedResourceBusy',
]);

export const BlockAttributionSchema = z.object({
  id: z.string().min(1),
  idleTaskId: z.string().min(1), // 被卡而空闲的任务
  idleGroupId: z.string().min(1), // 缺口归组（A1）
  rootBlockerTaskId: z.string().min(1), // 根因瓶颈任务
  rootBlockerGroupId: z.string().min(1),
  blockingDependencyIds: z.array(z.string().min(1)),
  unmetNeedIds: z.array(z.string().min(1)),
  reason: BlockAttributionReasonSchema,
  // 中性事实陈述：模板只填任务/组/Need 名，永不含人名或"谁慢"。
  factStatement: z.string().min(1),
  detectedBy: z.literal('derived'), // 永远派生，从不是人录入
  detectedAt: isoDateTimeSchema,
});

/** 负载信号：组键"联调链负载偏高"，不说"AB 慢"（A2 私聊本人 + 组长看组级缺口）。 */
export const OverloadSignalSchema = z.object({
  id: z.string().min(1),
  groupId: z.string().min(1),
  criticalChainTaskIds: z.array(z.string().min(1)),
  factStatement: z.string().min(1),
  detectedBy: z.literal('derived'),
  detectedAt: isoDateTimeSchema,
});

/**
 * 方向缺口（S2，D-069）：组键"某组缺懂 X 的方向"，逐字对齐 OverloadSignalSchema 范式
 * ——组键 + factStatement + detectedBy:'derived'，**无人维度字段（成员 / 分数 / 百分比）**。
 * A1：缺口归组不归人；`neededSkills` 描述能力方向，**不得用于反推或排序具体人**。
 * 由 `deriveDirectionGaps` 按 `Need.providerGroupId` 聚合 open+escalated 缺口派生。
 */
export const DirectionGapSeveritySchema = z.enum([
  'emerging', // 仅有 open 未认领缺口
  'pressing', // 有 escalated 缺口，或该组正卡住下游（出现在阻塞归因 rootBlocker）
]);

export const DirectionGapSchema = z.object({
  id: z.string().min(1),
  groupId: z.string().min(1), // 缺口归组（A1），永不归人
  neededSkills: z.array(z.string().min(1)), // 能力方向并集（去重、排序）
  evidenceTaskIds: z.array(z.string().min(1)),
  evidenceNeedIds: z.array(z.string().min(1)),
  severity: DirectionGapSeveritySchema,
  // 中性事实陈述：只填组名 + 缺口数 + 方向，永不含人名 / "谁慢" / "谁该来"。
  factStatement: z.string().min(1),
  detectedBy: z.literal('derived'), // 永远派生，从不是人录入
  detectedAt: isoDateTimeSchema,
});

export const GroupGapsResponseSchema = z.object({
  gaps: z.array(DirectionGapSchema),
  generatedAt: isoDateTimeSchema,
});

// ---------------------------------------------------------------------------
// DepGraph 前端视图（toDepGraphView 投影产物；同样任务键，无人效字段）
// ---------------------------------------------------------------------------

export const DepNodeStatusSchema = z.enum([
  'working', // 进行中
  'blockedIdle', // 被卡而空闲（正当）
  'freeIdle', // 自由空闲（真闲）
  'done', // 完成
  'gap', // 缺口 / 卡点源（自身挂未满足 Need）
]);

export const DepNodeKnowledgeSchema = z.object({
  title: z.string().min(1),
  kind: z.enum(['code', 'doc', 'person']),
  uri: z.string().min(1).nullable(),
});

export const DepNodeSchema = z.object({
  id: z.string().min(1), // taskId
  label: z.string().min(1),
  groupId: z.string().min(1),
  groupName: z.string().min(1),
  // HUB-MODULARIZATION 第4步：由必填 RobotTargetSchema 三值枚举放宽为自由字符串（可空）——
  // toDepGraphView 投影读 task.targetLabel ?? task.robotTarget，无机器人租户两者皆缺时填 null。
  robotTarget: z.string().min(1).nullable(),
  ownerLabel: z.string().min(1).nullable(), // 仅显示名，无效率/完成量
  // MY-VIEW（product-redefine §4.3）：机读键，供本人视图按 session memberId 精确匹配
  // "我负责的任务"（displayName 可能重名、不可靠）。非新增泄漏——ownerId 所指向的人本就已由
  // ownerLabel 显名暴露给第三方读视图，这里只是把同一公开事实换成机器可比对的键；不新增任何
  // 完成量/效率维度（I0）。
  ownerId: z.string().min(1).nullable(),
  status: DepNodeStatusSchema,
  blockedByTaskId: z.string().min(1).nullable(),
  blockedByLabel: z.string().min(1).nullable(), // "R1 底盘调试"（任务名，非人名）
  isCritical: z.boolean(),
  // 收敛任务（总联调，convergenceScope='allLeafGroups'）标记：前端 DAG 渲染「全组」徽章。
  // 由 toDepGraphView 从 task.convergenceScope 投影，非人维度（仍是任务结构属性）。
  isConvergenceTask: z.boolean(),
  intrinsicComplexity: TaskComplexitySchema,
  unmetNeedLabels: z.array(z.string().min(1)),
  // "被卡去学"挂接：被卡节点关联的知识/资料（中性给予，A3/D-027）。
  relatedKnowledge: z.array(DepNodeKnowledgeSchema),
});

export const DepEdgeKindSchema = z.enum([
  'normal',
  'critical',
  'blocking',
  'need',
]);

export const DepEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1), // from taskId
  target: z.string().min(1), // to taskId
  kind: DepEdgeKindSchema,
});

export const DepGraphSummarySchema = z.object({
  criticalCount: z.number().int().nonnegative(),
  blockedCount: z.number().int().nonnegative(), // 缺口/卡点源（gap）
  blockedIdleCount: z.number().int().nonnegative(), // 空闲(被卡)
  freeIdleCount: z.number().int().nonnegative(), // 空闲(自由)
});

export const DepGraphSchema = z.object({
  seasonId: z.string().min(1),
  projectId: z.string().min(1),
  stage: z.string().min(1),
  nodes: z.array(DepNodeSchema),
  edges: z.array(DepEdgeSchema),
  summary: DepGraphSummarySchema,
  generatedAt: isoDateTimeSchema,
});

// ---------------------------------------------------------------------------
// 列表响应包装（继承 { xxx: [] } 风格）
// ---------------------------------------------------------------------------

export const SeasonsResponseSchema = z.object({
  seasons: z.array(SeasonSchema),
});
/**
 * 赛季创建（POST /api/seasons，SEASON-CREATE 补链路）：id 服务端生成、status 恒由服务端钉
 * `active`（新建赛季=宣告"这是当前赛季"，旧 active 赛季由 store 同笔转 archived——一届一个
 * 当前赛季，明年新建时老赛季自然归档）。endsAt 可缺省（赛季结束日常在开季时未知）。
 */
export const CreateSeasonRequestSchema = z.object({
  name: z.string().min(1),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema.nullable().optional(),
});
export const CreateSeasonResponseSchema = z.object({ season: SeasonSchema });
export const ProjectsResponseSchema = z.object({
  projects: z.array(ProjectSchema),
});
export const GroupsResponseSchema = z.object({ groups: z.array(GroupSchema) });
export const MembersResponseSchema = z.object({
  // IDENTITY-LITE：名册读视图用 MemberPublicSchema（剥 pinHash）——GET /api/members 走此契约，
  // 凭证散列永不过读边界（密钥纪律）。
  members: z.array(MemberPublicSchema),
});
/**
 * GET /api/tasks 逐任务读视图元信息（TASK-POST-CLAIM，体检 D5 债）：base `Task` + `isBig`——
 * 大任务判定**下沉后端**（board 视图不查依赖图边，边只在 dep-graph 查询可见，故判定后端用
 * `isBigTask(task, dependencies)` 算好吐前端，前端直接用，不再各视图重复挂一份 dep-graph 查询；
 * 照 DepNode.isConvergenceTask 后端投影先例）。**`isBig` 是派生元信息、非落盘字段**：只在读响应
 * 出现，不进 `TaskSchema` 本体（TaskSchema 仍是落盘真相，`isBig` 每次读时现算）。
 */
export const TaskWithMetaSchema = TaskSchema.extend({ isBig: z.boolean() });

/**
 * GET /api/tasks 响应：逐任务带 `isBig` 元信息（TaskWithMetaSchema）。server 路由用
 * `isBigTask` 逐条算（体检 D5：判定下沉后端）。**形状变化波及消费端**：server GET /api/tasks
 * 须 map 出 isBig 后 parse；console 读契约由本 schema 单源推导（TaskWithMeta ⊇ Task，既有
 * `Task[]` 消费点协变兼容，零破坏）。
 */
export const TasksResponseSchema = z.object({
  tasks: z.array(TaskWithMetaSchema),
});
/**
 * GET /api/tasks?q= querystring（task-post-claim.md §3 "看谁做过这个问题"）：`q` 子串搜历史任务的
 * `title` / `rawSummary`（大小写不敏感），搜到后自己去联系做过的人。**红线**：只做子串过滤返回
 * 任务列表，搜索结果**永不聚合成"技能画像/花名册"页**（D-085 聚合层永不做）；也不按人筛选
 * （唯一例外 = 我的视图）。`q` optional——缺省 = 返回全部（现有行为不变，向后兼容）。
 */
export const TasksQuerySchema = z.object({
  q: z.string().min(1).optional(),
});
export const DependenciesResponseSchema = z.object({
  dependencies: z.array(DependencySchema),
});
export const NeedsResponseSchema = z.object({ needs: z.array(NeedSchema) });
export const BlockAttributionsResponseSchema = z.object({
  attributions: z.array(BlockAttributionSchema),
});

// ---------------------------------------------------------------------------
// 类型导出
// ---------------------------------------------------------------------------

export type GovActorSource = z.infer<typeof GovActorSourceSchema>;
export type RobotTarget = z.infer<typeof RobotTargetSchema>;
export type Season = z.infer<typeof SeasonSchema>;
export type CreateSeasonRequest = z.infer<typeof CreateSeasonRequestSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type GroupKind = z.infer<typeof GroupKindSchema>;
export type Group = z.infer<typeof GroupSchema>;
export type MemberRole = z.infer<typeof MemberRoleSchema>;
export type MemberGrade = z.infer<typeof MemberGradeSchema>;
export type MemberStatus = z.infer<typeof MemberStatusSchema>;
export type Member = z.infer<typeof MemberSchema>;
export type MemberPublic = z.infer<typeof MemberPublicSchema>;
export type SetGateReviewerRequest = z.infer<typeof SetGateReviewerRequestSchema>;
export type SetGateReviewerResponse = z.infer<typeof SetGateReviewerResponseSchema>;
export type SetMemberRoleRequest = z.infer<typeof SetMemberRoleRequestSchema>;
export type SetMemberRoleResponse = z.infer<typeof SetMemberRoleResponseSchema>;
export type SetProjectManagerRequest = z.infer<typeof SetProjectManagerRequestSchema>;
export type SetProjectManagerResponse = z.infer<typeof SetProjectManagerResponseSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskComplexity = z.infer<typeof TaskComplexitySchema>;
export type Task = z.infer<typeof TaskSchema>;
export type TaskConvergenceScope = NonNullable<Task['convergenceScope']>;
export type TaskWithMeta = z.infer<typeof TaskWithMetaSchema>;
export type TasksQuery = z.infer<typeof TasksQuerySchema>;
export type DependencyType = z.infer<typeof DependencyTypeSchema>;
export type DependencyStatus = z.infer<typeof DependencyStatusSchema>;
export type DependencySource = z.infer<typeof DependencySourceSchema>;
export type Dependency = z.infer<typeof DependencySchema>;
export type NeedStatus = z.infer<typeof NeedStatusSchema>;
export type Need = z.infer<typeof NeedSchema>;
export type ProgressSignalKind = z.infer<typeof ProgressSignalKindSchema>;
export type TaskProgressSignal = z.infer<typeof TaskProgressSignalSchema>;
export type BlockAttributionReason = z.infer<
  typeof BlockAttributionReasonSchema
>;
export type BlockAttribution = z.infer<typeof BlockAttributionSchema>;
export type OverloadSignal = z.infer<typeof OverloadSignalSchema>;
export type DirectionGapSeverity = z.infer<typeof DirectionGapSeveritySchema>;
export type DirectionGap = z.infer<typeof DirectionGapSchema>;
export type GroupGapsResponse = z.infer<typeof GroupGapsResponseSchema>;
export type DepNodeStatus = z.infer<typeof DepNodeStatusSchema>;
export type DepNodeKnowledge = z.infer<typeof DepNodeKnowledgeSchema>;
export type DepNode = z.infer<typeof DepNodeSchema>;
export type DepEdgeKind = z.infer<typeof DepEdgeKindSchema>;
export type DepEdge = z.infer<typeof DepEdgeSchema>;
export type DepGraphSummary = z.infer<typeof DepGraphSummarySchema>;
export type DepGraph = z.infer<typeof DepGraphSchema>;
