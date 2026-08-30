import type {
  ActorRef,
  Dependency,
  GovernanceSnapshot,
  Group,
  KnowledgeNode,
  Member,
  MemberRole,
  Need,
  RosterImportFailure,
  RosterImportRow,
  Season,
  Task,
  TaskStatus,
} from '@teamhub/hub-contracts';

/**
 * `setProjectManager` 结果（MEMBER-PM-FLAG，公测补强刀②b）：判别联合——
 * `ok` 带更新后成员；`not-found` = id 不存在（路由转 404）；`last-projectmanager` = 降级保护拦截
 * （目标是最后一个持旗成员且新值=false，路由转 409），仅 `guardLastProjectManager` 开启时可能返回。
 */
export type SetProjectManagerResult =
  | { ok: true; member: Member }
  | { ok: false; reason: 'not-found' | 'last-projectmanager' };

/**
 * `importRoster` 结果（ROSTER-IMPORT，K8）：报告里**非 failed 那五段** + 刀④ 起新增 store 侧 failed——
 * 纯解析层坏行（parseRosterCsv errors）仍由路由拼进最终 `RosterImportReport`；本 store 侧回它做出的
 * 名单事实变更 + **组名命中非叶子/哨兵组而被拒的行**（PROGRAM-GROUP-ABSTRACT 刀④：抽象组=汇报视角、
 * 不可挂人，拒行进 failed 说明原因，行号随 RosterImportRow.line 指回 CSV 原行）。
 * 全是名单事实回显给操作者本人（I0：绝不含任何按人聚合/排名/按人筛选派生）。
 */
export interface RosterImportOutcome {
  created: string[];
  updated: string[];
  /** 刀④：组名命中既有**非叶子/哨兵组**（如「程序」/「全组联调」）而被拒的行（成员未建未改）。 */
  failed: RosterImportFailure[];
  missingFromSheet: string[];
  createdGroups: string[];
  autoReviewers: string[];
}

/**
 * createGroup 入参（刀④ 组管理最小版）：只有 name——id（`grp-new-N`）、seasonId（当前 active ??
 * 顶层）、parentGroupId=null、kind=custom 全由实现钉（新建组天然无子组 = 叶子组）。
 */
export type GroupDraft = Pick<Group, 'name'>;

/**
 * 组管理写结果（刀④）判别联合，路由层映射 200/404/409：
 *  - `name-exists`：同名组已存在（组名是 importRoster 的匹配键，重名会静默错挂）。
 *  - `not-leaf`：目标是非叶子/哨兵组（抽象汇报视角，不可改名/删除——改名只开放给叶子组；
 *    哨兵组 grp-convergence 同列）。
 *  - `has-members` / `has-children` / `has-tasks`：删除防孤儿守卫（先迁走成员/任务再删）。
 */
export type CreateGroupResult =
  | { ok: true; group: Group }
  | { ok: false; reason: 'name-exists' };
export type RenameGroupResult =
  | { ok: true; group: Group }
  | { ok: false; reason: 'not-found' | 'not-leaf' | 'name-exists' };
export type DeleteGroupResult =
  | { ok: true; group: Group }
  | {
      ok: false;
      reason: 'not-found' | 'not-leaf' | 'has-members' | 'has-children' | 'has-tasks';
    };

/**
 * pm-core 域写入口（STORE-SPLIT-SQLITE，product-redefine-2026-07 §4.4 / §9-③）：项目计划表
 * 录入 + 受限状态机迁移 + 身份写路径——从原 god-interface `GovStore`（gov-store.ts:184 一带，
 * 21 方法混 6 域）按语义拆出的第一个域接口，与 `ArtifactStore`/`ScheduleStore` 一起经交叉类型
 * 复合回 `GovStore`（见 gov-store.ts），三实现/消费点零行为变化。
 *
 * 读：`getSnapshot()`（D-040 首刀，已实现）——**留在本域**：GovernanceSnapshot 11 字段
 * （tasks/dependencies/needs/knowledgeNodes/artifacts/members/groups/projects/…）的核心真相载体，
 * 本质是 pm-core 的读出口（resources/resourceSessions 不在其内，见 ScheduleStore 独立读口注释）。
 */

