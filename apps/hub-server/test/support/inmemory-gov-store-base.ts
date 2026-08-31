import {
  GOVERNANCE_SCENARIO_NOW,
  GOVERNANCE_SNAPSHOT_ARRAY_KEYS,
  governanceScenarioFixture,
} from '@teamhub/hub-contracts';
import type { GovernanceSnapshot } from '@teamhub/hub-contracts';
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

  constructor(
    seed: GovernanceSnapshot = governanceScenarioFixture,
    clock: Clock = new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW)),
  ) {
    // 浅克隆 + 克隆全部 8 个数组（M13）：写方法追加时不污染共享 fixture。复用 cloneArrayFields（与
    // 旧生产 Store.cloneSnapshot 同一份实现，零漂移）——groups/members/taskKnowledgeTags 当前无写方法触及，
    // 但一并克隆保证隔离一致性（防未来写入串台污染共享 fixture，进而影响后续实例与依赖 fixture 的测试）。
    this.snapshot = cloneArrayFields(seed, GOVERNANCE_ARRAY_FIELDS);
    this.clock = clock;
    // L1：计数器从 seed 数组 length 起步——首条 create 得 `…-new-${length+1}`，与原 length+1 派生
    // 在零删除时逐字等价（无 id 格式回归），但此后只增不减（delete 后不复用已删 id）。
    this.taskSeq = createIdSequence(this.snapshot.tasks.length);
    this.dependencySeq = createIdSequence(this.snapshot.dependencies.length);
    this.needSeq = createIdSequence(this.snapshot.needs.length);
    this.knowledgeNodeSeq = createIdSequence(this.snapshot.knowledgeNodes.length);
    this.seasonSeq = createIdSequence(this.snapshot.seasons.length);
    this.memberSeq = createIdSequence(this.snapshot.members.length);
    this.groupSeq = createIdSequence(this.snapshot.groups.length);
  }

  /**
   * @internal 持久层回滚专用：返回**可变的** live 快照引用（即写方法 push/改 idx 的同一对象），
   * 让 旧生产 Store 在 persist() 失败时把刚追加的内存元素撤回（避免「内存已变更 + 客户端 500 重试」产生重复）。
   * **不对外公开**：仅 旧生产 Store 在自身写方法内、捕获写前状态 + persist 失败时调用；正常读路径走 getSnapshot()。
   */
  snapshotForRollback(): GovernanceSnapshot {
    return this.snapshot;
  }
}
