import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import {
  GOVERNANCE_SCENARIO_NOW,
  GovernanceSnapshotSchema,
  deriveDisplayCode,
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
import {
  ARTIFACT_SUBMITTED_VIA,
  DEPENDENCY_INITIAL_STATUS,
  DEPENDENCY_WAIVED_STATUS,
  MANUAL_TASK_STATUS_SOURCE,
  MEMBER_GATE_REVIEWER_UPDATED_BY,
  MEMBER_PIN_UPDATED_BY,
  MEMBER_ROLE_UPDATED_BY,
  MEMBER_ROSTER_UPDATED_BY,
  NEED_INITIAL_STATUS,
  RELAY_HANDOFF_SOURCE,
  RESOURCE_DEFAULT_STATUS,
  RESOURCE_SESSION_SOURCE,
  RESOURCE_STATUS_SOURCE,
  ROSTER_IMPORT_GROUP_KIND,
  ROSTER_IMPORT_MEMBER_STATUS,
  TASK_DEFAULT_STATUS,
  TASK_DEFAULT_STATUS_SOURCE,
} from './clamp-defaults.js';
import { createIdSequence, nextSequentialId } from './id-sequence.js';
import type { IdSequence } from './id-sequence.js';
import type {
  ArtifactDraft,
  DependencyDraft,
  GovStore,
  KnowledgeNodeDraft,
  NeedDraft,
  RelayHandoffDraft,
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
import { memberHasPmFlag } from '../authz.js';

/**
 * SQLite 落盘实现（SS3 SQLite，product-redefine-2026-07 §4.4 / §9-③ + D-083 刀④）：与
 * `InMemoryGovStore`（重启丢失）/ `FileGovStore`（整文件 JSON）并列的第三个 `GovStore` 实现，
 * **同一域接口签名集合、零行为变化**（三实现可互换注入 buildHubServer，见 gov-store-scaffold.test）。
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
 * 镜像 InMemoryGovStore.resyncResourceSeq——比按行数起步更稳，delete 后不复用已删 id）；clamp 初始态 /
 * 来源 seam 走 `clamp-defaults.ts`（与 mock/file 同一份常量，零漂移）。
 *
 * **增量迁移边界**（本刀既定，收口写进 now.md）：默认后端仍 JSON（main.ts 未设 TEAMHUB_GOV_BACKEND 时
 * 走 FileGovStore/InMemoryGovStore，现状零变化）；SQLite opt-in（TEAMHUB_GOV_BACKEND=sqlite +
 * TEAMHUB_GOV_SQLITE_FILE）。kb/inv/baseline 三 store 本刀仍 JSON（不在本刀范围）。
 */

// `node:sqlite` 经 createRequire 运行时加载（而非静态 import）：node24 内置模块，但 vitest 底层的
// vite 解析器清单偏旧、会把静态 `import … from 'node:sqlite'` 的 id 去前缀成 `sqlite` 当普通包解析而报错
// 「Failed to load url sqlite」。运行时 require 对 vite 不可见、node 原生可加载，绕过该坑（同 status.ts 用
// createRequire 读 package.json 的先例）；类型仍走 `import type`（编译期擦除，vite 不处理）+ node-sqlite.d.ts。
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync: DatabaseSyncCtor } =
  nodeRequire('node:sqlite') as typeof import('node:sqlite');

/** SQLite schema 版本（PRAGMA user_version）。加表 / 改列语义时 +1 并补迁移分支（当前无历史版本需迁）。 */
export const SQLITE_GOV_SCHEMA_VERSION = 1;

/**
 * 域实体表清单（每张 `(id TEXT PRIMARY KEY, data TEXT NOT NULL)`，整实体 JSON 落 data 列）。
 * **SYNC**：scripts/migrate-gov-to-sqlite.mjs 内联同一份表名/建表 DDL（.mjs 独立运行、不 import 编译产物），
 * 二者结构必须一致——迁移往返测试（sqlite-gov-store.test.ts）是漂移哨兵：任一处表名/列漂移即测试红。
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

type MetaRow = { value: string };
type DataRow = { data: string };
type IdRow = { id: string };
type UserVersionRow = { user_version: number | bigint };

/** 读 PRAGMA user_version（fresh DB = 0）。 */
function readUserVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as UserVersionRow;
  return Number(row.user_version);
}