/**
 * createTask 入参：title/projectId/groupId/rawSummary/robotTarget/intrinsicComplexity/ownerId/collaboratorIds 等人本字段。
 * status/statusSource 可省略 → 实现默认 `pending` / `'console'`（C5：真实进度优先 git/lark 派生信号，console 录入是兜底）。
 * lastProgressAt 不由调用方给（由 commit/check-in 派生信号回填），故从 draft 剔除。
 */
export type TaskDraft = Omit<
  Task,
  'id' | 'status' | 'statusSource' | 'lastProgressAt' | 'createdAt' | 'updatedAt'
> &
  Partial<Pick<Task, 'status' | 'statusSource'>>;

/**
 * createDependency 入参：人手建的有向边——「卡住 = 在等哪个上游任务」是结构键（G2：blockedBy 由
 * Dependency 边经 toDepGraphView 派生、永不在 Task 上另存）。aiSuggested 边 confirmedBy=null 时只进建议视图。
 * **status 不由调用方给**（D-042 clamp 初始态）：新边 Store 钉 `active`（上游未满足=被卡），satisfied/waived 由
 * 后续派生/人工 waive 转。**confirmedBy（用户拍板 Q1=ActorRef 作内部凭证）**：人建边记 {id:memberId, source}，
 * 仅作内部归因凭证——**永不经读视图对第三方暴露、永不用于排名**（toDepGraphView 不输出 confirmedBy；I0/A4）。
 */
export type DependencyDraft = Omit<
  Dependency,
  'id' | 'status' | 'createdAt' | 'updatedAt'
>;

/**
 * createNeed 入参：前置需求一等公民（G3）。缺口归组 providerGroupId、不归人（A1）；
 * claimedByMemberId 仅本人主动认领才填，非派单（C4 / A2）。
 * **status/openedAt/escalatedAt/claimedByMemberId 不由调用方给**（D-042 clamp 初始态 + A2 反派单）：新 Need
 * Store 钉 `open`、openedAt=now、escalatedAt=null、**claimedByMemberId=null**——新缺口必为「未认领」，
 * 认领是本人后续主动动作（非创建时由队长直接指派=派单，违 A2/C4）；escalated 仅「事持续无人认领」升级
 * （A4：升级的是事不是人）。confirmedBy 同 Dependency=内部凭证。
 */
export type NeedDraft = Omit<
  Need,
  'id' | 'status' | 'openedAt' | 'escalatedAt' | 'claimedByMemberId'
>;

/**
 * closeoutKbNode 入参：KB-CORE 结案派生的知识节点（IssueCard→…→Archive 闭环的源 payload 类型
 * 随 KB-CORE 移植 schema 后补全；本刀先钉派生出口=KnowledgeNode，复用同一 GovernanceSnapshot）。
 */
export type KnowledgeNodeDraft = Omit<KnowledgeNode, 'id' | 'createdAt'>;

/**
 * createSeason 入参：id 由 store 生成；status 也剔除——新建赛季恒 `active`（语义=宣告新的
 * 当前赛季），由实现钉死，调用方不可传 archived 造"生而废弃"的赛季。
 */
export type SeasonDraft = Omit<Season, 'id' | 'status'>;

