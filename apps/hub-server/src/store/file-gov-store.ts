import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import {
  GOVERNANCE_SNAPSHOT_ARRAY_KEYS,
  GovernanceSnapshotSchema,
  RelayHandoffSchema,
  ResourceSessionSchema,
  SharedResourceSchema,
  governanceScenarioFixture,
} from '@teamhub/hub-contracts';
import type {
  ArtifactRef,
  Dependency,
  GovernanceSnapshot,
  KnowledgeNode,
  Member,
  Need,
  RelayHandoff,
  ResourceSession,
  Season,
  SharedResource,
  Task,
  TaskStatus,
} from '@teamhub/hub-contracts';
import type { Clock } from '../clock.js';
import { cloneArrayFields } from './clone-snapshot.js';
import { InMemoryGovStore } from './mock-gov-store.js';
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
  SeasonDraft,
  TaskDraft,
} from './gov-store.js';

/**
 * 治理快照 JSON 落盘实现（v1 持久层）：进程重启不丢，PM 录入 / KB 结案 / 图纸提交日志累积。
 *
 * 与 FileKbStore 同一套纪律（结构逐条镜像）：
 *   - 单一真相在服务器：写入只落本 Store + 整文件原子落盘（写 tmp 再 rename）。
 *   - writeChain 串行化（H2 失败隔离）：并发写不互相覆盖，一次磁盘抖动不会让写链永久 rejected。
 *   - 零额外依赖（只用 node:fs；不引 sqlite——SQLite 留 sqlite-gov-store.ts stub 模式后置）。
 *   - 加载 fail-closed：文件不存在 → seed 起头并落一次盘（首启动落种子治理场景 + 图纸版本日志）；
 *     文件存在但解析/校验失败 → **抛**，绝不静默用 seed 覆盖团队已攒数据。
 *
 * 写白名单（createTask/createDependency/createNeed/closeoutKbNode）的 id / 时间戳 / clamp 初始态逻辑
 * **复用 InMemoryGovStore**（组合，零重复 / 零漂移，等同 FileKbStore 复用 appendCloseoutInto）；
 * 本 Store 只在每次成功写后追加一次 persist()。
 *
 * GovernanceSnapshot 仍是手写 interface（无 z.infer，D-051），其 fail-closed 加载 schema
 * `GovernanceSnapshotSchema` 现**单源于 contracts**（apps/hub-contracts/src/attribution.ts，带 .passthrough()
 * 防 load-time 丢字段 + drift-canary 守 key 集），本文件 import 之、不再各实体 schema 手拼（SSOT-B1 收口）。
 *
 * 三份独立落盘文件（均与 governance.json 同目录、同一套原子写 + 串行写链 + fail-closed 纪律，仅内容/schema
 * 不同）：governance.json（本文件主体）/ resources.json（R3 车管理）/ schedule-sessions.json
 * （SCHEDULE-PERSIST，resourceSessions + relayHandoffs 合一，product-redefine-2026-07 §4.4/§9-③）。
 */

/**
 * R3 车管理独立落盘格式（resources.json）：纯 SharedResource 数组。**为何独立于 governance.json**：
 * resources **不在 GovernanceSnapshot 内**（GovernanceSnapshot 是 11 字段、无 resources/resourceSessions），
 * 把它塞进 governance.json 会牵动 GovernanceSnapshotSchema + GOVERNANCE_ARRAY_FIELDS + clone 列表 + 已部署
 * ~/teamhub-data/gov.json 的格式兼容——故另开一份 resources.json，与 gov.json 同目录、同一套原子写纪律。
 * 加载 fail-closed：解析失败抛、绝不静默用 seed 覆盖团队已建的车。
 */
const ResourcesFileSchema = z.array(SharedResourceSchema);

/** resources.json 路径：与 govFilePath 同目录、basename 钉 `resources.json`（gov.json → resources.json）。 */
function deriveResourcesFilePath(govFilePath: string): string {
  return join(dirname(govFilePath), 'resources.json');
}

