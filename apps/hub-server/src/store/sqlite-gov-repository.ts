import {
  GOVERNANCE_SCENARIO_NOW,
  buildDefaultGroupTree,
  deriveLeafGroups,
  governanceScenarioFixture,
  scheduleScenarioFixture,
} from '@teamhub/hub-contracts';
import type {
  ActorRef,
  ArtifactRef,
  Dependency,
  GovernanceSnapshot,
  Group,
  KnowledgeNode,
  Member,
  MemberRole,
  Need,
  RelayHandoff,
  ResourceSession,
  RosterImportRow,
  Season,
  SharedResource,
  Task,
  TaskKnowledgeTag,
  TaskStatus,
} from '@teamhub/hub-contracts';
import { FixedClock } from '../clock.js';
import type { Clock } from '../clock.js';
import { createIdSequence, nextSequentialId } from './id-sequence.js';
import type { IdSequence } from './id-sequence.js';
import type {
  ArtifactDraft,
  CreateGroupResult,
  DeleteGroupResult,
  DependencyDraft,
  GovStore,
  GroupDraft,
  KnowledgeNodeDraft,
  NeedDraft,
  RelayHandoffDraft,
  RenameGroupResult,
  ResourceDefaultPresetPatch,
  ResourceDraft,
  ResourceSessionDraft,
  ResourceSessionPatch,
  ResourceStatusPatch,
  RosterImportOutcome,
  SetProjectManagerResult,
  SeasonDraft,
  TaskDraft,
} from './gov-store.js';
import {
  buildAssignedTask,
  buildClaimedTask,
  buildCompletedTask,
  buildReviewedTask,
  buildCreatedTask,
  buildCreatedDependency,
  buildCreatedNeed,
  buildCreatedKbNode,
  buildCreatedArtifact,
  buildCreatedResource,
  buildCreatedResourceSession,
  buildCreatedResourceSessionsBatch,
  buildCreatedRelayHandoff,
  buildCreatedSeason,
  applyMemberPin,
  applyMemberGateReviewer,
  applyMemberRole,
  applyResourceStatus,
  applyResourceDefaultPreset,
  applyResourceSessionPatch,
  applyDependencyWaive,
  applyTaskStatusTransition,
  buildRosterMemberCreate,
  buildRosterMemberUpdate,
  buildCreatedGroup,
  resolveActiveSeasonId,
  validateGroupDeletion,
  validateGroupRename,
  validateLastProjectManagerGuard,
  buildProjectManagerUpdate,
} from './gov-store-logic.js';
import { SqliteDatabase } from './sqlite-db.js';

/**
 * 统一 SQLite 内部的治理域 repository。数据库生命周期、schema kind 与版本由 sqlite-unified.ts 独占；
 * 本类只在已打开的共享连接上建治理域表、播种并实现 GovStore。
 *
 * **注释勾销（D-083 刀④拍板）**：本文件此前头注释「待部署审批后接 better-sqlite3/drizzle」是 D-042
 * 时代旧口径——彼时把「持久层实现」等同「真实服务器写入需白天审批」（AGENTS §8）。D-083 刀④重新
 * 界定：**本地 SQLite 文件写入 = 与 gov.json 同性质的本地落盘、不属「真实服务器写入」**，故本刀直接实现，
 * 不再后置。偏离已记入返回值 deviations（收口回写 now.md / decisions）。
 *
 * 三条工程决定：
 *  - **驱动 = node:sqlite（node24 内置）**：零原生依赖、零 `npm install`（不引 better-sqlite3/drizzle），
 *    与「小作坊、别装重型底座」气质一致。node:sqlite 同步 API，本类各 async 方法内做同步 DB 操作后返回。
 *  - **文档式行存（tables 按域设计）**：每个域实体一张表 `(id TEXT PRIMARY KEY, data TEXT NOT NULL)`，
 *    整实体 JSON 落 `data` 列——避免把每个嵌套字段（confirmedBy / resourceLinks / defaultPreset /
 *    invitedMemberIds …）铺平成列（脆弱、加字段即破向后兼容）。id 列供主键/查改删，rowid 保插入序
 *    （`ORDER BY rowid` 还原数组原序；更新走 `UPDATE`（不换 rowid）而非 `INSERT OR REPLACE`（会把行挪到末尾））。
 *    表按三域分组：pm-core（tasks/dependencies/needs/knowledge_nodes/task_knowledge_tags/members/
 *    groups/seasons + meta 标量）、artifact（artifacts）、schedule（resources/resource_sessions/relay_handoffs）。
 *  - **PRAGMA user_version fail-closed + 事务**：schema 版本钉在 `user_version`；打开时高于本代码支持版本即抛
 *    （拒绝降级读写损坏更高版本数据）；每个写方法的 DB 变更包在 `BEGIN/COMMIT`（异常 `ROLLBACK`）里保证原子性。
 *
 * **复用 SS1 纯函数**：id 生成走 `id-sequence.ts`（打开时从各表既有 `<prefix>-N` id 扫最大后缀重建序列，
 * 镜像 测试 fake.resyncResourceSeq——比按行数起步更稳，delete 后不复用已删 id）；clamp 初始态 /
 * 来源 seam 走 `clamp-defaults.ts`（与 mock/file 同一份常量，零漂移）。
 *
 * 不提供独立打开、版本管理或 close 入口，避免重新产生 gov-only SQLite 运行路径。
 */

