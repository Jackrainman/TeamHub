import {
  baselineScenarioFixture,
  type BaselineMilestone,
  type PassMilestoneRequest,
  type SeasonBaseline,
  type UpdateBaselineRequest,
} from '@teamhub/hub-contracts';
import { cloneArrayFields } from './clone-snapshot.js';
import type { BaselineStore } from './baseline-store.js';

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
 * `PATCH /api/baseline` 生成自己的模板覆盖之。进程重启丢失为预期；落盘持久层见 `FileBaselineStore`。
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
    const merged: SeasonBaseline = prior
      ? { ...prior, ...patch, id: prior.id, seasonId }
      : {
          id: `baseline-${seasonId}`,
          seasonId,
          anchors: patch.anchors ?? {},
          segments: patch.segments ?? [],
          phases: patch.phases ?? [],
          milestones: patch.milestones ?? [],
        };
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
    const idx = baseline.milestones.findIndex((m) => m.id === milestoneId);
    if (idx < 0) return null;

    const prior = baseline.milestones[idx];
    const updated: BaselineMilestone = {
      ...prior,
      status: input.status,
      // 未提供的可选字段维持原值（不覆空）——过门可能分两步补证据/留言，不该让后一步抹掉前一步。
      ...(input.passedBy !== undefined ? { passedBy: input.passedBy } : {}),
      ...(input.evidenceRefs !== undefined ? { evidenceRefs: input.evidenceRefs } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    };
    const milestones = [...baseline.milestones];
    milestones[idx] = updated;
    const next: SeasonBaseline = { ...baseline, milestones };
    this.baselines.set(seasonId, next);
    return cloneBaseline(next);
  }

  /**
   * @internal 持久层回滚专用（FileBaselineStore）：读某赛季当前条目的 live 引用（可能不存在）。
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