/**
 * SCHEDULE-PERSIST（product-redefine-2026-07 §4.4/§9-③ 补落盘设计）独立落盘格式（schedule-sessions.json）：
 * resourceSessions + relayHandoffs 一份文件。**为何两块合一、而非各自独立文件（不同于 resources.json 单开一份
 * 的先例）**：`deleteResourceSession` 会在 inner 内一次调用里**级联删除**引用它的 relayHandoffs（fromSessionId/
 * toSessionId 命中的边）——若分两条独立写链落两份文件，两次落盘之间存在窗口，一次崩溃/磁盘抖动可能让
 * 「session 已从磁盘消失、但 handoff 仍悬空引用它」的分叉持久化下来；合一文件 + 单一写链使这次级联删除
 * 落盘时是一次原子写，消除该窗口。
 * 加载 fail-closed：解析失败抛、绝不静默用 seed 覆盖团队已录的占用窗口/接力交接线。
 */
const ScheduleSessionsFileSchema = z.object({
  resourceSessions: z.array(ResourceSessionSchema),
  relayHandoffs: z.array(RelayHandoffSchema),
});

/**
 * schedule-sessions.json 路径：与 govFilePath 同目录、basename 钉 `schedule-sessions.json`
 * （gov.json → schedule-sessions.json，与 resources.json 同一套派生纪律）。
 */
function deriveScheduleSessionsFilePath(govFilePath: string): string {
  return join(dirname(govFilePath), 'schedule-sessions.json');
}

function cloneSnapshot(seed: GovernanceSnapshot): GovernanceSnapshot {
  // 数组键表已**单源于 contracts**（GOVERNANCE_SNAPSHOT_ARRAY_KEYS，见 attribution.ts）——不再本地手抄。
  return cloneArrayFields(seed, [...GOVERNANCE_SNAPSHOT_ARRAY_KEYS]);
}

export class FileGovStore implements GovStore {
  private readonly inner: InMemoryGovStore;
  private readonly filePath: string;
  // R3：车独立落盘文件（resources.json，与 gov.json 同目录）。resources 不在 GovernanceSnapshot 内，
  // 故与 governance.json 各写各的——createResource / updateResourceStatus 改 inner 后原子写本文件。
  private readonly resourcesFilePath: string;
  // SCHEDULE-PERSIST：占用窗口 + 接力交接线独立落盘文件（schedule-sessions.json，与 gov.json 同目录，
  // 两块合一见 ScheduleSessionsFileSchema 注释）。
  private readonly scheduleSessionsFilePath: string;
  // 串行化落盘：并发写不互相覆盖（H2 失败隔离）。governance.json / resources.json / schedule-sessions.json
  // 各持一条独立写链（三文件内容不同、互不阻塞，且各自 H2 失败隔离）。
  private writeChain: Promise<void> = Promise.resolve();
  private resourcesWriteChain: Promise<void> = Promise.resolve();
  private scheduleSessionsWriteChain: Promise<void> = Promise.resolve();

  private constructor(
    filePath: string,
    snapshot: GovernanceSnapshot,
    clock?: Clock,
  ) {
    this.filePath = filePath;
    this.resourcesFilePath = deriveResourcesFilePath(filePath);
    this.scheduleSessionsFilePath = deriveScheduleSessionsFilePath(filePath);
    // 组合内存实现复用写白名单的 id/时间戳/clamp 逻辑（零漂移）；它持有传入快照的可变副本。
    // 不传 clock 时沿用 InMemoryGovStore 默认（FixedClock(GOVERNANCE_SCENARIO_NOW)），与 real 路由同口径。
    this.inner = clock
      ? new InMemoryGovStore(snapshot, clock)
      : new InMemoryGovStore(snapshot);
  }