/**
 * 域实体表清单（每张 `(id TEXT PRIMARY KEY, data TEXT NOT NULL)`，整实体 JSON 落 data 列）。
 * 表由统一库在首次打开时确保存在；实体 JSON 形状仍由 contracts schema 与 repository 行为测试约束。
 */
const ENTITY_TABLES = [
  // pm-core 域
  'seasons',
  'groups',
  'members',
  'tasks',
  'dependencies',
  'needs',
  'knowledge_nodes',
  'task_knowledge_tags',
  // artifact 域
  'artifacts',
  // schedule 域（不在 GovernanceSnapshot 内，走独立读口，与 InMemory/File 同）
  'resources',
  'resource_sessions',
  'relay_handoffs',
] as const;

function seedFreshDatabase(
  sdb: SqliteDatabase,
  seed: GovernanceSnapshot,
  demoSeed: boolean,
): void {
  sdb.tx(() => {
    sdb.setMeta('seasonId', seed.seasonId);
    sdb.setMeta('projectId', seed.projectId);
    sdb.setMeta('stage', seed.stage);
    sdb.bulkInsert('seasons', seed.seasons ?? []);
    sdb.bulkInsert('groups', seed.groups);
    sdb.bulkInsert('members', seed.members);
    sdb.bulkInsert('tasks', seed.tasks);
    sdb.bulkInsert('dependencies', seed.dependencies);
    sdb.bulkInsert('needs', seed.needs);
    sdb.bulkInsert('knowledge_nodes', seed.knowledgeNodes);
    sdb.bulkInsert('task_knowledge_tags', seed.taskKnowledgeTags);
    sdb.bulkInsert('artifacts', seed.artifacts);
    if (demoSeed) {
      sdb.bulkInsert('resources', scheduleScenarioFixture.resources);
      sdb.bulkInsert('resource_sessions', scheduleScenarioFixture.resourceSessions);
      sdb.bulkInsert('relay_handoffs', scheduleScenarioFixture.relayHandoffs);
    }
  });
}

export class SqliteGovRepository implements GovStore {
  private readonly sdb: SqliteDatabase;
  private readonly clock: Clock;

  // id 单调自增序列（复用 SS1 id-sequence.ts）：打开时从各表既有 id 的 `<prefix>-N` 最大后缀重建
  // （见 resyncSequences），首条 create 得 max+1、只增不减。
  private taskSeq!: IdSequence;
  private dependencySeq!: IdSequence;
  private needSeq!: IdSequence;
  private knowledgeNodeSeq!: IdSequence;
  private artifactSeq!: IdSequence;
  private seasonSeq!: IdSequence;
  private memberSeq!: IdSequence;
  private groupSeq!: IdSequence;
  private resourceSeq!: IdSequence;
  private resourceSessionSeq!: IdSequence;
  private relayHandoffSeq!: IdSequence;

