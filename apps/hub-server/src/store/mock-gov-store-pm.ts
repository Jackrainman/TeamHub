import { buildDefaultGroupTree } from '@teamhub/hub-contracts';
import type {
  ActorRef,
  Dependency,
  GovernanceSnapshot,
  Group,
  KnowledgeNode,
  Member,
  MemberRole,
  Need,
  RosterImportRow,
  Season,
  Task,
  TaskStatus,
} from '@teamhub/hub-contracts';
import {
  resolveActiveSeasonId,
  computeAbstractGroupIds,
  validateGroupRename,
  validateGroupDeletion,
  validateLastProjectManagerGuard,
  buildProjectManagerUpdate,
  buildClaimedTask,
  buildAssignedTask,
  buildCompletedTask,
  buildReviewedTask,
  buildCreatedTask,
  buildCreatedDependency,
  buildCreatedNeed,
  buildCreatedKbNode,
  buildCreatedSeason,
  applyMemberPin,
  applyMemberGateReviewer,
  applyMemberRole,
  applyDependencyWaive,
  applyTaskStatusTransition,
  buildRosterMemberCreate,
  buildRosterMemberUpdate,
  buildCreatedGroup,
} from './gov-store-logic.js';
import { cloneArrayFields } from './clone-snapshot.js';
import type {
  CreateGroupResult,
  DeleteGroupResult,
  DependencyDraft,
  GroupDraft,
  KnowledgeNodeDraft,
  NeedDraft,
  PmCoreStore,
  RenameGroupResult,
  RosterImportOutcome,
  SetProjectManagerResult,
  SeasonDraft,
  TaskDraft,
} from './gov-store.js';
import { nextSequentialId } from './id-sequence.js';
import { GOVERNANCE_ARRAY_FIELDS } from './mock-gov-store-base.js';
import type { InMemoryGovStoreBase } from './mock-gov-store-base.js';

/**
 * pm-core 域方法 mixin（GOV-SPLIT）：PmCoreStore 全部方法（getSnapshot + PM 录入簇 + KB 结案 +
 * 受限状态机迁移 + 身份写路径 + 名册导入 + 组管理 + 挂单认领制窄写 + 赛季创建）叠到基座上。
 * 方法体逐字自原 InMemoryGovStore 搬迁（mock-gov-store.ts 单文件 862 行拆分），零行为变化。
 */
type Base = new (...args: any[]) => InMemoryGovStoreBase;

