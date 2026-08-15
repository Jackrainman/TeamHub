import type {
  BaselineMilestone,
  PassMilestoneRequest,
  SeasonBaseline,
  UpdateBaselineRequest,
} from '@teamhub/hub-contracts';

export interface BaselineRepository {
  getBaseline(seasonId: string): Promise<SeasonBaseline | null>;
  upsertBaseline(seasonId: string, patch: UpdateBaselineRequest): Promise<SeasonBaseline>;
  passMilestone(
    seasonId: string,
    milestoneId: string,
    input: PassMilestoneRequest,
  ): Promise<SeasonBaseline | null>;
}

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

export function applyMilestonePass(
  baseline: SeasonBaseline,
  milestoneId: string,
  input: PassMilestoneRequest,
): SeasonBaseline | null {
  const index = baseline.milestones.findIndex((milestone) => milestone.id === milestoneId);
  if (index < 0) return null;
  const prior = baseline.milestones[index];
  const updated: BaselineMilestone = {
    ...prior,
    status: input.status,
    ...(input.passedBy !== undefined ? { passedBy: input.passedBy } : {}),
    ...(input.evidenceRefs !== undefined ? { evidenceRefs: input.evidenceRefs } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
  };
  const milestones = [...baseline.milestones];
  milestones[index] = updated;
  return { ...baseline, milestones };
}
