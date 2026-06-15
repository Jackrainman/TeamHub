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
  Dependency,
  GovernanceSnapshot,
  KnowledgeNode,
  Need,
  Task,
} from '@teamhub/hub-contracts';
import type { Clock } from '../clock.js';
import { InMemoryGovStore } from './mock-gov-store.js';
import type {
  DependencyDraft,
  GovStore,
  KnowledgeNodeDraft,
  NeedDraft,
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

function cloneSnapshot(seed: GovernanceSnapshot): GovernanceSnapshot {
  return {
    ...seed,
    groups: [...seed.groups],
    members: [...seed.members],
    tasks: [...seed.tasks],
    dependencies: [...seed.dependencies],
    needs: [...seed.needs],
    knowledgeNodes: [...seed.knowledgeNodes],
    taskKnowledgeTags: [...seed.taskKnowledgeTags],
    artifacts: [...seed.artifacts],
  };
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

  async createTask(draft: TaskDraft): Promise<Task> {
    const task = await this.inner.createTask(draft);
    await this.persist();
    return task;
  }

  async createDependency(draft: DependencyDraft): Promise<Dependency> {
    const dependency = await this.inner.createDependency(draft);
    await this.persist();
    return dependency;
  }

  async createNeed(draft: NeedDraft): Promise<Need> {
    const need = await this.inner.createNeed(draft);
    await this.persist();
    return need;
  }

  async closeoutKbNode(draft: KnowledgeNodeDraft): Promise<KnowledgeNode> {
    const node = await this.inner.closeoutKbNode(draft);
    await this.persist();
    return node;
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