  /**
   * 异步构造：从 dataFile 加载（不存在则 seed 起头并落盘）。
   * **R3 车持久化**：resources.json 与 gov.json 同目录、独立加载——
   *  - resources.json 存在 → 严格解析（fail-closed）后**覆盖 inner 的 resources**（重启后团队建的车仍在）。
   *  - 不存在 → 用 inner 的 seed resources（scheduleScenarioFixture 锚点车）落一份 resources.json。
   */
  static async create(
    filePath: string,
    seed: GovernanceSnapshot = governanceScenarioFixture,
    clock?: Clock,
  ): Promise<FileGovStore> {
    let raw: string | null = null;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (err) {
      if ((err as { code?: string }).code !== 'ENOENT') throw err;
    }

    const store =
      raw === null
        ? new FileGovStore(filePath, cloneSnapshot(seed), clock)
        : // 文件存在 → 严格解析（损坏则抛，不静默覆盖团队数据）。
          new FileGovStore(
            filePath,
            GovernanceSnapshotSchema.parse(JSON.parse(raw)),
            clock,
          );

    if (raw === null) {
      // gov.json 不存在 → seed 起头 + 落一次盘（首启动落种子治理场景 + 图纸版本日志）。
      await store.persist();
    }

    await store.loadOrSeedResources();
    await store.loadOrSeedScheduleSessions();
    return store;
  }

  /**
   * R3 车持久化加载：resources.json 存在则 fail-closed 解析后覆盖 inner 的 resources；不存在则用 inner
   * 的 seed resources 落一份。**为何覆盖**：inner 构造期已从 scheduleScenarioFixture seed 一份锚点车，
   * 但磁盘上若有团队已建/已改的车，那才是单一真相——加载时整体替换内存数组的内容（保持引用，写白名单 + 回滚
   * 仍指向同一可变数组）。
   */
  private async loadOrSeedResources(): Promise<void> {
    let raw: string | null = null;
    try {
      raw = await readFile(this.resourcesFilePath, 'utf8');
    } catch (err) {
      if ((err as { code?: string }).code !== 'ENOENT') throw err;
    }

    if (raw === null) {
      // resources.json 不存在 → 用 inner seed 落一份（首启动持久化锚点车）。
      await this.persistResources();
      return;
    }

    // 存在 → fail-closed 解析后覆盖 inner 的 live resources 数组（原地替换内容、保持引用）。
    const loaded = ResourcesFileSchema.parse(JSON.parse(raw));
    const live = this.inner.resourcesForRollback();
    live.splice(0, live.length, ...loaded);
    // 载入后重算建车计数器，避免重启后新建车复用磁盘上已有的 `res-new-N` id（碰撞回归）。
    this.inner.resyncResourceSeq();
  }

  /**
   * SCHEDULE-PERSIST 加载（product-redefine-2026-07 §4.4/§9-③ 补落盘设计）：schedule-sessions.json
   * 存在则 fail-closed 解析后覆盖 inner 的 live resourceSessions/relayHandoffs（重启后团队录的占用窗口/
   * 接力交接线仍在）；不存在则用 inner 的 seed（scheduleScenarioFixture 锚点窗口，relayHandoffs 默认空）
   * 落一份（逐条镜像 loadOrSeedResources）。
   */
  private async loadOrSeedScheduleSessions(): Promise<void> {
    let raw: string | null = null;
    try {
      raw = await readFile(this.scheduleSessionsFilePath, 'utf8');
    } catch (err) {
      if ((err as { code?: string }).code !== 'ENOENT') throw err;
    }

    if (raw === null) {
      // schedule-sessions.json 不存在 → 用 inner seed 落一份（首启动持久化锚点窗口）。
      await this.persistScheduleSessions();
      return;
    }

    // 存在 → fail-closed 解析后覆盖 inner 的 live 数组内容（原地替换、保持引用）。
    const loaded = ScheduleSessionsFileSchema.parse(JSON.parse(raw));
    const liveSessions = this.inner.sessionsForRollback();
    liveSessions.splice(0, liveSessions.length, ...loaded.resourceSessions);
    const liveHandoffs = this.inner.handoffsForRollback();
    liveHandoffs.splice(0, liveHandoffs.length, ...loaded.relayHandoffs);
    // 载入后重算两个计数器，避免重启后新录入复用磁盘上已有的 id（碰撞回归，镜像 resyncResourceSeq）。
    this.inner.resyncScheduleSeqs();
  }

  async getSnapshot(): Promise<GovernanceSnapshot> {
    return this.inner.getSnapshot();
  }