/**
 * 战队项目计划表核心读写出入口（pm-core 域；D-040/D-042/D-041）。
 *
 * 写（白名单，实现见 测试 fake / 旧 JSON decorator / SqliteGovRepository）：
 *   - `createTask` / `createDependency` / `createNeed`：PM 项目计划表 C1 兜底录入（任务、依赖图人手建边、缺口暴露）。
 *   - `closeoutKbNode`：KB-CORE 结案派生 `KnowledgeNode`（POST /api/kb/closeout 消费）。**D-042 决策 1**：
 *     结案派生 + `knowledgeNodes/taskKnowledgeTags` 读路径复用同一 `GovernanceSnapshot`（不必扩本 interface）——
 *     相似 bug 检索的 IssueCard 语料**不在本快照内**，已收窄到独立 `KbStore`（见 gov-store.ts）。
 *   - `updateTaskStatus` / `waiveDependency`：受限状态机迁移（非 CRUD，只在既有枚举内推进生命周期态）。
 *   - `setMemberPin`：登录身份写路径（IDENTITY-LITE，D-083 §4.2）——members 是 GovernanceSnapshot 字段，
 *     故留本域而非独立域。
 *
 * 宪法护栏（写入实现时必须延续，见 AGENTS §5）：
 *   - **C2 反排名**：白名单永不暴露 memberId 完成量横比维度；Task.ownerId 只表「谁负责」分工（D-041 ② 安全堆）。
 *   - **G2 不双写**：系统库是唯一真相，写入只落本 Store、不回写飞书 Bitable；blockedBy 由 Dependency 边派生、不另存。
 *   - **I0 / confirmedBy**：确认语义记「何时 / 经哪条渠道」（timestamp / ActorRef.source），不退化成可 `groupBy`
 *     的裸 memberId 历史（不能事后算「谁确认最多」）。
 *   - **C1 派生优先**：写入是兜底录入口，不取代 git/lark 派生信号，不得被上层当主录入口退化成新死表。
 *   - **C3 小作坊**：白名单止于三支柱当下所需，不预铺完整 CRUD / RBAC。四条 append（create* + closeoutKbNode
 *     经 append 语义写 KnowledgeNode）皆只追加、不开 update/delete/list；另两条受限状态机迁移
 *     （updateTaskStatus / waiveDependency）只在既有枚举上推进文档化的生命周期态。
 *   - **密钥纪律**：pinHash 只落盘、绝不经读视图外露（路由层回带走 MemberPublicSchema 剥离）。
 */
export interface PmCoreStore {
  getSnapshot(): Promise<GovernanceSnapshot>;

  createTask(draft: TaskDraft): Promise<Task>;
  createDependency(draft: DependencyDraft): Promise<Dependency>;
  createNeed(draft: NeedDraft): Promise<Need>;
  closeoutKbNode(draft: KnowledgeNodeDraft): Promise<KnowledgeNode>;

  /**
   * 任务状态流转（POST /api/tasks/:id/status）。在既有 TaskStatus 枚举内迁移（含 done=标真实完成）。
   * **statusSource 由 Store 钉 `console`**（C5：人工流转是最低优先源，git/lark/derived 派生信号可覆盖）。
   * bump updatedAt；lastProgressAt 不动（仅派生信号回填）。`by`（操作者留名，TASK-TIMELINE）给了则随
   * transition 落卡（身份模式路由注入 sessionActor、匿名模式 body 供；不给也放行，transition 无 by）。
   * id 不存在 → 返回 null（路由层转 404）。
   */
  updateTaskStatus(taskId: string, status: TaskStatus, by?: ActorRef): Promise<Task | null>;
  /**
   * 软删除依赖边（POST /api/dependencies/:id/waive）。转 status=`waived`（人工判定作废），bump updatedAt，
   * **保留** confirmedBy/createdAt（G2 单一真相可审计）。waived 边经 toDepGraphView 从图隐藏，但仍留库
   * （区别于物理 delete）。id 不存在 → 返回 null（路由层转 404）。
   */
  waiveDependency(depId: string): Promise<Dependency | null>;

  /**
   * 设 / 改成员登录 PIN 散列（PUT /api/members/:id/pin，IDENTITY-LITE，D-083 §4.2）。就地改 members[idx]
   * 的 `pinHash`（scrypt 格式串，**由路由层散列后传入**）+ bump updatedAt、钉 updatedBy=`console`。
   * id 不存在 → 返回 null（路由层转 404）。**密钥纪律**：pinHash 只落盘、绝不经读视图外露（路由层回带
   * 走 MemberPublicSchema 剥离）。旧 JSON decorator 落 governance.json（members 是 GovernanceSnapshot 字段，
   * persist 失败按 idx 原地还原，镜像 updateTaskStatus）。
   * **`pinHash = null`（公测余项⑦ PIN-RESET）= 清除 pinHash**（DELETE /api/members/:id/pin 消费）：
   * 成员回到「无 pinHash 免 PIN」态，下次登录后经 firstSetup 流程自行重设。授权（须 superAdmin）在路由层判。
   * **pinPlaintext 双写双清（打磨轮刀⑧②，用户拍板的密钥纪律例外）**：设值路径须同笔传明文副本
   * （供 GET /api/members/:id/pin「显示PIN」单条读取）；未传则连同旧副本一并清（防 hash/明文错位）；
   * `pinHash = null` 清除路径明文副本同笔清。
   */
  setMemberPin(
    memberId: string,
    pinHash: string | null,
    pinPlaintext?: string,
  ): Promise<Member | null>;

