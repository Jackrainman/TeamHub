import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import {
  ArtifactRefSchema,
  DependencySchema,
  GroupSchema,
  KnowledgeNodeSchema,
  MemberSchema,
  NeedSchema,
  TaskKnowledgeTagSchema,
  TaskSchema,
  governanceScenarioFixture,
} from '@teamhub/hub-contracts';
import type {
  ArtifactRef,
  Dependency,
  GovernanceSnapshot,
  KnowledgeNode,
  Need,
  RelayHandoff,
  ResourceSession,
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
  ResourceSessionDraft,
  ResourceSessionPatch,
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
 * GovernanceSnapshot 无 zod schema（是手写 interface），故这里用各实体 schema 拼一个解析 schema 做
 * fail-closed 加载（与 FileKbStore 的 KbSnapshotSchema 同口径）。
 */
const GovernanceSnapshotSchema = z.object({
  seasonId: z.string().min(1),
  projectId: z.string().min(1),
  stage: z.string().min(1),
  groups: z.array(GroupSchema),
  members: z.array(MemberSchema),
  tasks: z.array(TaskSchema),
  dependencies: z.array(DependencySchema),
  needs: z.array(NeedSchema),
  knowledgeNodes: z.array(KnowledgeNodeSchema),
  taskKnowledgeTags: z.array(TaskKnowledgeTagSchema),
  artifacts: z.array(ArtifactRefSchema),
});

/** 治理快照全 8 数组字段（写方法可能 push/splice 的集合）——克隆隔离用。 */
const GOVERNANCE_ARRAY_FIELDS: (keyof GovernanceSnapshot)[] = [
  'groups',
  'members',
  'tasks',
  'dependencies',
  'needs',
  'knowledgeNodes',
  'taskKnowledgeTags',
  'artifacts',
];

function cloneSnapshot(seed: GovernanceSnapshot): GovernanceSnapshot {
  return cloneArrayFields(seed, GOVERNANCE_ARRAY_FIELDS);
}

export class FileGovStore implements GovStore {
  private readonly inner: InMemoryGovStore;
  private readonly filePath: string;
  // 串行化落盘：并发写不互相覆盖（H2 失败隔离）。
  private writeChain: Promise<void> = Promise.resolve();

  private constructor(
    filePath: string,
    snapshot: GovernanceSnapshot,
    clock?: Clock,
  ) {
    this.filePath = filePath;
    // 组合内存实现复用写白名单的 id/时间戳/clamp 逻辑（零漂移）；它持有传入快照的可变副本。
    // 不传 clock 时沿用 InMemoryGovStore 默认（FixedClock(GOVERNANCE_SCENARIO_NOW)），与 real 路由同口径。
    this.inner = clock
      ? new InMemoryGovStore(snapshot, clock)
      : new InMemoryGovStore(snapshot);
  }

  /** 异步构造：从 dataFile 加载（不存在则 seed 起头并落盘）。 */
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

    if (raw === null) {
      // 文件不存在 → seed 起头 + 落一次盘（首启动落种子治理场景 + 图纸版本日志）。
      const store = new FileGovStore(filePath, cloneSnapshot(seed), clock);
      await store.persist();
      return store;
    }

    // 文件存在 → 严格解析（损坏则抛，不静默覆盖团队数据）。
    const snapshot = GovernanceSnapshotSchema.parse(JSON.parse(raw));
    return new FileGovStore(filePath, snapshot, clock);
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

  // 差异化在场排班（D-029，SCHED-WIRE-EXISTING）：resources/resourceSessions **不在 GovernanceSnapshot 内**，
  // 故**不落盘**（落盘会牵动 GovernanceSnapshotSchema + GOVERNANCE_ARRAY_FIELDS + 已部署 ~/teamhub-data JSON 兼容，
  // 属本刀 DoD 外的落盘格式变更）。读直接委托 inner；写仅落 inner 内存（进程重启回 seed scheduleScenarioFixture）。
  // 语义相容：占用窗口粗粒度临时（今晚/明天，C1 低录入），不像图纸日志需永久。委托 inner 不调 persist()。
  async listResources(): Promise<SharedResource[]> {
    return this.inner.listResources();
  }

  async listResourceSessions(): Promise<ResourceSession[]> {
    return this.inner.listResourceSessions();
  }

  async createResourceSession(
    draft: ResourceSessionDraft,
  ): Promise<ResourceSession> {
    // 不落盘（见上）：直接委托 inner，重启回 seed。无 persistOrRollback 包裹（无磁盘副作用可回滚）。
    return this.inner.createResourceSession(draft);
  }

  // 接力画布编辑 / 交接线（R1）：与 resource/session 同段不落盘（D-029，见上方注释）——eta/orderInWindow
  // 改动与 relayHandoffs 增删均**只落 inner 内存**，进程重启回 seed。委托 inner、不调 persist()。
  async updateResourceSession(
    id: string,
    patch: ResourceSessionPatch,
  ): Promise<ResourceSession | null> {
    return this.inner.updateResourceSession(id, patch);
  }

  async listRelayHandoffs(): Promise<RelayHandoff[]> {
    return this.inner.listRelayHandoffs();
  }

  async createRelayHandoff(draft: RelayHandoffDraft): Promise<RelayHandoff> {
    return this.inner.createRelayHandoff(draft);
  }

  async deleteRelayHandoff(id: string): Promise<boolean> {
    return this.inner.deleteRelayHandoff(id);
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
    const snapshot = await this.inner.getSnapshot();
    try {
      await writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
      await rename(tmp, this.filePath);
    } catch (err) {
      // L2：rename 后失败会漏 .tmp；写失败也清残留，避免孤儿临时文件堆积。
      await unlink(tmp).catch(() => {});
      throw err;
    }
  }
}