  // 修复 #3：每个写方法先改内存（inner）再落盘；persist() 失败时**回滚刚追加 / 刚改的内存元素**再抛——
  // 否则「内存已变更 + 客户端拿 500 重试」会在内存里产生重复（重试再 push 一条）。
  // append 类（create* / appendArtifact）：rollback = 按返回 id 移除刚 push 的那条（inner 必新建唯一 id）。
  // closeoutKbNode：inner 现按 name upsert（可能覆盖既有节点），故先存「同 name 的写前节点」，失败时按 id 还原
  //   （命中=还原旧节点；未命中=移除新节点）。
  // idx 类（updateTaskStatus / waiveDependency）：先存写前整条元素，失败时按 id 原地还原。

  async createTask(draft: TaskDraft): Promise<Task> {
    const task = await this.inner.createTask(draft);
    await this.persistOrRollback(() => this.removeById('tasks', task.id));
    return task;
  }

  async createDependency(draft: DependencyDraft): Promise<Dependency> {
    const dependency = await this.inner.createDependency(draft);
    await this.persistOrRollback(() => this.removeById('dependencies', dependency.id));
    return dependency;
  }

  async createNeed(draft: NeedDraft): Promise<Need> {
    const need = await this.inner.createNeed(draft);
    await this.persistOrRollback(() => this.removeById('needs', need.id));
    return need;
  }

  async closeoutKbNode(draft: KnowledgeNodeDraft): Promise<KnowledgeNode> {
    // closeoutKbNode 按 name upsert：先快照「同 name 的写前节点」（可能不存在）。
    const snap = this.inner.snapshotForRollback();
    const priorByName = snap.knowledgeNodes.find((n) => n.name === draft.name);
    const node = await this.inner.closeoutKbNode(draft);
    await this.persistOrRollback(() => {
      const idx = snap.knowledgeNodes.findIndex((n) => n.id === node.id);
      if (idx < 0) return;
      if (priorByName) snap.knowledgeNodes[idx] = priorByName; // 覆盖 → 还原旧节点
      else snap.knowledgeNodes.splice(idx, 1); // 新增 → 移除
    });
    return node;
  }

  // 图纸提交日志追加（V1-FOLLOWUPS ④）：复用 inner 的 id/createdAt/submittedVia 逻辑 + 落盘累积。
  async appendArtifact(draft: ArtifactDraft): Promise<ArtifactRef> {
    const artifact = await this.inner.appendArtifact(draft);
    await this.persistOrRollback(() => this.removeById('artifacts', artifact.id));
    return artifact;
  }

  // 给既有归档物挂文件指针（POST /api/artifacts/:id/upload）：idx 类——委托 inner 就地改 storedFile + 落盘累积，
  // persist 失败按 id 原地还原旧条（镜像 updateTaskStatus）。storedFile 指针落 gov-data.json，字节在独立卷、重启不丢。
  async setArtifactFile(
    id: string,
    file: NonNullable<ArtifactRef['storedFile']>,
  ): Promise<ArtifactRef | null> {
    const snap = this.inner.snapshotForRollback();
    const idx = snap.artifacts.findIndex((a) => a.id === id);
    const prior = idx >= 0 ? snap.artifacts[idx] : undefined; // 写前整条（idx 类回滚需存旧值）
    const artifact = await this.inner.setArtifactFile(id, file);
    if (artifact) {
      await this.persistOrRollback(() => {
        if (prior) snap.artifacts[idx] = prior;
      });
    }
    return artifact;
  }

  // 差异化在场排班（D-029，SCHED-WIRE-EXISTING）：resources/resourceSessions **不在 GovernanceSnapshot 内**，
  // 故不落 governance.json（落盘会牵动 GovernanceSnapshotSchema + GOVERNANCE_ARRAY_FIELDS + 已部署
  // ~/teamhub-data JSON 兼容，属另一份文件的持久化面）——resources 落独立 resources.json（R3，见下）；
  // resourceSessions/relayHandoffs 落独立 schedule-sessions.json（SCHEDULE-PERSIST，product-redefine-2026-07
  // §4.4/§9-③ 补落盘设计，见文件顶部 ScheduleSessionsFileSchema 注释；此前 8 个排班方法连 JSON 落盘先例都
  // 没有，只走内存）。listResources 读直接委托 inner（resources 只读列表，无写副作用可回滚）。
  async listResources(): Promise<SharedResource[]> {
    return this.inner.listResources();
  }