  /**
   * 设 / 撤成员门验收人资格（PATCH /api/members/:id/gate-reviewer，GATE-CHECKLIST-IOU，D-087 拍板②）。
   * 就地改 members[idx] 的 `gateReviewer` 布尔位（照 setMemberPin 范式）+ bump updatedAt、钉 updatedBy=`console`。
   * **每年换届更新**（验收人=大三，换届交接门的一项，gate-checklist-iou.md §3）。授权（须现任验收人 /
   * 管理员）在路由层判。id 不存在 → 返回 null（路由层转 404）。**I0**：资格布尔而已，绝不做按人聚合/排行。
   * 旧 JSON decorator 落 governance.json（members 是 GovernanceSnapshot 字段，persist 失败按 idx 原地还原，
   * 镜像 setMemberPin）。响应回带走 MemberPublicSchema 剥 pinHash（路由层，密钥纪律）。
   */
  setMemberGateReviewer(
    memberId: string,
    gateReviewer: boolean,
  ): Promise<Member | null>;

  /**
   * 设成员组织身份（PUT /api/members/:id/role，K1 权限地基）。就地改 members[idx] 的 `role`
   * （groupAdmin/member 两档，照 setMemberGateReviewer 逐字形状）+ bump updatedAt、钉 updatedBy=`console`。
   * 授权（匿名=写门即可 / 身份=须持旗管理员）在**路由层**判。MEMBER-PM-FLAG 后 role 不再承载管理员权限
   * （原 superAdmin 档 → projectManager 旗标），故本写口无降级保护——降级保护随权限移到 setProjectManager。
   * id 不存在 → 返回 null（路由层转 404）。**I0**：只改一个枚举位，绝不做按人聚合/排行。
   * 旧 JSON decorator 落 governance.json（members 是 GovernanceSnapshot 字段，persist 失败按 idx 原地还原，
   * 镜像 setMemberGateReviewer）。响应回带走 MemberPublicSchema 剥 pinHash（路由层，密钥纪律）。
   */
  setMemberRole(memberId: string, role: MemberRole): Promise<Member | null>;

  /**
   * 授 / 收成员项目管理旗标（PUT /api/members/:id/project-manager + POST /api/setup/super-admin，
   * MEMBER-PM-FLAG 公测补强刀②b）。就地改 members[idx] 的 `projectManager` 布尔位（照 setMemberRole
   * 范式）+ bump updatedAt、钉 updatedBy=`console`。授权（匿名=写门即可 / 身份=须持旗管理员）在**路由层**
   * 判；**降级保护（不摘最后一个持旗成员）收进本方法同一临界区**（照余项⑥ nit③ TOCTOU 修复先例：
   * `opts.guardLastProjectManager` 开启时，判「至多 1 个持旗成员」与写在同一 store 调用内完成，堵住路由层
   * 先读后写的并发窗口）。结果走 `SetProjectManagerResult` 判别联合（ok / not-found /
   * last-projectmanager），路由层映射 200 / 404 / 409。**I0**：只改一个布尔位，绝不做按人聚合/排行。
   * 旧 JSON decorator 落 governance.json（persist 失败按 idx 原地还原，镜像 setMemberRole）。响应回带走
   * MemberPublicSchema 剥 pinHash（路由层，密钥纪律）。
   */
  setProjectManager(
    memberId: string,
    projectManager: boolean,
    opts?: { guardLastProjectManager?: boolean },
  ): Promise<SetProjectManagerResult>;

