import {
  GOVERNANCE_SCENARIO_NOW,
  GOVERNANCE_SNAPSHOT_ARRAY_KEYS,
  governanceScenarioFixture,
  scheduleScenarioFixture,
} from '@teamhub/hub-contracts';
import type {
  GovernanceSnapshot,
  RelayHandoff,
  ResourceSession,
  SharedResource,
} from '@teamhub/hub-contracts';
import { FixedClock } from '../../src/clock.js';
import type { Clock } from '../../src/clock.js';
import { cloneArrayFields } from '../../src/store/clone-snapshot.js';
import { createIdSequence } from '../../src/store/id-sequence.js';
import type { IdSequence } from '../../src/store/id-sequence.js';

/**
 * 治理快照全数组字段键（写方法可能 push/splice 的集合）——构造期克隆隔离 + getSnapshot 浅拷贝共用。
 * 键表已**单源于 contracts**（GOVERNANCE_SNAPSHOT_ARRAY_KEYS，见 attribution.ts SYNC 注释：增删数组字段须同步那处）；
 * 本地以可变副本承接（cloneArrayFields 形参要 mutable keyof[]，而单源常量是 ReadonlyArray）。
 * 导出给域 mixin（mock-gov-store-pm.ts 的 getSnapshot）共用同一份键表，零重抄。
 */
export const GOVERNANCE_ARRAY_FIELDS: (keyof GovernanceSnapshot)[] = [
  ...GOVERNANCE_SNAPSHOT_ARRAY_KEYS,
];

/**
 * 内存实现基座：状态 + 构造 + 持久层内部句柄（域方法经 mixin 叠加，见 mock-gov-store.ts 组合根）。
 * 默认 seed 真实锚点场景 fixtures，让 real 路由从第一个请求起就有可派生的真实场景
 * （进程重启丢失为预期行为，SQLite/Postgres 持久层见 旧生产 Store）。
 *
 * 写白名单全部已落地：createTask/createDependency/createNeed（PM 录入簇）+ closeoutKbNode（KB-CORE）。
 * 每个写方法 Store 负责补 id/时间戳/派生默认 + clamp 初始态（C1 兜底录入、不取代 git/lark 派生信号）。
 */
export class InMemoryGovStoreBase {
  protected readonly snapshot: GovernanceSnapshot;
  protected readonly clock: Clock;
  // 差异化在场排班（D-029）的两块数据**不在 GovernanceSnapshot 内**（见 gov-store.ts listResources 注释），
  // 故存独立可变数组。**seed 来源 = scheduleScenarioFixture**（=governanceScenarioFixture + res-r1/res-r2 +
  // sess-tonight-ec[今晚] + sess-convergence-day-r1/r2[总联调日]）——默认 governanceScenarioFixture 不含这两块，会让 GET /api/schedule
  // 第一请求即空、被误判「功能没接通」。引 schedule fixture 取这两块、克隆隔离（写方法 push 不污染共享 fixture）。
  protected readonly resources: SharedResource[];
  protected readonly resourceSessions: ResourceSession[];
  // 接力交接线（R1）：与 resourceSessions 同走内存、不落盘（D-029）。seed=空（队长在画布拉线产生）。
  protected readonly relayHandoffs: RelayHandoff[];
  // L1：单调自增计数器（构造期初始化为对应 seed 数组 length），实现抽到 id-sequence.ts（STORE-SPLIT-SQLITE，
  // 纯函数模块，mock/file/sqlite 三实现共享同一份策略）。createX 用 `nextSequentialId(prefix, seq)` 生成 id，
  // 替代 `数组.length + 1`——后者在未来加 delete 后会复用已删 id、静默撞 FK；单调计数器永不回退、杜绝此脆弱性。
  // 当前无 delete 故纯防御性；纯内部 id 派生，响应 / 落盘格式不变。
  protected readonly taskSeq: IdSequence;
  protected readonly dependencySeq: IdSequence;
  protected readonly needSeq: IdSequence;
  protected readonly knowledgeNodeSeq: IdSequence;
  protected readonly seasonSeq: IdSequence;
  // 名册导入（ROSTER-IMPORT，K8）：members/groups 是 GovernanceSnapshot 字段、随 seed 传入构造，
  // 故计数器从 seed 长度起步即已含已加载数据（无 delete、单调增），无需 旧生产 Store 载入后 resync
  // （resources/sessions 才需 resync——它们不在 GovernanceSnapshot、构造后才 splice 进 live）。
  protected readonly memberSeq: IdSequence;
  protected readonly groupSeq: IdSequence;
  // 非 readonly：resyncResourceSeq() / resyncScheduleSeqs() 载入磁盘文件后需换成新起点的序列（见该方法）。
  protected resourceSeq: IdSequence;
  protected resourceSessionSeq: IdSequence;
  protected relayHandoffSeq: IdSequence;