  // R3 车管理（D-072 §3.2/§3.3）：与 resourceSessions 不同——resources **落盘**到独立 resources.json
  // （重启后团队建/退役的车仍在）。复用 inner 的 id/clamp/updatedAt 逻辑（零漂移）+ 每次成功写后原子写
  // resources.json；persist 失败回滚刚追加 / 刚改的内存元素（镜像 governance.json 的 persistOrRollback）。
  async createResource(draft: ResourceDraft): Promise<SharedResource> {
    const resource = await this.inner.createResource(draft);
    await this.persistResourcesOrRollback(() => this.removeResourceById(resource.id));
    return resource;
  }

  async updateResourceStatus(
    id: string,
    patch: ResourceStatusPatch,
  ): Promise<SharedResource | null> {
    // idx 类：先存写前整条（失败时按 id 原地还原），未命中（null）不触发无谓写。
    const live = this.inner.resourcesForRollback();
    const idx = live.findIndex((r) => r.id === id);
    const prior = idx >= 0 ? live[idx] : undefined;
    const resource = await this.inner.updateResourceStatus(id, patch);
    if (resource) {
      await this.persistResourcesOrRollback(() => {
        if (prior) live[idx] = prior;
      });
    }
    return resource;
  }

  // 默认阵型写回（PATCH /api/resources/:id/preset，D-082 §6 D2）：与 updateResourceStatus 同一持久化面
  // ——resources 落盘 resources.json，本方法改 inner 内存后同样走 persistResourcesOrRollback + idx 类回滚
  // （写前存整条，persist 失败按 id 原地还原）。
  async setResourceDefaultPreset(
    id: string,
    preset: ResourceDefaultPresetPatch,
  ): Promise<SharedResource | null> {
    const live = this.inner.resourcesForRollback();
    const idx = live.findIndex((r) => r.id === id);
    const prior = idx >= 0 ? live[idx] : undefined;
    const resource = await this.inner.setResourceDefaultPreset(id, preset);
    if (resource) {
      await this.persistResourcesOrRollback(() => {
        if (prior) live[idx] = prior;
      });
    }
    return resource;
  }

  /** 占用窗口只读（GET /api/resource-sessions 组 ScheduleSnapshot 用）。委托 inner，无写副作用可回滚。 */
  async listResourceSessions(): Promise<ResourceSession[]> {
    return this.inner.listResourceSessions();
  }

  /**
   * 占用窗口录入（POST /api/resource-sessions，D-029）：SCHEDULE-PERSIST——inner 补 id/createdAt/clamp 后
   * append 类回滚（镜像 createTask/createResource：persist 失败按 id 移除刚 push 的那条）。
   */
  async createResourceSession(
    draft: ResourceSessionDraft,
  ): Promise<ResourceSession> {
    const session = await this.inner.createResourceSession(draft);
    await this.persistScheduleSessionsOrRollback(() =>
      this.removeSessionById(session.id),
    );
    return session;
  }

  /**
   * 批量原子创建（POST /api/resource-sessions/batch，D-082 §5）：inner 内一次性 push 全部构造好的条目
   * （原子语义），落盘失败则把本批全部新增 id 逐一移除（不留半批幽灵记录）。
   */
  async createResourceSessionsBatch(
    drafts: ResourceSessionDraft[],
  ): Promise<ResourceSession[]> {
    const sessions = await this.inner.createResourceSessionsBatch(drafts);
    const ids = sessions.map((s) => s.id);
    await this.persistScheduleSessionsOrRollback(() => {
      for (const id of ids) this.removeSessionById(id);
    });
    return sessions;
  }