  private constructor(sdb: SqliteDatabase, clock?: Clock) {
    this.sdb = sdb;
    this.clock = clock ?? new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW));
    this.resyncSequences();
  }

  static fromSharedDb(
    sdb: SqliteDatabase,
    seed: GovernanceSnapshot = governanceScenarioFixture,
    clock?: Clock,
    demoSeed = true,
  ): SqliteGovRepository {
    sdb.ensureEntityTables(ENTITY_TABLES);
    const existing = sdb.allRows('tasks');
    if (existing.length === 0 && sdb.getMeta('seasonId') === undefined) {
      seedFreshDatabase(sdb, seed, demoSeed);
    }
    return new SqliteGovRepository(sdb, clock);
  }

  // ── 低层行操作（委托 SqliteDatabase） ─────────────────────────────────

  private allRows<T>(table: string): T[] {
    return this.sdb.allRows<T>(table);
  }

  private getRow<T>(table: string, id: string): T | undefined {
    return this.sdb.getRow<T>(table, id);
  }

  private insertRow(table: string, id: string, value: unknown): void {
    this.sdb.insertRow(table, id, value);
  }

  private updateRow(table: string, id: string, value: unknown): number {
    return this.sdb.updateRow(table, id, value);
  }

  private deleteRow(table: string, id: string): number {
    return this.sdb.deleteRow(table, id);
  }

  private getMeta(key: string): string | undefined {
    return this.sdb.getMeta(key);
  }

  private tx<T>(fn: () => T): T {
    return this.sdb.tx(fn);
  }

  private maxSuffix(table: string, prefix: string): number {
    return this.sdb.maxSuffix(table, prefix);
  }

  /** 打开后重建全部 id 序列（从各表最大后缀起步，复用 SS1 createIdSequence 纯工厂）。 */
  private resyncSequences(): void {
    this.taskSeq = createIdSequence(this.maxSuffix('tasks', 'task-new'));
    this.dependencySeq = createIdSequence(this.maxSuffix('dependencies', 'dep-new'));
    this.needSeq = createIdSequence(this.maxSuffix('needs', 'need-new'));
    this.knowledgeNodeSeq = createIdSequence(this.maxSuffix('knowledge_nodes', 'kn-cl'));
    this.artifactSeq = createIdSequence(this.maxSuffix('artifacts', 'artifact-new'));
    this.seasonSeq = createIdSequence(this.maxSuffix('seasons', 'season-new'));
    this.memberSeq = createIdSequence(this.maxSuffix('members', 'member-new'));
    this.groupSeq = createIdSequence(this.maxSuffix('groups', 'grp-new'));
    this.resourceSeq = createIdSequence(this.maxSuffix('resources', 'res-new'));
    this.resourceSessionSeq = createIdSequence(
      this.maxSuffix('resource_sessions', 'sess-new'),
    );
    this.relayHandoffSeq = createIdSequence(this.maxSuffix('relay_handoffs', 'handoff-new'));
  }

  // ── 读 ────────────────────────────────────────────────────────────────────────────

  async getSnapshot(): Promise<GovernanceSnapshot> {
    // 每次现从表重建 → 天然是新对象（无共享可变引用，等价 InMemory/File 的克隆隔离纪律）。
    // 标量 `?? ''`：正常库恒有（seed/迁移写入）；若缺则 '' 会在 create() 的 schema.parse(min 1) 处 fail-closed。
    return {
      seasonId: this.getMeta('seasonId') ?? '',
      seasons: this.allRows<Season>('seasons'),
      projectId: this.getMeta('projectId') ?? '',
      stage: this.getMeta('stage') ?? '',
      groups: this.allRows<Group>('groups'),
      members: this.allRows<Member>('members'),
      tasks: this.allRows<Task>('tasks'),
      dependencies: this.allRows<Dependency>('dependencies'),
      needs: this.allRows<Need>('needs'),
      knowledgeNodes: this.allRows<KnowledgeNode>('knowledge_nodes'),
      taskKnowledgeTags: this.allRows<TaskKnowledgeTag>('task_knowledge_tags'),
      artifacts: this.allRows<ArtifactRef>('artifacts'),
    };
  }

  // ── pm-core 域写（对象构造单源 gov-store-logic.ts builder；本类只持 tx/insertRow 持久化外壳）─────

  async createTask(draft: TaskDraft): Promise<Task> {
    const now = this.clock.now().toISOString();
    const task = buildCreatedTask(draft, nextSequentialId('task-new', this.taskSeq), now);
    this.tx(() => this.insertRow('tasks', task.id, task));
    return task;
  }

  async createDependency(draft: DependencyDraft): Promise<Dependency> {
    const now = this.clock.now().toISOString();
    const dependency = buildCreatedDependency(
      draft,
      nextSequentialId('dep-new', this.dependencySeq),
      now,
    );
    this.tx(() => this.insertRow('dependencies', dependency.id, dependency));
    return dependency;
  }

  async createNeed(draft: NeedDraft): Promise<Need> {
    const now = this.clock.now().toISOString();
    const need = buildCreatedNeed(draft, nextSequentialId('need-new', this.needSeq), now);
    this.tx(() => this.insertRow('needs', need.id, need));
    return need;
  }

  async closeoutKbNode(draft: KnowledgeNodeDraft): Promise<KnowledgeNode> {
    const now = this.clock.now().toISOString();
    // 按 name upsert：命中既有则原地覆盖、保留旧 id；否则新建（未命中支走共享 buildCreatedKbNode）。读-判-写一个事务。
    return this.tx(() => {
      const existing = this.allRows<KnowledgeNode>('knowledge_nodes').find(
        (n) => n.name === draft.name,
      );
      if (existing) {
        const updated: KnowledgeNode = { ...draft, id: existing.id, createdAt: now };
        this.updateRow('knowledge_nodes', existing.id, updated);
        return updated;
      }
      const node = buildCreatedKbNode(draft, nextSequentialId('kn-cl', this.knowledgeNodeSeq), now);
      this.insertRow('knowledge_nodes', node.id, node);
      return node;
    });
  }

  async updateTaskStatus(taskId: string, status: TaskStatus, by?: ActorRef): Promise<Task | null> {
    return this.tx(() => {
      const prev = this.getRow<Task>('tasks', taskId);
      if (!prev) return null;
      const now = this.clock.now().toISOString();
      const updated = applyTaskStatusTransition(prev, status, now, by);
      this.updateRow('tasks', taskId, updated);
      return updated;
    });
  }

  async waiveDependency(depId: string): Promise<Dependency | null> {
    return this.tx(() => {
      const prev = this.getRow<Dependency>('dependencies', depId);
      if (!prev) return null;
      const updated = applyDependencyWaive(prev, this.clock.now().toISOString());
      this.updateRow('dependencies', depId, updated);
      return updated;
    });
  }

  async setMemberPin(
    memberId: string,
    pinHash: string | null,
    pinPlaintext?: string,
  ): Promise<Member | null> {
    return this.tx(() => {
      const prev = this.getRow<Member>('members', memberId);
      if (!prev) return null;
      const updated = applyMemberPin(prev, pinHash, pinPlaintext, this.clock.now().toISOString());
      this.updateRow('members', memberId, updated);
      return updated;
    });
  }

  // 设 / 撤成员门验收人资格（GATE-CHECKLIST-IOU）：对象构造单源 applyMemberGateReviewer；整实体 JSON 就地重写（文档式行存）。
  async setMemberGateReviewer(
    memberId: string,
    gateReviewer: boolean,
  ): Promise<Member | null> {
    return this.tx(() => {
      const prev = this.getRow<Member>('members', memberId);
      if (!prev) return null;
      const updated = applyMemberGateReviewer(prev, gateReviewer, this.clock.now().toISOString());
      this.updateRow('members', memberId, updated);
      return updated;
    });
  }

  // 设成员组织身份（K1 权限地基）：对象构造单源 applyMemberRole；整实体 JSON 就地重写（文档式行存）。
  // MEMBER-PM-FLAG 后 role 不再承载管理员权限，本写口无降级保护（已随权限移到 setProjectManager）。
  async setMemberRole(memberId: string, role: MemberRole): Promise<Member | null> {
    return this.tx(() => {
      const prev = this.getRow<Member>('members', memberId);
      if (!prev) return null;
      const updated = applyMemberRole(prev, role, this.clock.now().toISOString());
      this.updateRow('members', memberId, updated);
      return updated;
    });
  }

  // 授 / 收成员项目管理旗标（MEMBER-PM-FLAG 公测补强刀②b）：整实体 JSON 就地重写，镜像 setMemberRole。
  // 降级保护 guard 在同一事务内判+写（node:sqlite 事务即临界区，并发请求串行化）；持旗计数走
  // memberHasPmFlag（双读兼容——sqlite 行存是文档式 JSON，旧行 role 可能仍是 'superAdmin'）。
  async setProjectManager(
    memberId: string,
    projectManager: boolean,
    opts?: { guardLastProjectManager?: boolean },
  ): Promise<SetProjectManagerResult> {
    return this.tx(() => {
      const prev = this.getRow<Member>('members', memberId);
      if (!prev) return { ok: false as const, reason: 'not-found' as const };
      const allMembers = this.allRows<Member>('members');
      const guardFailure = validateLastProjectManagerGuard(prev, projectManager, allMembers, opts?.guardLastProjectManager);
      if (guardFailure) return { ok: false as const, reason: guardFailure };
      const updated = buildProjectManagerUpdate(prev, projectManager, this.clock.now().toISOString());
      this.updateRow('members', memberId, updated);
      return { ok: true as const, member: updated };
    });
  }

  /**
   * 名册批量导入（ROSTER-IMPORT，K8 + 刀③ 不写 role + 刀④ 拒抽象组）：整批在一个事务里应用到
   * members + groups（半程崩溃回滚，无「建了组没建人」中间态）。成员/组对象构造单源 gov-store-logic.ts
   *（buildRosterMemberCreate/Update、buildCreatedGroup），与 测试 fake 共享同一份字段语义；本类只持
   * 组按 name 匹配现有 / 本批已建、否则自动建（`grp-new-N` + kind 默认 + 当前赛季）；成员按 displayName
   * 幂等 upsert（新建 `member-new-N` role 恒 'member' / 命中更新 grade·groupId·gateReviewer，
   * role / pinHash / projectManager 旗标永不动——重导幂等不洗已任命组长）；**刀④**：组名命中批前既有的
   * 非叶子/哨兵组 → 该行拒绝进 failed（抽象汇报视角不可挂人）。
   * 本地 Map 缓存追踪同批已建组 / 已改成员，避免同批同名重复建。
   */
  async importRoster(rows: readonly RosterImportRow[]): Promise<RosterImportOutcome> {
    return this.tx(() => {
      const now = this.clock.now().toISOString();
      const created: string[] = [];
      const updated: string[] = [];
      const failed: RosterImportOutcome['failed'] = [];
      const createdGroups: string[] = [];
      const autoReviewers: string[] = [];
      const seasons = this.allRows<Season>('seasons');
      const seasonId =
        seasons.find((s) => s.status === 'active')?.id ?? this.getMeta('seasonId') ?? '';
      // 刀④：批前既有组中的非叶子/哨兵组 id 集（抽象汇报视角，不可挂人）。只算批前——本批新建组
      // 恒为叶子，若算进来会误伤同批后续同名行（与 测试 fake 同一份只算批前既有组的口径）。
      const groupsBefore = this.allRows<Group>('groups');
      const leafBefore = new Set(deriveLeafGroups(groupsBefore));
      const abstractGroupIds = new Set(
        groupsBefore.filter((g) => !leafBefore.has(g.id)).map((g) => g.id),
      );
      // 组名 → id（既有 + 本批已建）。
      const groupIdByName = new Map<string, string>();
      for (const g of groupsBefore) groupIdByName.set(g.name, g.id);
      const resolveGroupId = (name: string): string => {
        const hit = groupIdByName.get(name);
        if (hit) return hit;
        const group = buildCreatedGroup(name, seasonId, nextSequentialId('grp-new', this.groupSeq));
        this.insertRow('groups', group.id, group);
        groupIdByName.set(name, group.id);
        createdGroups.push(name);
        return group.id;
      };
      // displayName → 现成员（既有 + 本批已建）；priorNames 用于 missingFromSheet（绝不删）。
      const memberByName = new Map<string, Member>();
      const members = this.allRows<Member>('members');
      for (const m of members) memberByName.set(m.displayName, m);
      const priorNames = members.map((m) => m.displayName);
      const sheetNames = new Set(rows.map((r) => r.displayName));
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
        const prev = memberByName.get(row.displayName);
        if (!prev) {
          const member = buildRosterMemberCreate(
            row,
            groupId,
            nextSequentialId('member-new', this.memberSeq),
            now,
          );
          this.insertRow('members', member.id, member);
          memberByName.set(member.displayName, member);
          created.push(row.displayName);
        } else {
          const member = buildRosterMemberUpdate(prev, row, groupId, now);
          this.updateRow('members', prev.id, member);
          memberByName.set(member.displayName, member);
          updated.push(row.displayName);
        }
        if (row.gateReviewerAuto) autoReviewers.push(row.displayName);
      }
      const missingFromSheet = priorNames.filter((n) => !sheetNames.has(n));
      return { created, updated, failed, missingFromSheet, createdGroups, autoReviewers };
    });
  }

  // ── 组管理最小版（PROGRAM-GROUP-ABSTRACT 刀④）：守卫单源 gov-store-logic.ts（validateGroupRename/Deletion），
  // 建组走共享 buildCreatedGroup；本类只持一个事务读-判-写（半程崩溃回滚）。

  /** 新建叶子组（POST /api/groups）：同名 → name-exists；其余字段钉法同 importRoster 自动建组。 */
  async createGroup(draft: GroupDraft): Promise<CreateGroupResult> {
    return this.tx(() => {
      const groups = this.allRows<Group>('groups');
      if (groups.some((g) => g.name === draft.name)) {
        return { ok: false as const, reason: 'name-exists' as const };
      }
      const seasons = this.allRows<Season>('seasons');
      const seasonId = resolveActiveSeasonId(seasons, this.getMeta('seasonId') ?? '');
      const group = buildCreatedGroup(draft.name, seasonId, nextSequentialId('grp-new', this.groupSeq));
      this.insertRow('groups', group.id, group);
      return { ok: true as const, group };
    });
  }

  /** 组改名（PUT /api/groups/:id）：仅叶子组可改（非叶子/哨兵 → not-leaf）；撞同名 → name-exists。 */
  async renameGroup(groupId: string, name: string): Promise<RenameGroupResult> {
    return this.tx(() => {
      const groups = this.allRows<Group>('groups');
      const failure = validateGroupRename(groupId, name, groups);
      if (failure) return failure;
      const prev = groups.find((g) => g.id === groupId)!;
      const updated: Group = { ...prev, name };
      this.updateRow('groups', groupId, updated);
      return { ok: true as const, group: updated };
    });
  }

  /** 删组（DELETE /api/groups/:id）：仅叶子组可删 + 防孤儿（有成员/有子组/有任务引用 → 409）。 */
  async deleteGroup(groupId: string): Promise<DeleteGroupResult> {
    return this.tx(() => {
      const groups = this.allRows<Group>('groups');
      const members = this.allRows<Member>('members');
      const tasks = this.allRows<Task>('tasks');
      const failure = validateGroupDeletion(groupId, groups, members, tasks);
      if (failure) return failure;
      const prev = groups.find((g) => g.id === groupId)!;
      this.deleteRow('groups', groupId);
      return { ok: true as const, group: prev };
    });
  }

  /** 空板默认组树（打磨轮刀⑤）：单事务读-判-写——groups 非空 → no-op（幂等）；空 → 整树插入
   *（seasonId 钉法同 createGroup，与 测试 fake 共享 buildDefaultGroupTree 口径）。 */
  async ensureDefaultGroups(): Promise<void> {
    return this.tx(() => {
      if (this.allRows<Group>('groups').length > 0) return;
      const seasons = this.allRows<Season>('seasons');
      const seasonId = resolveActiveSeasonId(seasons, this.getMeta('seasonId') ?? '');
      for (const group of buildDefaultGroupTree(seasonId)) {
        this.insertRow('groups', group.id, group);
      }
    });
  }

  // ── 挂单认领制窄写（TASK-POST-CLAIM，D-088）：字段簇构造单源 gov-store-logic.ts（buildClaimedTask/
  // AssignedTask/CompletedTask/ReviewedTask）；整实体 JSON 就地重写（文档式行存），一个事务读-判-写。

  async claimTask(taskId: string, ownerId: string, claimedAt: string, claimer?: ActorRef): Promise<Task | null> {
    return this.tx(() => {
      const prev = this.getRow<Task>('tasks', taskId);
      if (!prev) return null;
      const updated = buildClaimedTask(prev, ownerId, claimedAt, claimer);
      if (!updated) return null;
      this.updateRow('tasks', taskId, updated);
      return updated;
    });
  }

  async assignTask(
    taskId: string,
    ownerId: string,
    reason: string,
    assignedBy: ActorRef,
    at: string,
  ): Promise<Task | null> {
    return this.tx(() => {
      const prev = this.getRow<Task>('tasks', taskId);
      if (!prev) return null;
      const updated = buildAssignedTask(prev, ownerId, reason, assignedBy, at);
      this.updateRow('tasks', taskId, updated);
      return updated;
    });
  }

  async setTaskPartner(taskId: string, partnerMemberId: string, at: string): Promise<Task | null> {
    return this.tx(() => {
      const prev = this.getRow<Task>('tasks', taskId);
      if (!prev) return null;
      const updated: Task = { ...prev, partnerMemberId, updatedAt: at };
      this.updateRow('tasks', taskId, updated);
      return updated;
    });
  }

  async confirmCrossClaim(taskId: string, confirmedBy: ActorRef, at: string): Promise<Task | null> {
    return this.tx(() => {
      const prev = this.getRow<Task>('tasks', taskId);
      if (!prev) return null;
      const updated: Task = { ...prev, crossClaimConfirmedBy: confirmedBy, updatedAt: at };
      this.updateRow('tasks', taskId, updated);
      return updated;
    });
  }

  async completeTask(taskId: string, completedBy: ActorRef, at: string): Promise<Task | null> {
    return this.tx(() => {
      const prev = this.getRow<Task>('tasks', taskId);
      if (!prev) return null;
      const updated = buildCompletedTask(prev, completedBy, at);
      this.updateRow('tasks', taskId, updated);
      return updated;
    });
  }

  async reviewTask(
    taskId: string,
    reviewedBy: ActorRef,
    outcome: 'accept' | 'reject',
    note: string | undefined,
    at: string,
  ): Promise<Task | null> {
    return this.tx(() => {
      const prev = this.getRow<Task>('tasks', taskId);
      if (!prev) return null;
      const updated = buildReviewedTask(prev, reviewedBy, outcome, note, at);
      this.updateRow('tasks', taskId, updated);
      return updated;
    });
  }

  /**
   * 新建赛季（SEASON-CREATE，新赛季对象走共享 buildCreatedSeason）：归档旧 active + 插入新 active
   * 一个事务（半程崩溃不会留下"双 active"或"全 archived 无当前赛季"的中间态）。
   */
  async createSeason(draft: SeasonDraft): Promise<Season> {
    return this.tx(() => {
      for (const prev of this.allRows<Season>('seasons')) {
        if (prev.status === 'active') {
          this.updateRow('seasons', prev.id, { ...prev, status: 'archived' });
        }
      }
      const season = buildCreatedSeason(draft, nextSequentialId('season-new', this.seasonSeq));
      this.insertRow('seasons', season.id, season);
      return season;
    });
  }

  // ── artifact 域写 ──────────────────────────────────────────────────────────────────

  async appendArtifact(draft: ArtifactDraft): Promise<ArtifactRef> {
    const now = this.clock.now().toISOString();
    const artifact = buildCreatedArtifact(
      draft,
      nextSequentialId('artifact-new', this.artifactSeq),
      now,
    );
    this.tx(() => this.insertRow('artifacts', artifact.id, artifact));
    return artifact;
  }

  async setArtifactFile(
    id: string,
    file: NonNullable<ArtifactRef['storedFile']>,
  ): Promise<ArtifactRef | null> {
    return this.tx(() => {
      const prev = this.getRow<ArtifactRef>('artifacts', id);
      if (!prev) return null;
      const updated: ArtifactRef = { ...prev, storedFile: file };
      this.updateRow('artifacts', id, updated);
      return updated;
    });
  }

  // ── schedule 域读写（车 + 占用窗口 + 接力交接线） ───────────────────────────────────

  async listResources(): Promise<SharedResource[]> {
    return this.allRows<SharedResource>('resources');
  }

  async createResource(draft: ResourceDraft): Promise<SharedResource> {
    const now = this.clock.now().toISOString();
    const resource = buildCreatedResource(
      draft,
      nextSequentialId('res-new', this.resourceSeq),
      now,
    );
    this.tx(() => this.insertRow('resources', resource.id, resource));
    return resource;
  }

  async updateResourceStatus(
    id: string,
    patch: ResourceStatusPatch,
  ): Promise<SharedResource | null> {
    return this.tx(() => {
      const prev = this.getRow<SharedResource>('resources', id);
      if (!prev) return null;
      const updated = applyResourceStatus(prev, patch, this.clock.now().toISOString());
      this.updateRow('resources', id, updated);
      return updated;
    });
  }

  async setResourceDefaultPreset(
    id: string,
    preset: ResourceDefaultPresetPatch,
  ): Promise<SharedResource | null> {
    return this.tx(() => {
      const prev = this.getRow<SharedResource>('resources', id);
      if (!prev) return null;
      const updated = applyResourceDefaultPreset(prev, preset, this.clock.now().toISOString());
      this.updateRow('resources', id, updated);
      return updated;
    });
  }

  async listResourceSessions(): Promise<ResourceSession[]> {
    return this.allRows<ResourceSession>('resource_sessions');
  }

  async createResourceSession(
    draft: ResourceSessionDraft,
  ): Promise<ResourceSession> {
    const now = this.clock.now().toISOString();
    const session = buildCreatedResourceSession(
      draft,
      nextSequentialId('sess-new', this.resourceSessionSeq),
      now,
    );
    this.tx(() => this.insertRow('resource_sessions', session.id, session));
    return session;
  }

  async createResourceSessionsBatch(
    drafts: ResourceSessionDraft[],
  ): Promise<ResourceSession[]> {
    const now = this.clock.now().toISOString();
    return this.tx(() => {
      const sessions = buildCreatedResourceSessionsBatch(
        drafts,
        () => nextSequentialId('sess-new', this.resourceSessionSeq),
        now,
      );
      for (const session of sessions) {
        this.insertRow('resource_sessions', session.id, session);
      }
      return sessions;
    });
  }

  async updateResourceSession(
    id: string,
    patch: ResourceSessionPatch,
  ): Promise<ResourceSession | null> {
    return this.tx(() => {
      const prev = this.getRow<ResourceSession>('resource_sessions', id);
      if (!prev) return null;
      const updated = applyResourceSessionPatch(prev, patch);
      this.updateRow('resource_sessions', id, updated);
      return updated;
    });
  }

  async deleteResourceSession(id: string): Promise<boolean> {
    return this.tx(() => {
      if (this.deleteRow('resource_sessions', id) === 0) return false;
      // 级联删除引用该 session 的接力交接线（fromSessionId/toSessionId 命中，避免悬空箭头）——
      // 与本 session 删除同一事务原子落盘（消除 InMemory 注释里「session 没了但 handoff 悬空」的分叉窗口）。
      const handoffs = this.allRows<RelayHandoff>('relay_handoffs');
      for (const h of handoffs) {
        if (h.fromSessionId === id || h.toSessionId === id) {
          this.deleteRow('relay_handoffs', h.id);
        }
      }
      return true;
    });
  }

  async listRelayHandoffs(): Promise<RelayHandoff[]> {
    return this.allRows<RelayHandoff>('relay_handoffs');
  }

  async createRelayHandoff(draft: RelayHandoffDraft): Promise<RelayHandoff> {
    const now = this.clock.now().toISOString();
    const handoff = buildCreatedRelayHandoff(
      draft,
      nextSequentialId('handoff-new', this.relayHandoffSeq),
      now,
    );
    this.tx(() => this.insertRow('relay_handoffs', handoff.id, handoff));
    return handoff;
  }

  async deleteRelayHandoff(id: string): Promise<boolean> {
    return this.tx(() => this.deleteRow('relay_handoffs', id) > 0);
  }
}