  /**
   * 名册批量导入（POST /api/roster/import，ROSTER-IMPORT，K8）：一次原子应用已校验行到
   * members + groups（**members/groups 都是 GovernanceSnapshot 字段 → 落 governance.json**）。
   *
   * 语义（K8 拍板③/④）：
   *  - **组解析**：`groupName` 匹配现有 `Group.name`，不存在则**自动建组**（id 生成照 nextSequentialId
   *    先例=`grp-new-N`、kind 用开放串默认值 `custom`、seasonId 取当前 active 赛季 ?? 顶层 seasonId）；
   *    同批同名组只建一次、计入 createdGroups。
   *  - **幂等键 = displayName**：命中既有成员 → 更新 grade/groupId/gateReviewer（**role / pinHash /
   *    projectManager 旗标永不动**——刀③ 起导入完全不写 role，组长走导入后确认页任命，重导幂等
   *    天然不洗已任命组长）；不命中 → 新建（id=`member-new-N`、role 恒 'member'、status=idle、
   *    currentTaskId=null、updatedBy='console'）。
   *  - **missingFromSheet**：库里有但表里没有的成员 → 只回报告、**绝不删**。
   *
   * 授权（匿名=写门即可 / 身份=须 superAdmin，但空板豁免登录）在**路由层**判——store 只做无条件应用。
   * **I0**：只做名单事实变更、绝不做任何按人聚合/排行/按人筛选。返回名单事实回显给操作者本人。
   */
  importRoster(rows: readonly RosterImportRow[]): Promise<RosterImportOutcome>;

  // ── 组管理最小版（PROGRAM-GROUP-ABSTRACT 刀④，D-072「设置页可增减组」前置缺口）─────────────────
  // 「可选组 = 叶子组且非哨兵」由 `deriveLeafGroups` 结构派生（parentGroupId 链，零 Group schema 改动）；
  // 授权（匿名=写门即可 / 身份=须持旗管理员）在**路由层**判，守卫全收进本方法同一临界区（照
  // setProjectManager TOCTOU 先例）。旧 JSON decorator 落 governance.json（groups 是 GovernanceSnapshot
  // 字段；create=append 类回滚、rename=idx 类、delete=写前存整条失败时原位插回）。

  /**
   * 新建叶子组（POST /api/groups）：只有 name（id/seasonId/parentGroupId=null/kind=custom 由实现钉，
   * 照 importRoster 自动建组先例）。同名（既有组，含非叶子/哨兵）→ `name-exists`（路由转 409）。
   */
  createGroup(draft: GroupDraft): Promise<CreateGroupResult>;
  /**
   * 组改名（PUT /api/groups/:id）：**仅叶子组可改**——非叶子/哨兵组（汇报视角）→ `not-leaf`（409）；
   * 撞其它组同名 → `name-exists`（409）；id 不存在 → `not-found`（404）。
   */
  renameGroup(groupId: string, name: string): Promise<RenameGroupResult>;
  /**
   * 删组（DELETE /api/groups/:id）：**仅叶子组可删** + 防孤儿——有成员 / 有子组 / 有任务引用 →
   * 对应 reason（409，先迁走再删）；非叶子/哨兵 → `not-leaf`；id 不存在 → `not-found`。
   * ok 时回带被删的组（路由响应投影用）。
   */
  deleteGroup(groupId: string): Promise<DeleteGroupResult>;

  /**
   * 空板默认组树（打磨轮刀⑤，onboarding-init-wizard-2026-07-25 §4）：real 模式真空板没有任何组 →
   * 正常模式启动装配（main.ts）调用本方法预建 contracts `buildDefaultGroupTree` 的默认树
   * （四组 + 程序母组 + grp-convergence 收敛哨兵组——CONVERGENCE-TASK-ENTRY 起空板预建哨兵组，
   * 总联调任务才有合法挂靠组）。**临界区内判空幂等**：groups 已非空
   * （demo seed / 既有数据）→ 什么都不做；空 → 一次性插入整棵树（seasonId 取当前 active ?? 顶层，
   * 照 createGroup 钉法）。旧 JSON decorator 落 governance.json（groups 是 GovernanceSnapshot 字段，
   * persist 失败整组还原，镜像 importRoster）；SqliteGovRepository 单事务读-判-写。
   */
  ensureDefaultGroups(): Promise<void>;

  // ── 挂单认领制窄写方法（TASK-POST-CLAIM，D-088 / docs/domains/pm.md）─────────────────
  // 全部照 updateTaskStatus/setMemberPin 受限迁移先例：就地改 tasks[idx] 的**自己那簇留名字段** + bump
  // updatedAt，id 不存在 → null（路由层转 404）。**红线**：留名只落单条任务卡（事实层，D-085），本域绝不
  // 派生任何按人聚合/排行/按人筛选。**无 dueDate**（D-083 G4）。「status 变则 statusSource 钉 console」
  // （C5：人工流转是最低优先源，与 updateTaskStatus 同律）。