  /**
   * 占用窗口受限编辑（PATCH /api/resource-sessions/:id，R1 接力画布）：idx 类回滚（写前存整条，
   * 失败时按 id 原地还原，镜像 updateResourceStatus）。id 不存在（null）不触发无谓写。
   */
  async updateResourceSession(
    id: string,
    patch: ResourceSessionPatch,
  ): Promise<ResourceSession | null> {
    const live = this.inner.sessionsForRollback();
    const idx = live.findIndex((s) => s.id === id);
    const prior = idx >= 0 ? live[idx] : undefined;
    const session = await this.inner.updateResourceSession(id, patch);
    if (session) {
      await this.persistScheduleSessionsOrRollback(() => {
        if (prior) live[idx] = prior;
      });
    }
    return session;
  }

  /**
   * 删一棒（DELETE /api/resource-sessions/:id，A2）：inner 内一次调用**级联删除**引用它的接力交接线
   * （同一原子落盘，见 ScheduleSessionsFileSchema 注释）。写前留痕本条 session + 会被级联删除的交接线
   * （persist 失败时原样插回——顺序不保证与写前一致，但内容完整，镜像 append 类回滚的「撤回即可、无需
   * 精确复位」纪律）。未命中（false）不触发无谓写。
   */
  async deleteResourceSession(id: string): Promise<boolean> {
    const liveSessions = this.inner.sessionsForRollback();
    const liveHandoffs = this.inner.handoffsForRollback();
    const priorSession = liveSessions.find((s) => s.id === id);
    const priorHandoffs = liveHandoffs.filter(
      (h) => h.fromSessionId === id || h.toSessionId === id,
    );
    const deleted = await this.inner.deleteResourceSession(id);
    if (deleted) {
      await this.persistScheduleSessionsOrRollback(() => {
        if (priorSession) liveSessions.push(priorSession);
        liveHandoffs.push(...priorHandoffs);
      });
    }
    return deleted;
  }

  /** 接力交接线只读（GET /api/relay 组 ScheduleSnapshot 用）。委托 inner，无写副作用可回滚。 */
  async listRelayHandoffs(): Promise<RelayHandoff[]> {
    return this.inner.listRelayHandoffs();
  }

  /**
   * 接力交接线录入（POST /api/relay-handoffs，R1 画布拉线）：append 类回滚（persist 失败按 id 移除刚
   * push 的那条，镜像 createResourceSession）。
   */
  async createRelayHandoff(draft: RelayHandoffDraft): Promise<RelayHandoff> {
    const handoff = await this.inner.createRelayHandoff(draft);
    await this.persistScheduleSessionsOrRollback(() =>
      this.removeHandoffById(handoff.id),
    );
    return handoff;
  }

  /**
   * 删一条接力交接线（DELETE /api/relay-handoffs/:id）：写前存整条（persist 失败时插回，
   * 与 deleteResourceSession 同纪律）。未命中（false）不触发无谓写。
   */
  async deleteRelayHandoff(id: string): Promise<boolean> {
    const liveHandoffs = this.inner.handoffsForRollback();
    const prior = liveHandoffs.find((h) => h.id === id);
    const deleted = await this.inner.deleteRelayHandoff(id);
    if (deleted) {
      await this.persistScheduleSessionsOrRollback(() => {
        if (prior) liveHandoffs.push(prior);
      });
    }
    return deleted;
  }

  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<Task | null> {
    const snap = this.inner.snapshotForRollback();
    const idx = snap.tasks.findIndex((t) => t.id === taskId);
    const prior = idx >= 0 ? snap.tasks[idx] : undefined; // 写前整条（idx 类回滚需存旧值）
    const task = await this.inner.updateTaskStatus(taskId, status);
    // 仅命中才落盘：未命中（null）不触发无谓写。
    if (task) {
      await this.persistOrRollback(() => {
        if (prior) snap.tasks[idx] = prior;
      });
    }
    return task;
  }

  async waiveDependency(depId: string): Promise<Dependency | null> {
    const snap = this.inner.snapshotForRollback();
    const idx = snap.dependencies.findIndex((d) => d.id === depId);
    const prior = idx >= 0 ? snap.dependencies[idx] : undefined; // 写前整条
    const dependency = await this.inner.waiveDependency(depId);
    if (dependency) {
      await this.persistOrRollback(() => {
        if (prior) snap.dependencies[idx] = prior;
      });
    }
    return dependency;
  }

