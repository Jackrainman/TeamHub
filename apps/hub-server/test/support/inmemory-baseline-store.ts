import {
  baselineScenarioFixture,
  type PassMilestoneRequest,
  type SeasonBaseline,
  type UpdateBaselineRequest,
} from '@teamhub/hub-contracts';
import { cloneArrayFields } from '../../src/store/clone-snapshot.js';
import { applyMilestonePass, mergeBaseline } from '../../src/store/base-baseline-logic.js';
import type { BaselineStore } from '../../src/store/baseline-store.js';

/** 单条基准线的数组字段（写方法整体替换/追加的集合）——克隆隔离用（同 InvStore/KbStore 纪律）。 */
const BASELINE_ARRAY_FIELDS: (keyof SeasonBaseline)[] = [
  'segments',
  'phases',
  'milestones',
];

function cloneBaseline(baseline: SeasonBaseline): SeasonBaseline {
  return cloneArrayFields(baseline, BASELINE_ARRAY_FIELDS);
}

/**
 * 倒排基准线内存参考实现（BASELINE-CORE）。键 = `seasonId`（baseline-design.md §1 细节1：
 * 基准线是战队级、赛季一条链，不按组各建一条）。
 *
 * 默认 seed = `baselineScenarioFixture`（S6 接上，同 InMemoryInvStore 缺省 seed 先例）——一条
 * season-robocon-2026 的三版车节奏演示基准线，保证 demo 首屏「基准线 vs 实际」非空。真实团队走
 * `PATCH /api/baseline` 生成自己的模板覆盖之。进程重启丢失为预期；落盘持久层见 `旧生产 Store`。
 *
 * 写方法（`upsertBaseline`/`passMilestone`）均**不原地 mutate** 已存条目——每次改动都产出新对象
 * 整体替换 Map 条目（同 InMemoryInvStore「先算后写、非法即抛不留副作用」的纪律，只是这里连合法写
 * 也走整体替换，免去 splice 回滚的必要）。
 */
export class InMemoryBaselineStore implements BaselineStore {
  private readonly baselines: Map<string, SeasonBaseline>;

  constructor(seed: SeasonBaseline[] = baselineScenarioFixture) {
    this.baselines = new Map(seed.map((b) => [b.seasonId, cloneBaseline(b)]));
  }

  async getBaseline(seasonId: string): Promise<SeasonBaseline | null> {
    const found = this.baselines.get(seasonId);
    return found ? cloneBaseline(found) : null;
  }

  async upsertBaseline(
    seasonId: string,
    patch: UpdateBaselineRequest,
  ): Promise<SeasonBaseline> {
    const prior = this.baselines.get(seasonId);
    const merged = mergeBaseline(seasonId, patch, prior);
    this.baselines.set(seasonId, merged);
    return cloneBaseline(merged);
  }

  async passMilestone(
    seasonId: string,
    milestoneId: string,
    input: PassMilestoneRequest,
  ): Promise<SeasonBaseline | null> {
    const baseline = this.baselines.get(seasonId);
    if (!baseline) return null;
    const next = applyMilestonePass(baseline, milestoneId, input);
    if (!next) return null;
    this.baselines.set(seasonId, next);
    return cloneBaseline(next);
  }

  /**
   * @internal 持久层回滚专用（旧生产 Store）：读某赛季当前条目的 live 引用（可能不存在）。
   * 不做克隆隔离——调用方只用于捕获写前状态以便 persist() 失败时精确还原，不对外暴露给业务读路径。
   */
  peek(seasonId: string): SeasonBaseline | undefined {
    return this.baselines.get(seasonId);
  }

  /**
   * @internal 持久层回滚专用：整体替换或删除（`value===undefined`）某赛季条目，供 persist() 失败时
   * 把内存精确还原到写前状态（包括「写前本不存在、写后需撤销新建」的情形）。
   */
  restore(seasonId: string, value: SeasonBaseline | undefined): void {
    if (value === undefined) {
      this.baselines.delete(seasonId);
    } else {
      this.baselines.set(seasonId, value);
    }
  }

  /** @internal 落盘专用：所有赛季基准线（只读遍历序列化，无需克隆隔离——JSON 与 live 逐字相同）。 */
  entries(): SeasonBaseline[] {
    return Array.from(this.baselines.values());
  }
}