  /**
   * 认领挂单（POST /api/tasks/:id/claim，§3）：登录本人一键领无主活，**即生效免确认**。**仅当现
   * ownerId===null 才写**——已有主返回 null（路由层据快照转 409；不覆盖他人的活）。写 ownerId +
   * claimedAt；status `pending`→`inProgress`（有主即开工；非 pending 不动）。`claimer`（TASK-TIMELINE）
   * 给了则随状态提升追加 transition 留名（路由层从名册构造）。id 不存在 → null（→404）。
   */
  claimTask(taskId: string, ownerId: string, claimedAt: string, claimer?: ActorRef): Promise<Task | null>;

  /**
   * 指派 / 转派（POST /api/tasks/:id/assign，§3；**同方法**——有主改主 = 转派）：写 ownerId + assignReason +
   * assignedBy 留名；**清 claimedAt**（指派非认领）+ **清 partnerMemberId / crossClaimConfirmedBy**（换主后
   * 旧搭档 / 旧跨组确认失效）。理由必填由路由 schema 层强制（AssignTaskRequestSchema.reason.min1）。
   * id 不存在 → null（→404）。
   */
  assignTask(
    taskId: string,
    ownerId: string,
    reason: string,
    assignedBy: ActorRef,
    at: string,
  ): Promise<Task | null>;

  /**
   * 设本组搭档位（POST /api/tasks/:id/partner，§4）：外组认领后本组补位（师傅 / 对接人）。只写
   * partnerMemberId（"本组"校验在路由层）。显式缺口黄标，**不硬阻塞**（A1 先例）。id 不存在 → null（→404）。
   */
  setTaskPartner(taskId: string, partnerMemberId: string, at: string): Promise<Task | null>;

  /**
   * 跨组大任务组长事后确认（POST /api/tasks/:id/confirm-cross-claim，§4）：**非启动闸**（认领已即生效），
   * 只在事实卡留名 crossClaimConfirmedBy。组长鉴权在路由层（isGroupLeadOf）。id 不存在 → null（→404）。
   */
  confirmCrossClaim(taskId: string, confirmedBy: ActorRef, at: string): Promise<Task | null>;

  /**
   * 标完成（POST /api/tasks/:id/complete，§5）：status→`done` + completedBy 留名 + statusSource `console`
   * （C5）；**清 reviewedBy / reviewNote**（新一轮完成清旧验收——重开后重新走验收）。id 不存在 → null（→404）。
   */
  completeTask(taskId: string, completedBy: ActorRef, at: string): Promise<Task | null>;

  /**
   * 验收 / 抽查（POST /api/tasks/:id/review，§5）：`accept` = 写 reviewedBy(+note)、status 保持 `done`
   * （验收态 accepted 由 deriveTaskAcceptance 派生，不动 TaskStatus 枚举）；`reject`（打回）= status→`inProgress`
   * + reviewedBy + reviewNote（打回理由）+ statusSource `console`。**reviewNote 一律以本轮为准**（note
   * 未给则清上一轮残留）。验收人名单鉴权 + done 前置判（非 done → 409）都在路由层。
   * id 不存在 → null（→404）。
   */
  reviewTask(
    taskId: string,
    reviewedBy: ActorRef,
    outcome: 'accept' | 'reject',
    note: string | undefined,
    at: string,
  ): Promise<Task | null>;

  /**
   * 新建赛季（POST /api/seasons，SEASON-CREATE 补链路——总览页空态文案"先在设置里建一个赛季"
   * 此前指向不存在的入口，本方法补上写口）。**语义 = 宣告新的当前赛季**：新赛季恒 status=`active`，
   * 同笔把既有 active 赛季转 `archived`（一届一个当前赛季；明年开季新建时老赛季自然归档，
   * 不需要独立 archive 端点）。id 由 store 生成（`season-new-N`）。同名/时间校验在路由层。
   * C3：不开 update/delete——归档只作为新建的伴随迁移存在，不提供任意改档口。
   */
  createSeason(draft: SeasonDraft): Promise<Season>;
}