  // 设 / 改成员 PIN 散列（IDENTITY-LITE）：members 是 GovernanceSnapshot 字段 → 落 governance.json。
  // idx 类回滚（写前存整条，persist 失败按 id 原地还原，镜像 updateTaskStatus）。**密钥纪律**：pinHash
  // 随 members 一并落盘（预期，落盘文件里可以有），但绝不经读视图外露（路由层剥）。
  async setMemberPin(memberId: string, pinHash: string): Promise<Member | null> {
    const snap = this.inner.snapshotForRollback();
    const idx = snap.members.findIndex((m) => m.id === memberId);
    const prior = idx >= 0 ? snap.members[idx] : undefined;
    const member = await this.inner.setMemberPin(memberId, pinHash);
    if (member) {
      await this.persistOrRollback(() => {
        if (prior) snap.members[idx] = prior;
      });
    }
    return member;
  }

  // 新建赛季（SEASON-CREATE）：append 新 active + 旧 active 同笔转 archived（两类变更一笔写），
  // 故回滚不是单条 removeById——写前存整组元素，persist 失败时原地整组还原（保持数组引用稳定）。
  async createSeason(draft: SeasonDraft): Promise<Season> {
    const seasons = this.inner.snapshotForRollback().seasons;
    const prior = [...seasons];
    const season = await this.inner.createSeason(draft);
    await this.persistOrRollback(() => {
      seasons.length = 0;
      seasons.push(...prior);
    });
    return season;
  }

  /** 回滚句柄：从 live 快照按 id 移除一条 append 元素（仅持久层 rollback 用）。 */
  private removeById<K extends 'tasks' | 'dependencies' | 'needs' | 'artifacts'>(
    key: K,
    id: string,
  ): void {
    const arr = this.inner.snapshotForRollback()[key];
    const idx = arr.findIndex((el) => el.id === id);
    if (idx >= 0) arr.splice(idx, 1);
  }

  /** 落盘；失败则执行回滚句柄（撤回刚追加/刚改的内存元素）再把原错误抛给调用方（让客户端拿到真实失败）。 */
  private async persistOrRollback(rollback: () => void): Promise<void> {
    try {
      await this.persist();
    } catch (err) {
      rollback();
      throw err;
    }
  }

  /** 原子写：写 tmp 再 rename，串行化避免并发覆盖。 */
  private async persist(): Promise<void> {
    const op = this.writeChain.then(() => this.writeOnce());
    // H2（AUDIT-FIXES 部署前必修）：失败隔离。推进写链时**吞掉本次错误**（reset 为 resolved），
    // 否则一次瞬时磁盘抖动（ENOSPC/EACCES）会让 writeChain 永久 rejected → 之后每次 persist 的
    // .then 回调被静默跳过、内存与磁盘分叉、store 以为存了却再不落盘。调用方仍拿到本次真实错误（op）。
    this.writeChain = op.catch(() => undefined);
    return op;
  }

  private async writeOnce(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    // 只读序列化，无需 getSnapshot 的数组克隆隔离（JSON 与 live 逐字相同，见 getSnapshot 注释）；
    // JSON.stringify 同步读取、无 await 间隙，用 live 引用即可，省每次写的 8 数组克隆。
    const snapshot = this.inner.snapshotForRollback();
    try {
      await writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
      await rename(tmp, this.filePath);
    } catch (err) {
      // L2：rename 后失败会漏 .tmp；写失败也清残留，避免孤儿临时文件堆积。
      await unlink(tmp).catch(() => {});
      throw err;
    }
  }

  // --- R3 车独立落盘（resources.json）：与 governance.json persist 逐条镜像，仅写不同文件 + 独立写链 ---

  /** 回滚句柄：从 live resources 数组按 id 移除一条 append 的车（仅 createResource persist 失败时用）。 */
  private removeResourceById(id: string): void {
    const arr = this.inner.resourcesForRollback();
    const idx = arr.findIndex((r) => r.id === id);
    if (idx >= 0) arr.splice(idx, 1);
  }

  /** 写 resources.json；失败则回滚刚追加/刚改的内存车再把原错误抛给调用方。 */
  private async persistResourcesOrRollback(rollback: () => void): Promise<void> {
    try {
      await this.persistResources();
    } catch (err) {
      rollback();
      throw err;
    }
  }