export function PmCoreMixin<T extends Base>(
  BaseClass: T,
): T & (new (...args: any[]) => PmCoreStore) {
  return class InMemoryGovStorePm extends BaseClass {
    async getSnapshot(): Promise<GovernanceSnapshot> {
      // M7：返回浅拷贝（顶层对象 + 全 8 数组字段克隆，与构造期同一份克隆纪律），
      // 防外部读到 live 引用后 push/splice 绕过写白名单 mutate live store。
      // 标量字段沿用浅拷贝引用、数组逐字克隆——JSON 序列化与 live 快照逐字相同，
      // 故 FileGovStore.writeOnce() 落盘内容不变（无落盘回归）。
      // **不影响回滚链**：snapshotForRollback() 仍返回 live 引用，回滚走那条句柄。
      return cloneArrayFields(this.snapshot, GOVERNANCE_ARRAY_FIELDS);
    }

    /**
     * PM 项目计划表单条任务录入（C1 兜底录入口，POST /api/tasks）。Store 补 id + 时间戳 + 派生默认：
     * `status` 默认 `pending`、`statusSource` 默认 `console`（C5：真实进度优先 git/lark 派生，console 录入兜底）、
     * `lastProgressAt` 初始 null（由 commit/check-in 派生信号回填）。**C2/I0**：Task.ownerId 只表「谁负责」分工
     * （D-041 ② 安全堆），无完成量横比维度；不引入 dueDate（D-042 / G4 无硬截止）。
     */
    async createTask(draft: TaskDraft): Promise<Task> {
      const now = this.clock.now().toISOString();
      const task = buildCreatedTask(draft, nextSequentialId('task-new', this.taskSeq), now);
      this.snapshot.tasks.push(task);
      return task;
    }

    /**
     * PM 依赖边录入（POST /api/dependencies）。**D-042 clamp 初始态**：status 钉 `active`（人建边=断言上游卡下游，
     * satisfied/waived 由派生/人工 waive 转）。**confirmedBy（用户 Q1=ActorRef 内部凭证）**：人建边的 confirmedBy
     * 仅内部归因用，永不经读视图暴露/排名（toDepGraphView 不输出 confirmedBy）。**G2**：blockedBy 不在 Task 上另存，
     * 卡住原因纯由本边经 toDepGraphView 派生为结构键（上游任务名）。
     */
    async createDependency(draft: DependencyDraft): Promise<Dependency> {
      const now = this.clock.now().toISOString();
      const dependency = buildCreatedDependency(
        draft,
        nextSequentialId('dep-new', this.dependencySeq),
        now,
      );
      this.snapshot.dependencies.push(dependency);
      return dependency;
    }

    /**
     * PM 前置需求录入（POST /api/needs，G3 一等公民）。**D-042 clamp 初始态 + A2 反派单**：status 钉 `open`、
     * openedAt=now、escalatedAt=null、**claimedByMemberId=null**（新缺口必未认领，认领是本人后续主动动作、非创建即派单）。
     * **A1**：缺口归组 providerGroupId、不归人。
     */
    async createNeed(draft: NeedDraft): Promise<Need> {
      const now = this.clock.now().toISOString();
      const need = buildCreatedNeed(draft, nextSequentialId('need-new', this.needSeq), now);
      this.snapshot.needs.push(need);
      return need;
    }

    /**
     * KB-CORE 结案派生知识节点写入（POST /api/kb/closeout）。Store 补 id + createdAt（时间戳由注入 clock，
     * 派生默认）。**I0 守恒**：KnowledgeNode 无人维度——节点来源凭证是结构（resourceLinks 指向归档/文件/
     * 提交）+ 归档 generatedBy(ai/manual/hybrid)，**不存裸 memberId、不可事后 groupBy「谁结案最多」**。
     */
    async closeoutKbNode(draft: KnowledgeNodeDraft): Promise<KnowledgeNode> {
      const now = this.clock.now().toISOString();
      // 幂等：同一 issue 复结案派生的节点 name 相同（deriveKnowledgeNodeFromIssue 钉
      // `踩过的坑：${issue.title}`），draft 本身无 id。按 name dedup——命中则**原地覆盖、保留已有 id**
      // （主键稳定、刷新内容/时间戳），避免 500 重试 / 重复结案在治理快照里堆出重复 KnowledgeNode 主键。
      const idx = this.snapshot.knowledgeNodes.findIndex((n) => n.name === draft.name);
      if (idx >= 0) {
        const existing = this.snapshot.knowledgeNodes[idx];
        const updated: KnowledgeNode = { ...draft, id: existing.id, createdAt: now };
        this.snapshot.knowledgeNodes[idx] = updated;
        return updated;
      }
      const node = buildCreatedKbNode(draft, nextSequentialId('kn-cl', this.knowledgeNodeSeq), now);
      this.snapshot.knowledgeNodes.push(node);
      return node;
    }

    /**
     * 任务状态流转（POST /api/tasks/:id/status）。受限状态机迁移、非 CRUD：在既有 TaskStatus 枚举内改状态
     * （含 inProgress→done 标真实完成）。**statusSource 钉 `console`**（C5：人工流转记最低优先源，将来 git/lark
     * 派生信号可覆盖）；lastProgressAt 不动（仅派生信号回填）。id 不存在 → null（路由转 404）。
     */
    async updateTaskStatus(taskId: string, status: TaskStatus, by?: ActorRef): Promise<Task | null> {
      const idx = this.snapshot.tasks.findIndex((t) => t.id === taskId);
      if (idx === -1) return null;
      const now = this.clock.now().toISOString();
      const updated = applyTaskStatusTransition(this.snapshot.tasks[idx], status, now, by);
      this.snapshot.tasks[idx] = updated;
      return updated;
    }

    /**
     * 软删除依赖边（POST /api/dependencies/:id/waive）。转 status=`waived`（人工判定作废），bump updatedAt，
     * **保留** confirmedBy/createdAt（G2 可审计）。waived 边经 toDepGraphView 从图隐藏，但仍留库。
     * id 不存在 → null（路由转 404）。
     */
    async waiveDependency(depId: string): Promise<Dependency | null> {
      const idx = this.snapshot.dependencies.findIndex((d) => d.id === depId);
      if (idx === -1) return null;
      const now = this.clock.now().toISOString();
      const updated = applyDependencyWaive(this.snapshot.dependencies[idx], now);
      this.snapshot.dependencies[idx] = updated;
      return updated;
    }

    /**
     * 设 / 改成员登录 PIN 散列（PUT /api/members/:id/pin，IDENTITY-LITE）。就地改 members[idx].pinHash
     * （scrypt 串，路由层散列后传入）+ bump updatedAt、钉 updatedBy=`console`。id 不存在 → null（路由转 404）。
     * **`pinHash = null`（公测余项⑦ PIN-RESET）= 清除 pinHash**（DELETE pin 消费）：成员回到免 PIN 态。
     * **pinPlaintext 双写双清（刀⑧②）**：设值同笔落明文副本（未传则清旧副本，防 hash/明文错位）；
     * 清除路径明文副本一并清。**密钥纪律**：pinHash/pinPlaintext 只落内存 / 落盘，读视图剥离
     * （路由回带走 MemberPublicSchema；明文唯一透出口 = GET /api/members/:id/pin）。
     */
    async setMemberPin(
      memberId: string,
      pinHash: string | null,
      pinPlaintext?: string,
    ): Promise<Member | null> {
      const idx = this.snapshot.members.findIndex((m) => m.id === memberId);
      if (idx === -1) return null;
      const now = this.clock.now().toISOString();
      const updated = applyMemberPin(this.snapshot.members[idx], pinHash, pinPlaintext, now);
      this.snapshot.members[idx] = updated;
      return updated;
    }

    /**
     * 设 / 撤成员门验收人资格（PATCH /api/members/:id/gate-reviewer，GATE-CHECKLIST-IOU）。就地改
     * members[idx].gateReviewer（布尔位）+ bump updatedAt、钉 updatedBy=`console`（镜像 setMemberPin）。
     * id 不存在 → null（路由转 404）。**I0**：资格布尔而已，绝不做按人聚合/排行。
     */
    async setMemberGateReviewer(
      memberId: string,
      gateReviewer: boolean,
    ): Promise<Member | null> {
      const idx = this.snapshot.members.findIndex((m) => m.id === memberId);
      if (idx === -1) return null;
      const now = this.clock.now().toISOString();
      const updated = applyMemberGateReviewer(this.snapshot.members[idx], gateReviewer, now);
      this.snapshot.members[idx] = updated;
      return updated;
    }

    /**
     * 设成员组织身份（PUT /api/members/:id/role，K1 权限地基）。就地改 members[idx].role（groupAdmin/
     * member 两档）+ bump updatedAt、钉 updatedBy=`console`（镜像 setMemberGateReviewer）。授权在路由层判。
     * MEMBER-PM-FLAG 后 role 不再承载管理员权限，本写口无降级保护（已随权限移到 setProjectManager）。
     * id 不存在 → null（路由转 404）。**I0**：只改枚举位，绝不聚合。
     */
    async setMemberRole(memberId: string, role: MemberRole): Promise<Member | null> {
      const idx = this.snapshot.members.findIndex((m) => m.id === memberId);
      if (idx === -1) return null;
      const now = this.clock.now().toISOString();
      const updated = applyMemberRole(this.snapshot.members[idx], role, now);
      this.snapshot.members[idx] = updated;
      return updated;
    }

    /**
     * 授 / 收成员项目管理旗标（PUT /api/members/:id/project-manager + POST /api/setup/super-admin，
     * MEMBER-PM-FLAG）。就地改 members[idx].projectManager + bump updatedAt、钉 updatedBy=`console`。
     * 授权在路由层判；**降级保护收进本方法同一临界区**（照余项⑥ nit③ TOCTOU 修复先例，
     * `guardLastProjectManager` 开启时判与写不分离——单线程事件循环内本方法体无 await 间断，并发请求
     * 无法插入判定与写之间）。持旗计数走 memberHasPmFlag（双读兼容旧 role 值）。id 不存在 →
     * `{ ok:false, reason:'not-found' }`（路由转 404）。**I0**：只改布尔位，绝不聚合。
     */
    async setProjectManager(
      memberId: string,
      projectManager: boolean,
      opts?: { guardLastProjectManager?: boolean },
    ): Promise<SetProjectManagerResult> {
      const idx = this.snapshot.members.findIndex((m) => m.id === memberId);
      if (idx === -1) return { ok: false, reason: 'not-found' };
      const prev = this.snapshot.members[idx];
      const guardFail = validateLastProjectManagerGuard(prev, projectManager, this.snapshot.members, opts?.guardLastProjectManager);
      if (guardFail) return { ok: false, reason: guardFail };
      const updated = buildProjectManagerUpdate(prev, projectManager, this.clock.now().toISOString());
      this.snapshot.members[idx] = updated;
      return { ok: true, member: updated };
    }

    /**
     * 名册批量导入（POST /api/roster/import，ROSTER-IMPORT，K8 + 刀③ 不写 role）。一次遍历已校验行，
     * 对 members + groups 就地应用：组按 name 匹配现有 / 本批已建、否则自动建（`grp-new-N` + kind 默认 +
     * 当前赛季）；成员按 displayName 幂等 upsert（新建 `member-new-N` role 恒 'member' / 命中更新
     * grade·groupId·gateReviewer）。**role / pinHash / projectManager 旗标永不动**（update 走 `...prev`
     * 保留——刀③ 起导入完全不写 role：组长改在导入后确认页任命，重导幂等天然不洗已任命组长）。
     * 库里有但表里没有 → missingFromSheet（**绝不删**）。授权在路由层判、本方法无条件写。
     * **刀④ PROGRAM-GROUP-ABSTRACT**：组名命中**批前既有**的非叶子/哨兵组（如「程序」挂子组、「全组联调」
     * 哨兵——`deriveLeafGroups` 结构派生）→ 该行**拒绝**（成员不建不改），进 outcome.failed 说明原因；
     * 本批自动新建的组天然是叶子（无子组），不受影响。**I0**：只做名单事实变更，绝不派生任何按人聚合/排行/按人筛选。
     */
    async importRoster(rows: readonly RosterImportRow[]): Promise<RosterImportOutcome> {
      const now = this.clock.now().toISOString();
      const created: string[] = [];
      const updated: string[] = [];
      const failed: RosterImportOutcome['failed'] = [];
      const createdGroups: string[] = [];
      const autoReviewers: string[] = [];
      // 建组用赛季：当前 active 赛季 ?? 顶层 seasonId（后者恒非空——GroupSchema.seasonId min1 满足；
      // 空板真实态 emptyGovSnapshot 仍保留 seasons/seasonId 赛季元信息，故这里恒解析到合法值）。
      const seasonId = resolveActiveSeasonId(this.snapshot.seasons, this.snapshot.seasonId);
      const abstractGroupIds = computeAbstractGroupIds(this.snapshot.groups);
      // 组名 → id 解析（既有组 / 本批已建组）：同批同名组只建一次。Map 索引线性查重
      // （2026-08-03 性能修复：此前每行 find 全组列表 = O(rows×groups)，大表导入确认慢）。
      const groupIdByName = new Map(this.snapshot.groups.map((g) => [g.name, g.id]));
      const resolveGroupId = (name: string): string => {
        const existing = groupIdByName.get(name);
        if (existing) return existing;
        const group = buildCreatedGroup(name, seasonId, nextSequentialId('grp-new', this.groupSeq));
        this.snapshot.groups.push(group);
        groupIdByName.set(name, group.id);
        createdGroups.push(name);
        return group.id;
      };
      // 导入前名册（displayName 集）——用于 missingFromSheet（库里有但表里没有、绝不删）。
      const priorNames = this.snapshot.members.map((m) => m.displayName);
      const sheetNames = new Set(rows.map((r) => r.displayName));
      // 成员 displayName → idx 索引（保留首次出现 = findIndex 语义；新建成员同笔补索引，线性查重）。
      const memberIdxByName = new Map<string, number>();
      this.snapshot.members.forEach((m, i) => {
        if (!memberIdxByName.has(m.displayName)) memberIdxByName.set(m.displayName, i);
      });
      for (const row of rows) {
        const groupId = resolveGroupId(row.groupName);
        // 刀④：命中抽象组（非叶子/哨兵）→ 拒该行（成员不建不改），failed 指回 CSV 原行说明原因。
        if (abstractGroupIds.has(groupId)) {
          failed.push({
            line: row.line ?? 0,
            reason: `组「${row.groupName}」是汇报视角（含子组或是联调哨兵组），不能挂人——请改成其下的具体小组`,
          });
          continue;
        }
        const idx = memberIdxByName.get(row.displayName) ?? -1;
        if (idx === -1) {
          const member = buildRosterMemberCreate(
            row,
            groupId,
            nextSequentialId('member-new', this.memberSeq),
            now,
          );
          this.snapshot.members.push(member);
          memberIdxByName.set(row.displayName, this.snapshot.members.length - 1);
          created.push(row.displayName);
        } else {
          const prev = this.snapshot.members[idx];
          // role / pinHash / projectManager 旗标永不动（`...prev` 保留）——重导幂等不洗已任命组长。
          const member = buildRosterMemberUpdate(prev, row, groupId, now);
          this.snapshot.members[idx] = member;
          updated.push(row.displayName);
        }
        if (row.gateReviewerAuto) autoReviewers.push(row.displayName);
      }
      const missingFromSheet = priorNames.filter((n) => !sheetNames.has(n));
      return { created, updated, failed, missingFromSheet, createdGroups, autoReviewers };
    }

    // ── 组管理最小版（PROGRAM-GROUP-ABSTRACT 刀④）：「可选组 = 叶子组且非哨兵」由 deriveLeafGroups 结构
    // 派生（零 Group schema 改动）；守卫全在本方法内完成（判与写不分离，照 setProjectManager 临界区先例）。

    /**
     * 新建叶子组（POST /api/groups）：id 照 nextSequentialId 先例（`grp-new-N`）、seasonId 取当前
     * active ?? 顶层、parentGroupId=null、kind=custom（同 importRoster 自动建组钉的默认值）。新建组
     * 天然无子组 = 叶子。同名（含非叶子/哨兵组）→ name-exists（组名是 importRoster 匹配键，重名会错挂）。
     */
    async createGroup(draft: GroupDraft): Promise<CreateGroupResult> {
      if (this.snapshot.groups.some((g) => g.name === draft.name)) {
        return { ok: false, reason: 'name-exists' };
      }
      const seasonId = resolveActiveSeasonId(this.snapshot.seasons, this.snapshot.seasonId);
      const group = buildCreatedGroup(draft.name, seasonId, nextSequentialId('grp-new', this.groupSeq));
      this.snapshot.groups.push(group);
      return { ok: true, group };
    }

    /**
     * 组改名（PUT /api/groups/:id）：**仅叶子组可改**（非叶子/哨兵 = 汇报视角，not-leaf）；撞其它组
     * 同名 → name-exists；id 不存在 → not-found。
     */
    async renameGroup(groupId: string, name: string): Promise<RenameGroupResult> {
      const fail = validateGroupRename(groupId, name, this.snapshot.groups);
      if (fail) return fail;
      const idx = this.snapshot.groups.findIndex((g) => g.id === groupId);
      const updated: Group = { ...this.snapshot.groups[idx], name };
      this.snapshot.groups[idx] = updated;
      return { ok: true, group: updated };
    }

    /**
     * 删组（DELETE /api/groups/:id）：**仅叶子组可删** + 防孤儿——有成员 / 有子组 / 有任务引用 →
     * 对应 reason（先迁走再删）。ok 时回带被删的组（路由响应投影）。
     */
    async deleteGroup(groupId: string): Promise<DeleteGroupResult> {
      const fail = validateGroupDeletion(groupId, this.snapshot.groups, this.snapshot.members, this.snapshot.tasks);
      if (fail) return fail;
      const idx = this.snapshot.groups.findIndex((g) => g.id === groupId);
      const [removed] = this.snapshot.groups.splice(idx, 1);
      return { ok: true, group: removed };
    }

    /**
     * 空板默认组树（打磨轮刀⑤）：判空与插树在同一方法内完成（单线程内存快照即临界区）——groups
     * 已非空 → no-op（幂等）；空 → 一次性插入整棵默认树（seasonId 钉法同 createGroup）。
     */
    async ensureDefaultGroups(): Promise<void> {
      if (this.snapshot.groups.length > 0) return;
      const seasonId = resolveActiveSeasonId(this.snapshot.seasons, this.snapshot.seasonId);
      this.snapshot.groups.push(...buildDefaultGroupTree(seasonId));
    }

    // ── 挂单认领制窄写（TASK-POST-CLAIM，D-088）：就地改 tasks[idx] 的自己那簇留名字段 + updatedAt。
    // 「status 变则 statusSource 钉 console」（C5，与 updateTaskStatus 同律）。清字段用解构剔除（不再回写
    // = 清空，照 setResourceDefaultPreset omit 先例）。**红线**：留名只落单卡（D-085），绝不聚合/按人筛。

    /**
     * 认领挂单（§3）。仅当现 ownerId===null 才写（已有主 → null，路由据快照转 409）；写 ownerId + claimedAt，
     * pending→inProgress 提升（有主即开工，非 pending 不动）。id 不存在 → null（路由转 404）。
     */
    async claimTask(taskId: string, ownerId: string, claimedAt: string, claimer?: ActorRef): Promise<Task | null> {
      const idx = this.snapshot.tasks.findIndex((t) => t.id === taskId);
      if (idx === -1) return null;
      const updated = buildClaimedTask(this.snapshot.tasks[idx], ownerId, claimedAt, claimer);
      if (!updated) return null;
      this.snapshot.tasks[idx] = updated;
      return updated;
    }

    /**
     * 指派 / 转派（§3，同方法）。写 ownerId + assignReason + assignedBy；**清 claimedAt / partnerMemberId /
     * crossClaimConfirmedBy**（指派非认领 + 换主后旧搭档 / 旧确认失效）。id 不存在 → null（路由转 404）。
     */
    async assignTask(
      taskId: string,
      ownerId: string,
      reason: string,
      assignedBy: ActorRef,
      at: string,
    ): Promise<Task | null> {
      const idx = this.snapshot.tasks.findIndex((t) => t.id === taskId);
      if (idx === -1) return null;
      const updated = buildAssignedTask(this.snapshot.tasks[idx], ownerId, reason, assignedBy, at);
      this.snapshot.tasks[idx] = updated;
      return updated;
    }

    /** 设本组搭档位（§4）。只写 partnerMemberId + updatedAt。id 不存在 → null（路由转 404）。 */
    async setTaskPartner(taskId: string, partnerMemberId: string, at: string): Promise<Task | null> {
      const idx = this.snapshot.tasks.findIndex((t) => t.id === taskId);
      if (idx === -1) return null;
      const updated: Task = { ...this.snapshot.tasks[idx], partnerMemberId, updatedAt: at };
      this.snapshot.tasks[idx] = updated;
      return updated;
    }

    /** 跨组大任务组长事后确认（§4）。只写 crossClaimConfirmedBy + updatedAt。id 不存在 → null（路由转 404）。 */
    async confirmCrossClaim(taskId: string, confirmedBy: ActorRef, at: string): Promise<Task | null> {
      const idx = this.snapshot.tasks.findIndex((t) => t.id === taskId);
      if (idx === -1) return null;
      const updated: Task = {
        ...this.snapshot.tasks[idx],
        crossClaimConfirmedBy: confirmedBy,
        updatedAt: at,
      };
      this.snapshot.tasks[idx] = updated;
      return updated;
    }

    /**
     * 标完成（§5）。status→done + completedBy + statusSource console（C5）；**清 reviewedBy / reviewNote**
     * （新一轮完成清旧验收——重开后重新走验收）。id 不存在 → null（路由转 404）。
     */
    async completeTask(taskId: string, completedBy: ActorRef, at: string): Promise<Task | null> {
      const idx = this.snapshot.tasks.findIndex((t) => t.id === taskId);
      if (idx === -1) return null;
      const updated = buildCompletedTask(this.snapshot.tasks[idx], completedBy, at);
      this.snapshot.tasks[idx] = updated;
      return updated;
    }

    /**
     * 验收 / 抽查（§5）。accept = 写 reviewedBy(+note)、status 保持 done；reject（打回）= status→inProgress +
     * reviewedBy + reviewNote + statusSource console（C5）。id 不存在 → null（路由转 404）。
     * **reviewNote 一律以本轮为准**：note 未给则清掉上一轮残留（复审 nit 收口——否则 reject 后直接
     * accept 会把旧打回理由留在已验收任务上）。
     */
    async reviewTask(
      taskId: string,
      reviewedBy: ActorRef,
      outcome: 'accept' | 'reject',
      note: string | undefined,
      at: string,
    ): Promise<Task | null> {
      const idx = this.snapshot.tasks.findIndex((t) => t.id === taskId);
      if (idx === -1) return null;
      const updated = buildReviewedTask(this.snapshot.tasks[idx], reviewedBy, outcome, note, at);
      this.snapshot.tasks[idx] = updated;
      return updated;
    }

    /**
     * 新建赛季（POST /api/seasons，SEASON-CREATE）：新赛季钉 status=`active`，同笔把既有 active
     * 赛季原地转 `archived`（一届一个当前赛季，见 PmCoreStore.createSeason 注释）。原地替换保持
     * seasons 数组引用稳定（FileGovStore 回滚按引用整体还原）。
     */
    async createSeason(draft: SeasonDraft): Promise<Season> {
      for (let i = 0; i < this.snapshot.seasons.length; i++) {
        if (this.snapshot.seasons[i].status === 'active') {
          this.snapshot.seasons[i] = { ...this.snapshot.seasons[i], status: 'archived' };
        }
      }
      const season = buildCreatedSeason(draft, nextSequentialId('season-new', this.seasonSeq));
      this.snapshot.seasons.push(season);
      return season;
    }
  };
}