  constructor(
    seed: GovernanceSnapshot = governanceScenarioFixture,
    clock: Clock = new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW)),
    // K6（时钟与空板刀）：演示态 = 演示锚点、真实态 = 真空板。demoSeed=true（默认）从 scheduleScenarioFixture
    // seed 资源/占用窗口/接力交接线；demoSeed=false（main.ts 在 config.dataMode='real' 时透传）→ 空数组。
    demoSeed = true,
  ) {
    // 浅克隆 + 克隆全部 8 个数组（M13）：写方法追加时不污染共享 fixture。复用 cloneArrayFields（与
    // 旧生产 Store.cloneSnapshot 同一份实现，零漂移）——groups/members/taskKnowledgeTags 当前无写方法触及，
    // 但一并克隆保证隔离一致性（防未来写入串台污染共享 fixture，进而影响后续实例与依赖 fixture 的测试）。
    this.snapshot = cloneArrayFields(seed, GOVERNANCE_ARRAY_FIELDS);
    this.clock = clock;
    // 资源 / 占用窗口锚点数据：**受 demoSeed 管**（K6 时钟与空板刀）。与 seed 治理快照解耦——这两块锚点
    // 不在 GovernanceSnapshot 里、无从随 seed 传，故此前恒钉演示数据；空板走查坐实：真实态（demoSeed=false）
    // 若仍 seed 演示车，空板会见两台虚构车 + 演示排班（浏览器真钟 − 服务端假钟 → stalenessDays 秒破 14 天）。
    // 故演示态（默认）seed scheduleScenarioFixture 锚点、真实态给空数组（真空板）。元素浅拷贝即可
    // （invitedMemberIds 数组当前无原地 mutate；createResourceSession 只 push 整条新对象）。
    this.resources = demoSeed
      ? scheduleScenarioFixture.resources.map((r) => ({ ...r }))
      : [];
    this.resourceSessions = demoSeed
      ? scheduleScenarioFixture.resourceSessions.map((s) => ({ ...s }))
      : [];
    // 接力交接线 seed（R1）：fixture 默认空，重启回此空态（D-029 内存态）；demoSeed=false 同样空。元素浅拷贝隔离。
    this.relayHandoffs = demoSeed
      ? scheduleScenarioFixture.relayHandoffs.map((h) => ({ ...h }))
      : [];
    // L1：计数器从 seed 数组 length 起步——首条 create 得 `…-new-${length+1}`，与原 length+1 派生
    // 在零删除时逐字等价（无 id 格式回归），但此后只增不减。
    this.taskSeq = createIdSequence(this.snapshot.tasks.length);
    this.dependencySeq = createIdSequence(this.snapshot.dependencies.length);
    this.needSeq = createIdSequence(this.snapshot.needs.length);
    this.knowledgeNodeSeq = createIdSequence(this.snapshot.knowledgeNodes.length);
    this.seasonSeq = createIdSequence(this.snapshot.seasons.length);
    this.memberSeq = createIdSequence(this.snapshot.members.length);
    this.groupSeq = createIdSequence(this.snapshot.groups.length);
    this.resourceSeq = createIdSequence(this.resources.length);
    this.resourceSessionSeq = createIdSequence(this.resourceSessions.length);
    this.relayHandoffSeq = createIdSequence(this.relayHandoffs.length);
  }

  /**
   * @internal 持久层回滚专用：返回**可变的** live 快照引用（即写方法 push/改 idx 的同一对象），
   * 让 旧生产 Store 在 persist() 失败时把刚追加的内存元素撤回（避免「内存已变更 + 客户端 500 重试」产生重复）。
   * **不对外公开**：仅 旧生产 Store 在自身写方法内、捕获写前状态 + persist 失败时调用；正常读路径走 getSnapshot()。
   */
  snapshotForRollback(): GovernanceSnapshot {
    return this.snapshot;
  }

  /**
   * @internal 持久层回滚专用（R3）：返回**可变的** live resources 数组引用（createResource push /
   * updateResourceStatus 原地改的同一对象），让 旧生产 Store 在 resources.json 写失败时撤回刚追加 /
   * 刚改的整车（与 snapshotForRollback 同纪律，不对外公开）。resources 不在 GovernanceSnapshot 内，故单独开此句柄。
   */
  resourcesForRollback(): SharedResource[] {
    return this.resources;
  }

  /**
   * @internal R3 持久化载入后重算 resourceSeq：取现有 resources 里 `res-new-N` 后缀的最大值。
   * 旧生产 Store 在构造后才把磁盘上的车 splice 进 live，若不重算、计数器仍停在构造期 seed 长度，
   * 重启后再建车会复用同一 `res-new-N` → id 碰撞（覆盖既有车 / React key 冲突）。loadOrSeedResources 载入分支调用。
   */
  resyncResourceSeq(): void {
    let max = 0;
    for (const r of this.resources) {
      const m = /^res-new-(\d+)$/.exec(r.id);
      if (m) {
        const n = Number(m[1]);
        if (n > max) max = n;
      }
    }
    // createIdSequence 是纯工厂函数（见 id-sequence.ts）：换新起点即换一个新的序列对象，
    // 而非在旧对象上 mutate 内部计数器（IdSequence 本身不开 reset 口子，只增不减的纪律保持不变）。
    this.resourceSeq = createIdSequence(max);
  }

  /**
   * @internal 持久层回滚专用（SCHEDULE-PERSIST，product-redefine-2026-07 §4.4/§9-③）：返回**可变的**
   * live resourceSessions 数组引用（createResourceSession/Batch push、updateResourceSession 原地改 idx、
   * deleteResourceSession splice 的同一对象），让 旧生产 Store 在 schedule-sessions.json 写失败时撤回
   * 刚做的内存改动（与 resourcesForRollback 同纪律，不对外公开）。
   */
  sessionsForRollback(): ResourceSession[] {
    return this.resourceSessions;
  }

  /**
   * @internal 持久层回滚专用（SCHEDULE-PERSIST）：返回**可变的** live relayHandoffs 数组引用
   * （createRelayHandoff push、deleteRelayHandoff/deleteResourceSession 级联 splice 的同一对象）。
   */
  handoffsForRollback(): RelayHandoff[] {
    return this.relayHandoffs;
  }

  /**
   * @internal SCHEDULE-PERSIST 持久化载入后重算 resourceSessionSeq/relayHandoffSeq：取现有数组里
   * `sess-new-N` / `handoff-new-N` 后缀的最大值（逐字镜像 resyncResourceSeq）。旧生产 Store 在构造后
   * 才把磁盘上的 sessions/handoffs splice 进 live，若不重算、计数器仍停在构造期 seed 长度，重启后再
   * 录入会复用同一 id（覆盖既有窗口/交接线、React key 冲突）。loadOrSeedScheduleSessions 载入分支调用。
   */
  resyncScheduleSeqs(): void {
    let maxSession = 0;
    for (const s of this.resourceSessions) {
      const m = /^sess-new-(\d+)$/.exec(s.id);
      if (m) {
        const n = Number(m[1]);
        if (n > maxSession) maxSession = n;
      }
    }
    this.resourceSessionSeq = createIdSequence(maxSession);

    let maxHandoff = 0;
    for (const h of this.relayHandoffs) {
      const m = /^handoff-new-(\d+)$/.exec(h.id);
      if (m) {
        const n = Number(m[1]);
        if (n > maxHandoff) maxHandoff = n;
      }
    }
    this.relayHandoffSeq = createIdSequence(maxHandoff);
  }
}
