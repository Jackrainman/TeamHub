import {
  validateBaselineSegments,
  type ActorRef,
  type PassMilestoneRequest,
  type SeasonBaseline,
  type UpdateBaselineRequest,
} from '@teamhub/hub-contracts';
import { ApplicationError } from '../../application/application-error.js';
import type { GateChecklistPort } from '../checklist/repository.js';
import type { BaselineRepository } from './repository.js';

/** Artifact 域只向 baseline 暴露引用存在性，不交出治理快照。 */
export interface BaselineArtifactPort {
  findMissingArtifactId(ids: readonly string[]): Promise<string | undefined>;
}

export class BaselineService {
  constructor(
    private readonly repository: BaselineRepository,
    private readonly gateChecklist: GateChecklistPort,
    private readonly artifacts: BaselineArtifactPort,
  ) {}

  getBaseline(seasonId: string): Promise<SeasonBaseline | null> {
    return this.repository.getBaseline(seasonId);
  }

  upsertBaseline(
    seasonId: string,
    patch: UpdateBaselineRequest,
  ): Promise<SeasonBaseline> {
    // TIMELINE-EDITOR 开放 segment 低频调整后，段边界（开始<结束）入库前在服务端兜底校验，
    // 与 console 保存按钮禁用吃同一个 contracts 纯函数。
    if (patch.segments) {
      const invalid = validateBaselineSegments(patch.segments);
      if (invalid) {
        throw new ApplicationError('validation', 'BASELINE_SEGMENT_RANGE_INVALID', invalid);
      }
    }
    return this.repository.upsertBaseline(seasonId, patch);
  }

  async passMilestone(
    seasonId: string,
    milestoneId: string,
    input: PassMilestoneRequest,
    actor: ActorRef | undefined,
  ): Promise<SeasonBaseline> {
    if (input.evidenceRefs && input.evidenceRefs.length > 0) {
      const orphan = await this.artifacts.findMissingArtifactId(input.evidenceRefs);
      if (orphan) {
        throw new ApplicationError(
          'validation',
          'BASELINE_ARTIFACT_NOT_FOUND',
          `证据引用的归档物不存在：${orphan}`,
        );
      }
    }

    if (input.status === 'passed') {
      const baseline = await this.repository.getBaseline(seasonId);
      if (baseline) {
        const blocking = await this.gateChecklist.listBlockingItems(
          baseline.id,
          milestoneId,
        );
        if (blocking.length > 0) {
          throw new ApplicationError(
            'validation',
            'BASELINE_CHECKLIST_BLOCKED',
            `检查项未清：${blocking.map((item) => item.title).join('、')}`,
          );
        }
      }
    }

    const baseline = await this.repository.passMilestone(
      seasonId,
      milestoneId,
      actor ? { ...input, passedBy: actor } : input,
    );
    if (!baseline) {
      throw new ApplicationError(
        'not_found',
        'BASELINE_OR_MILESTONE_NOT_FOUND',
        '基准线或里程碑不存在',
      );
    }
    return baseline;
  }
}