/** 写 PRAGMA user_version（PRAGMA 不吃绑定参数，只内插自有整型常量，无注入面）。 */
function setUserVersion(db: DatabaseSync, version: number): void {
  db.exec(`PRAGMA user_version = ${version}`);
}

/** 建 schema（幂等，IF NOT EXISTS）：meta 标量键值表 + 全部域实体表。 */
function createSchema(db: DatabaseSync): void {
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  for (const table of ENTITY_TABLES) {
    db.exec(`CREATE TABLE IF NOT EXISTS "${table}" (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
  }
}

function setMeta(db: DatabaseSync, key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value);
}

function bulkInsert(
  db: DatabaseSync,
  table: string,
  items: ReadonlyArray<{ id: string }>,
): void {
  const stmt = db.prepare(`INSERT INTO "${table}" (id, data) VALUES (?, ?)`);
  for (const item of items) stmt.run(item.id, JSON.stringify(item));
}

/**
 * fresh DB 首次落种子（镜像 InMemoryGovStore 构造）：GovernanceSnapshot 标量落 meta、11 数组字段各落其表；
 * schedule 域（resources/resourceSessions/relayHandoffs）**受 demoSeed 管**（K6 时钟与空板刀，与
 * InMemoryGovStore 同源、逐条镜像其构造）：demoSeed=true（默认）从 scheduleScenarioFixture seed，使
 * GET /api/schedule 首请求即有可派生场景；demoSeed=false（真实态）不落、schedule 三表空（真空板）。
 * 整个种子过程一个事务（要么全落要么全不落）。
 */
function seedFreshDatabase(
  db: DatabaseSync,
  seed: GovernanceSnapshot,
  demoSeed: boolean,
): void {
  db.exec('BEGIN');
  try {
    setMeta(db, 'seasonId', seed.seasonId);
    setMeta(db, 'projectId', seed.projectId);
    setMeta(db, 'stage', seed.stage);
    bulkInsert(db, 'seasons', seed.seasons ?? []);
    bulkInsert(db, 'groups', seed.groups);
    bulkInsert(db, 'members', seed.members);
    bulkInsert(db, 'tasks', seed.tasks);
    bulkInsert(db, 'dependencies', seed.dependencies);
    bulkInsert(db, 'needs', seed.needs);
    bulkInsert(db, 'knowledge_nodes', seed.knowledgeNodes);
    bulkInsert(db, 'task_knowledge_tags', seed.taskKnowledgeTags);
    bulkInsert(db, 'artifacts', seed.artifacts);
    // schedule 域受 demoSeed 管（K6）：真实态不 seed 演示车/排班，schedule 三表空。
    if (demoSeed) {
      bulkInsert(db, 'resources', scheduleScenarioFixture.resources);
      bulkInsert(db, 'resource_sessions', scheduleScenarioFixture.resourceSessions);
      bulkInsert(db, 'relay_handoffs', scheduleScenarioFixture.relayHandoffs);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export class SqliteGovStore implements GovStore {
  private readonly db: DatabaseSync;
  private readonly clock: Clock;

  // id 单调自增序列（复用 SS1 id-sequence.ts）：打开时从各表既有 id 的 `<prefix>-N` 最大后缀重建
  // （见 resyncSequences），首条 create 得 max+1、只增不减。
  private taskSeq!: IdSequence;
  private dependencySeq!: IdSequence;
  private needSeq!: IdSequence;
  private knowledgeNodeSeq!: IdSequence;
  private artifactSeq!: IdSequence;
  private seasonSeq!: IdSequence;
  // 名册导入（ROSTER-IMPORT，K8）：从各表既有 `member-new-N` / `grp-new-N` 最大后缀重建（resyncSequences）。
  private memberSeq!: IdSequence;
  private groupSeq!: IdSequence;
  private resourceSeq!: IdSequence;
  private resourceSessionSeq!: IdSequence;
  private relayHandoffSeq!: IdSequence;

  private constructor(db: DatabaseSync, clock?: Clock) {
    this.db = db;
    // 不传 clock 时沿用与 InMemoryGovStore/FileGovStore 相同的默认（FixedClock(GOVERNANCE_SCENARIO_NOW)），
    // 与 real 路由同口径（行为参数化复跑时时间戳与 InMemory 一致）。
    this.clock = clock ?? new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW));
    this.resyncSequences();
  }

  /**
   * 异步构造：打开（不存在则创建）SQLite 文件。
   *  - user_version > 本代码支持版本 → **fail-closed 抛**（拒绝降级读写损坏更高版本数据）。
   *  - user_version === 0（fresh 文件）→ 建 schema + 落种子（seed 快照 + schedule 锚点）+ 钉 user_version。
   *  - user_version === 支持版本（迁移脚本产出 / 既有库）→ 幂等补建全表（迁移脚本可能只建了用到的表）。
   * 打开后走 `GovernanceSnapshotSchema.parse(getSnapshot())` 做一次 fail-closed 校验（镜像 FileGovStore
   * 加载即校验；旧库缺新增字段经 schema `.default([])` 兜底、不炸——D-080 向后兼容）。
   */
  static async create(
    filePath: string,
    seed: GovernanceSnapshot = governanceScenarioFixture,
    clock?: Clock,
    demoSeed = true,
  ): Promise<SqliteGovStore> {
    const db = new DatabaseSyncCtor(filePath);
    const userVersion = readUserVersion(db);
    if (userVersion > SQLITE_GOV_SCHEMA_VERSION) {
      db.close();
      throw new Error(
        `SqliteGovStore: 数据库 schema 版本 ${userVersion} 高于本代码支持的 ${SQLITE_GOV_SCHEMA_VERSION}` +
          '（fail-closed：拒绝以旧代码读写更高版本数据，避免静默损坏）',
      );
    }
    if (userVersion === 0) {
      // fresh：先建表落种子，成功后才钉 user_version（种子失败则库仍是 0、可重试）。
      // demoSeed 透传决定 schedule 域是否 seed 演示锚点（false=真空板，K6）；已迁移/既有库走 else 分支、不受影响。
      createSchema(db);
      seedFreshDatabase(db, seed, demoSeed);
      setUserVersion(db, SQLITE_GOV_SCHEMA_VERSION);
    } else {
      createSchema(db);
    }

    const store = new SqliteGovStore(db, clock);
    // fail-closed 加载校验（与 FileGovStore.create 的 GovernanceSnapshotSchema.parse 同纪律）。
    GovernanceSnapshotSchema.parse(await store.getSnapshot());
    return store;
  }

  /** 关闭底层 DB 句柄（测试模拟重启 / 进程退出前调用；main.ts 长驻进程不主动调）。 */
  close(): void {
    this.db.close();
  }

  // ── 低层行操作（文档式行存：整实体 JSON 落 data 列） ─────────────────────────────────

  private allRows<T>(table: string): T[] {
    const rows = this.db
      .prepare(`SELECT data FROM "${table}" ORDER BY rowid`)
      .all() as DataRow[];
    return rows.map((r) => JSON.parse(r.data) as T);
  }

  private getRow<T>(table: string, id: string): T | undefined {
    const row = this.db
      .prepare(`SELECT data FROM "${table}" WHERE id = ?`)
      .get(id) as DataRow | undefined;
    return row ? (JSON.parse(row.data) as T) : undefined;
  }

  private insertRow(table: string, id: string, value: unknown): void {
    this.db
      .prepare(`INSERT INTO "${table}" (id, data) VALUES (?, ?)`)
      .run(id, JSON.stringify(value));
  }

  /** 就地更新（不换 rowid、保插入序）；返回受影响行数（0 = id 不存在）。 */
  private updateRow(table: string, id: string, value: unknown): number {
    return Number(
      this.db
        .prepare(`UPDATE "${table}" SET data = ? WHERE id = ?`)
        .run(JSON.stringify(value), id).changes,
    );
  }

  private deleteRow(table: string, id: string): number {
    return Number(this.db.prepare(`DELETE FROM "${table}" WHERE id = ?`).run(id).changes);
  }

  private getMeta(key: string): string | undefined {
    const row = this.db
      .prepare('SELECT value FROM meta WHERE key = ?')
      .get(key) as MetaRow | undefined;
    return row?.value;
  }

  /** 每个写方法把 DB 变更包进一个事务：异常回滚，保证多语句写（级联删/批量建/upsert）原子性。 */
  private tx<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /** 从某表既有 id 里扫 `<prefix>-N` 的最大 N（镜像 InMemoryGovStore.resyncResourceSeq）。 */
  private maxSuffix(table: string, prefix: string): number {
    const rows = this.db.prepare(`SELECT id FROM "${table}"`).all() as IdRow[];
    const re = new RegExp(`^${prefix}-(\\d+)$`);
    let max = 0;
    for (const { id } of rows) {
      const m = re.exec(id);
      if (m) {
        const n = Number(m[1]);
        if (n > max) max = n;
      }
    }
    return max;
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

  // ── pm-core 域写（clamp 初始态 / 补 id·时间戳，逐字镜像 InMemoryGovStore） ─────────────

  async createTask(draft: TaskDraft): Promise<Task> {
    const now = this.clock.now().toISOString();
    const task: Task = {
      ...draft,
      id: nextSequentialId('task-new', this.taskSeq),
      status: draft.status ?? TASK_DEFAULT_STATUS,
      statusSource: draft.statusSource ?? TASK_DEFAULT_STATUS_SOURCE,
      lastProgressAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.tx(() => this.insertRow('tasks', task.id, task));
    return task;
  }

  async createDependency(draft: DependencyDraft): Promise<Dependency> {
    const now = this.clock.now().toISOString();
    const dependency: Dependency = {
      ...draft,
      id: nextSequentialId('dep-new', this.dependencySeq),
      status: DEPENDENCY_INITIAL_STATUS,
      createdAt: now,
      updatedAt: now,
    };
    this.tx(() => this.insertRow('dependencies', dependency.id, dependency));
    return dependency;
  }

  async createNeed(draft: NeedDraft): Promise<Need> {
    const now = this.clock.now().toISOString();
    const need: Need = {
      ...draft,
      id: nextSequentialId('need-new', this.needSeq),
      status: NEED_INITIAL_STATUS,
      claimedByMemberId: null,
      openedAt: now,
      escalatedAt: null,
    };
    this.tx(() => this.insertRow('needs', need.id, need));
    return need;
  }

  async closeoutKbNode(draft: KnowledgeNodeDraft): Promise<KnowledgeNode> {
    const now = this.clock.now().toISOString();
    // 按 name upsert（镜像 InMemoryGovStore）：命中既有则原地覆盖、保留旧 id；否则新建。整个读-判-写一个事务。
    return this.tx(() => {
      const existing = this.allRows<KnowledgeNode>('knowledge_nodes').find(
        (n) => n.name === draft.name,
      );
      if (existing) {
        const updated: KnowledgeNode = { ...draft, id: existing.id, createdAt: now };
        this.updateRow('knowledge_nodes', existing.id, updated);
        return updated;
      }
      const node: KnowledgeNode = {
        ...draft,
        id: nextSequentialId('kn-cl', this.knowledgeNodeSeq),
        createdAt: now,
      };
      this.insertRow('knowledge_nodes', node.id, node);
      return node;
    });
  }

  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<Task | null> {
    return this.tx(() => {
      const prev = this.getRow<Task>('tasks', taskId);
      if (!prev) return null;
      const updated: Task = {
        ...prev,
        status,
        statusSource: MANUAL_TASK_STATUS_SOURCE,
        updatedAt: this.clock.now().toISOString(),
      };
      this.updateRow('tasks', taskId, updated);
      return updated;
    });
  }

  async waiveDependency(depId: string): Promise<Dependency | null> {
    return this.tx(() => {
      const prev = this.getRow<Dependency>('dependencies', depId);
      if (!prev) return null;
      const updated: Dependency = {
        ...prev,
        status: DEPENDENCY_WAIVED_STATUS,
        updatedAt: this.clock.now().toISOString(),
      };
      this.updateRow('dependencies', depId, updated);
      return updated;
    });
  }

  async setMemberPin(memberId: string, pinHash: string | null): Promise<Member | null> {
    return this.tx(() => {
      const prev = this.getRow<Member>('members', memberId);
      if (!prev) return null;
      const updated: Member = {
        ...prev,
        updatedBy: MEMBER_PIN_UPDATED_BY,
        updatedAt: this.clock.now().toISOString(),
      };
      // `pinHash = null`（余项⑦ PIN-RESET）= 清除，成员回到免 PIN 态。
      if (pinHash === null) {
        delete updated.pinHash;
      } else {
        updated.pinHash = pinHash;
      }
      this.updateRow('members', memberId, updated);
      return updated;
    });
  }

  // 设 / 撤成员门验收人资格（GATE-CHECKLIST-IOU）：整实体 JSON 就地重写（文档式行存），镜像 setMemberPin。
  async setMemberGateReviewer(
    memberId: string,
    gateReviewer: boolean,
  ): Promise<Member | null> {
    return this.tx(() => {
      const prev = this.getRow<Member>('members', memberId);
      if (!prev) return null;
      const updated: Member = {
        ...prev,
        gateReviewer,
        updatedBy: MEMBER_GATE_REVIEWER_UPDATED_BY,
        updatedAt: this.clock.now().toISOString(),
      };
      this.updateRow('members', memberId, updated);
      return updated;
    });
  }

  // 设成员组织身份（K1 权限地基）：整实体 JSON 就地重写（文档式行存），镜像 setMemberGateReviewer。
  // MEMBER-PM-FLAG 后 role 不再承载管理员权限，本写口无降级保护（已随权限移到 setProjectManager）。
  async setMemberRole(memberId: string, role: MemberRole): Promise<Member | null> {
    return this.tx(() => {
      const prev = this.getRow<Member>('members', memberId);
      if (!prev) return null;
      const updated: Member = {
        ...prev,
        role,
        updatedBy: MEMBER_ROLE_UPDATED_BY,
        updatedAt: this.clock.now().toISOString(),
      };
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
      if (
        opts?.guardLastProjectManager &&
        memberHasPmFlag(prev) &&
        !projectManager &&
        this.allRows<Member>('members').filter((m) => memberHasPmFlag(m)).length <= 1
      ) {
        return { ok: false as const, reason: 'last-projectmanager' as const };
      }
      const updated: Member = {
        ...prev,
        projectManager,
        updatedBy: MEMBER_ROLE_UPDATED_BY,
        updatedAt: this.clock.now().toISOString(),
      };
      this.updateRow('members', memberId, updated);
      return { ok: true as const, member: updated };
    });
  }

  /**
   * 名册批量导入（ROSTER-IMPORT，K8 + 刀③ 不写 role）：整批在一个事务里应用到 members + groups（半程
   * 崩溃回滚，无「建了组没建人」中间态）。逐字镜像 InMemoryGovStore.importRoster——组按 name 匹配现有 /
   * 本批已建、否则自动建（`grp-new-N` + kind 默认 + 当前赛季）；成员按 displayName 幂等 upsert
   * （新建 `member-new-N` role 恒 'member' / 命中更新 grade·groupId·gateReviewer，role / pinHash /
   * projectManager 旗标永不动——重导幂等不洗已任命组长）。
   * 本地 Map 缓存追踪同批已建组 / 已改成员，避免同批同名重复建。
   */
  async importRoster(rows: readonly RosterImportRow[]): Promise<RosterImportOutcome> {
    return this.tx(() => {
      const now = this.clock.now().toISOString();
      const created: string[] = [];
      const updated: string[] = [];
      const createdGroups: string[] = [];
      const autoReviewers: string[] = [];
      const seasons = this.allRows<Season>('seasons');
      const seasonId =
        seasons.find((s) => s.status === 'active')?.id ?? this.getMeta('seasonId') ?? '';
      // 组名 → id（既有 + 本批已建）。
      const groupIdByName = new Map<string, string>();
      for (const g of this.allRows<Group>('groups')) groupIdByName.set(g.name, g.id);
      const resolveGroupId = (name: string): string => {
        const hit = groupIdByName.get(name);
        if (hit) return hit;
        const group: Group = {
          id: nextSequentialId('grp-new', this.groupSeq),
          seasonId,
          parentGroupId: null,
          name,
          kind: ROSTER_IMPORT_GROUP_KIND,
        };
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
        const prev = memberByName.get(row.displayName);
        if (!prev) {
          const member: Member = {
            id: nextSequentialId('member-new', this.memberSeq),
            displayName: row.displayName,
            role: 'member', // 刀③：导入不写 role——组长走导入后确认页，新成员恒 member
            grade: row.grade,
            groupId,
            status: ROSTER_IMPORT_MEMBER_STATUS,
            currentTaskId: null,
            updatedBy: MEMBER_ROSTER_UPDATED_BY,
            updatedAt: now,
            gateReviewer: row.gateReviewer,
          };
          this.insertRow('members', member.id, member);
          memberByName.set(member.displayName, member);
          created.push(row.displayName);
        } else {
          const member: Member = {
            ...prev,
            grade: row.grade,
            groupId,
            gateReviewer: row.gateReviewer,
            updatedBy: MEMBER_ROSTER_UPDATED_BY,
            updatedAt: now,
          };
          this.updateRow('members', prev.id, member);
          memberByName.set(member.displayName, member);
          updated.push(row.displayName);
        }
        if (row.gateReviewerAuto) autoReviewers.push(row.displayName);
      }
      const missingFromSheet = priorNames.filter((n) => !sheetNames.has(n));
      return { created, updated, missingFromSheet, createdGroups, autoReviewers };
    });
  }

  // ── 挂单认领制窄写（TASK-POST-CLAIM，D-088）：整实体 JSON 就地重写（文档式行存），逐字镜像
  // InMemoryGovStore 的字段簇 + clamp（「status 变则 statusSource 钉 console」C5）；一个事务读-判-写。

  async claimTask(taskId: string, ownerId: string, claimedAt: string): Promise<Task | null> {
    return this.tx(() => {
      const prev = this.getRow<Task>('tasks', taskId);
      if (!prev) return null;
      if (prev.ownerId !== null) return null; // 已有主：不覆盖（路由转 409）
      const promoting = prev.status === 'pending';
      const updated: Task = {
        ...prev,
        ownerId,
        claimedAt,
        status: promoting ? 'inProgress' : prev.status,
        statusSource: promoting ? MANUAL_TASK_STATUS_SOURCE : prev.statusSource,
        updatedAt: claimedAt,
      };
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
      // 换主：解构剔除 claimedAt/partnerMemberId/crossClaimConfirmedBy（不再回写 = 清空）。
      const {
        claimedAt: _claimedAt,
        partnerMemberId: _partnerMemberId,
        crossClaimConfirmedBy: _crossClaimConfirmedBy,
        ...rest
      } = prev;
      const updated: Task = {
        ...rest,
        ownerId,
        assignReason: reason,
        assignedBy,
        updatedAt: at,
      };
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
      const { reviewedBy: _reviewedBy, reviewNote: _reviewNote, ...rest } = prev;
      const updated: Task = {
        ...rest,
        status: 'done',
        statusSource: MANUAL_TASK_STATUS_SOURCE,
        completedBy,
        updatedAt: at,
      };
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
      const row = this.getRow<Task>('tasks', taskId);
      if (!row) return null;
      // reviewNote 一律以本轮为准（镜像 InMemoryGovStore.reviewTask，复审 nit 收口）。
      const { reviewNote: _prevNote, ...prev } = row;
      const rejecting = outcome === 'reject';
      const updated: Task = {
        ...prev,
        status: rejecting ? 'inProgress' : prev.status,
        statusSource: rejecting ? MANUAL_TASK_STATUS_SOURCE : prev.statusSource,
        reviewedBy,
        ...(note !== undefined ? { reviewNote: note } : {}),
        updatedAt: at,
      };
      this.updateRow('tasks', taskId, updated);
      return updated;
    });
  }

  /**
   * 新建赛季（SEASON-CREATE，镜像 InMemoryGovStore.createSeason）：归档旧 active + 插入新 active
   * 一个事务（半程崩溃不会留下"双 active"或"全 archived 无当前赛季"的中间态）。
   */
  async createSeason(draft: SeasonDraft): Promise<Season> {
    return this.tx(() => {
      for (const prev of this.allRows<Season>('seasons')) {
        if (prev.status === 'active') {
          this.updateRow('seasons', prev.id, { ...prev, status: 'archived' });
        }
      }
      const season: Season = {
        ...draft,
        id: nextSequentialId('season-new', this.seasonSeq),
        status: 'active',
      };
      this.insertRow('seasons', season.id, season);
      return season;
    });
  }

  // ── artifact 域写 ──────────────────────────────────────────────────────────────────

  async appendArtifact(draft: ArtifactDraft): Promise<ArtifactRef> {
    const now = this.clock.now().toISOString();
    const artifact: ArtifactRef = {
      ...draft,
      id: nextSequentialId('artifact-new', this.artifactSeq),
      submittedVia: ARTIFACT_SUBMITTED_VIA,
      createdAt: now,
    };
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
    const displayCode =
      draft.season !== undefined
        ? deriveDisplayCode(draft.season, draft.robotTarget, draft.version ?? 1)
        : undefined;
    const resource: SharedResource = {
      ...draft,
      id: nextSequentialId('res-new', this.resourceSeq),
      status: RESOURCE_DEFAULT_STATUS,
      statusReason: null,
      statusSource: RESOURCE_STATUS_SOURCE,
      displayCode,
      updatedAt: now,
    };
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
      const updated: SharedResource = {
        ...prev,
        status: patch.status,
        statusReason:
          patch.statusReason !== undefined ? patch.statusReason : prev.statusReason,
        statusSource: RESOURCE_STATUS_SOURCE,
        updatedAt: this.clock.now().toISOString(),
      };
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
      const now = this.clock.now().toISOString();
      // preset===null → 整条不含 defaultPreset 键（与 InMemoryGovStore 同：DefaultPresetSchema 是
      // .optional() 非 .nullable()，落盘等价「未设」）。
      const updated: SharedResource =
        preset === null
          ? (() => {
              const { defaultPreset: _drop, ...rest } = prev;
              return { ...rest, updatedAt: now };
            })()
          : { ...prev, defaultPreset: preset, updatedAt: now };
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
    const session: ResourceSession = {
      ...draft,
      id: nextSequentialId('sess-new', this.resourceSessionSeq),
      source: RESOURCE_SESSION_SOURCE,
      createdAt: now,
    };
    this.tx(() => this.insertRow('resource_sessions', session.id, session));
    return session;
  }

  async createResourceSessionsBatch(
    drafts: ResourceSessionDraft[],
  ): Promise<ResourceSession[]> {
    const now = this.clock.now().toISOString();
    return this.tx(() => {
      const sessions: ResourceSession[] = drafts.map((draft) => ({
        ...draft,
        id: nextSequentialId('sess-new', this.resourceSessionSeq),
        source: RESOURCE_SESSION_SOURCE,
        invitedMemberIds: [],
        createdAt: now,
      }));
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
      const updated: ResourceSession = {
        ...prev,
        orderInWindow:
          patch.orderInWindow !== undefined ? patch.orderInWindow : prev.orderInWindow,
        eta: patch.eta !== undefined ? patch.eta : prev.eta,
      };
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
    const handoff: RelayHandoff = {
      ...draft,
      id: nextSequentialId('handoff-new', this.relayHandoffSeq),
      source: RELAY_HANDOFF_SOURCE,
      createdAt: now,
    };
    this.tx(() => this.insertRow('relay_handoffs', handoff.id, handoff));
    return handoff;
  }

  async deleteRelayHandoff(id: string): Promise<boolean> {
    return this.tx(() => this.deleteRow('relay_handoffs', id) > 0);
  }
}