  /** 原子写 resources.json，独立写链串行化避免并发覆盖（H2 失败隔离，与 governance.json 同纪律）。 */
  private async persistResources(): Promise<void> {
    const op = this.resourcesWriteChain.then(() => this.writeResourcesOnce());
    // H2：推进写链时吞掉本次错误（reset 为 resolved），否则一次瞬时磁盘抖动会让 resourcesWriteChain
    // 永久 rejected → 之后每次 persistResources 的 .then 回调被静默跳过、内存与磁盘分叉。调用方仍拿到本次真实错误。
    this.resourcesWriteChain = op.catch(() => undefined);
    return op;
  }

  private async writeResourcesOnce(): Promise<void> {
    await mkdir(dirname(this.resourcesFilePath), { recursive: true });
    const tmp = `${this.resourcesFilePath}.tmp`;
    const resources = await this.inner.listResources();
    try {
      await writeFile(tmp, JSON.stringify(resources, null, 2), 'utf8');
      await rename(tmp, this.resourcesFilePath);
    } catch (err) {
      // L2：写失败 / rename 后失败都清残留 .tmp，避免孤儿临时文件堆积。
      await unlink(tmp).catch(() => {});
      throw err;
    }
  }

  // --- SCHEDULE-PERSIST：占用窗口 + 接力交接线合一落盘（schedule-sessions.json）——与 governance.json/
  // resources.json persist 逐条镜像，仅写不同文件 + 独立写链（两块合一见 ScheduleSessionsFileSchema 注释）。

  /** 回滚句柄：从 live resourceSessions 数组按 id 移除一条 append 的窗口（仅 create* persist 失败时用）。 */
  private removeSessionById(id: string): void {
    const arr = this.inner.sessionsForRollback();
    const idx = arr.findIndex((s) => s.id === id);
    if (idx >= 0) arr.splice(idx, 1);
  }

  /** 回滚句柄：从 live relayHandoffs 数组按 id 移除一条 append 的交接线（仅 createRelayHandoff persist 失败时用）。 */
  private removeHandoffById(id: string): void {
    const arr = this.inner.handoffsForRollback();
    const idx = arr.findIndex((h) => h.id === id);
    if (idx >= 0) arr.splice(idx, 1);
  }

  /** 写 schedule-sessions.json；失败则回滚刚做的内存改动再把原错误抛给调用方。 */
  private async persistScheduleSessionsOrRollback(
    rollback: () => void,
  ): Promise<void> {
    try {
      await this.persistScheduleSessions();
    } catch (err) {
      rollback();
      throw err;
    }
  }

  /** 原子写 schedule-sessions.json，独立写链串行化避免并发覆盖（H2 失败隔离，与 governance.json 同纪律）。 */
  private async persistScheduleSessions(): Promise<void> {
    const op = this.scheduleSessionsWriteChain.then(() =>
      this.writeScheduleSessionsOnce(),
    );
    // H2：推进写链时吞掉本次错误（reset 为 resolved），否则一次瞬时磁盘抖动会让
    // scheduleSessionsWriteChain 永久 rejected → 之后每次 persistScheduleSessions 的 .then 回调被静默
    // 跳过、内存与磁盘分叉。调用方仍拿到本次真实错误。
    this.scheduleSessionsWriteChain = op.catch(() => undefined);
    return op;
  }

  private async writeScheduleSessionsOnce(): Promise<void> {
    await mkdir(dirname(this.scheduleSessionsFilePath), { recursive: true });
    const tmp = `${this.scheduleSessionsFilePath}.tmp`;
    const payload = {
      resourceSessions: await this.inner.listResourceSessions(),
      relayHandoffs: await this.inner.listRelayHandoffs(),
    };
    try {
      await writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8');
      await rename(tmp, this.scheduleSessionsFilePath);
    } catch (err) {
      // L2：写失败 / rename 后失败都清残留 .tmp，避免孤儿临时文件堆积。
      await unlink(tmp).catch(() => {});
      throw err;
    }
  }
}
