import type {
  BaselineMilestone,
  PassMilestoneRequest,
  SeasonBaseline,
  UpdateBaselineRequest,
} from '@teamhub/hub-contracts';

/**
 * 倒排基准线域写逻辑（三实现共享）：把 upsert/passMilestone 的纯对象变换从 InMemory 与 Sqlite
 * store 中抽出，消除逐字复制（base-<domain>-store 纪律）。存储层只负责读 prior、写回结果。
 */

/** upsert 合并：有 prior 则 patch 覆盖（id/seasonId 不可改），无则按缺省骨架新建。 */
export function mergeBaseline(
  seasonId: string,
  patch: UpdateBaselineRequest,
  prior: SeasonBaseline | undefined,
): SeasonBaseline {
  return prior
    ? { ...prior, ...patch, id: prior.id, seasonId }
    : {
        id: `baseline-${seasonId}`,
        seasonId,
        anchors: patch.anchors ?? {},
        segments: patch.segments ?? [],
        phases: patch.phases ?? [],
        milestones: patch.milestones ?? [],
      };
}

/**
 * 过门更新某里程碑：未提供的可选字段维持原值（不覆空）——过门可能分两步补证据/留言，
 * 不该让后一步抹掉前一步。milestoneId 不存在返回 null。
 */
export function applyMilestonePass(
  baseline: SeasonBaseline,
  milestoneId: string,
  input: PassMilestoneRequest,
): SeasonBaseline | null {
  const idx = baseline.milestones.findIndex((m) => m.id === milestoneId);
  if (idx < 0) return null;
  const prior = baseline.milestones[idx];
  const updated: BaselineMilestone = {
    ...prior,
    status: input.status,
    ...(input.passedBy !== undefined ? { passedBy: input.passedBy } : {}),
    ...(input.evidenceRefs !== undefined ? { evidenceRefs: input.evidenceRefs } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
  };
  const milestones = [...baseline.milestones];
  milestones[idx] = updated;
  return { ...baseline, milestones };
}
