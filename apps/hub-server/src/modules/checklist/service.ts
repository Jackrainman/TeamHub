import { listBlockingChecklistItems } from '@teamhub/hub-contracts';
import type {
  ActorRef,
  ChecklistTemplate,
  CreateChecklistItemRequest,
  GateChecklistItem,
} from '@teamhub/hub-contracts';
import { ZodError } from 'zod';
import type { Clock } from '../../clock.js';
import { ApplicationError } from '../../application/application-error.js';
import type {
  ChecklistRepository,
  GateChecklistPort,
} from './repository.js';

/** Checklist 只读取 baseline 引用投影，不取得完整 BaselineRepository。 */
export interface ChecklistBaselinePort {
  getBaseline(seasonId: string): Promise<{
    id: string;
    milestones: Array<{ id: string }>;
  } | null>;
}

/**
 * 豁免权属判定的窄 port（§8.2；前身 PmRepository.getSnapshot().members + isGateReviewer 全量依赖）。
 * 组合根用 pm 成员表适配注入；checklist 域不反向感知成员实体。
 */
export interface GateReviewerPort {
  isGateReviewer(memberId: string): Promise<boolean>;
}

export class ChecklistService implements GateChecklistPort {
  constructor(
    private readonly repository: ChecklistRepository,
    private readonly baselines: ChecklistBaselinePort,
    private readonly gateReviewers: GateReviewerPort,
    private readonly clock: Clock,
  ) {}

  async listItems(seasonId: string): Promise<GateChecklistItem[]> {
    const baseline = await this.baselines.getBaseline(seasonId);
    return baseline ? this.repository.listItems(baseline.id) : [];
  }

  async createItem(
    seasonId: string,
    input: CreateChecklistItemRequest,
  ): Promise<GateChecklistItem> {
    const baseline = await this.baselines.getBaseline(seasonId);
    if (!baseline) {
      throw new ApplicationError('not_found', 'CHECKLIST_BASELINE_NOT_FOUND', '该赛季无基准线，无法挂检查项 / 欠条');
    }
    if (
      input.anchorMilestoneId !== undefined &&
      !baseline.milestones.some((milestone) => milestone.id === input.anchorMilestoneId)
    ) {
      throw new ApplicationError(
        'validation',
        'CHECKLIST_MILESTONE_NOT_FOUND',
        `挂接的门 / 里程碑不存在：${input.anchorMilestoneId}`,
      );
    }
    try {
      return await this.repository.createItem({
        seasonBaselineId: baseline.id,
        title: input.title,
        anchorMilestoneId: input.anchorMilestoneId,
        anchorDueAt: input.anchorDueAt,
        origin: input.origin,
        note: input.note,
        createdAt: this.clock.now().toISOString(),
      });
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ApplicationError(
          'validation',
          'CHECKLIST_ITEM_INVALID',
          error.issues[0]?.message ?? 'invalid body',
        );
      }
      throw error;
    }
  }

  async clearItem(id: string, seasonId: string, actor: ActorRef): Promise<GateChecklistItem> {
    await this.requireItemInSeason(id, seasonId);
    const result = await this.repository.clearItem(id, actor);
    if (result) return result;
    throw new ApplicationError(
      'conflict',
      'CHECKLIST_ITEM_NOT_PENDING',
      '检查项已非 pending（已清偿 / 已豁免），无法清偿',
    );
  }

  async waiveItem(
    id: string,
    seasonId: string,
    actor: ActorRef,
    waiveReason: string,
  ): Promise<GateChecklistItem> {
    if (!(await this.gateReviewers.isGateReviewer(actor.id))) {
      throw new ApplicationError('forbidden', 'CHECKLIST_WAIVE_FORBIDDEN', '豁免权属验收人名单（大三）');
    }
    await this.requireItemInSeason(id, seasonId);
    const result = await this.repository.waiveItem(id, actor, waiveReason);
    if (result) return result;
    throw new ApplicationError(
      'conflict',
      'CHECKLIST_ITEM_NOT_PENDING',
      '检查项已非 pending（已清偿 / 已豁免），无法豁免',
    );
  }

  listTemplates(): Promise<ChecklistTemplate[]> {
    return this.repository.listTemplates();
  }

  async listBlockingItems(
    seasonBaselineId: string,
    milestoneId: string,
  ): Promise<GateChecklistItem[]> {
    return listBlockingChecklistItems(
      await this.repository.listItems(seasonBaselineId),
      milestoneId,
    );
  }

  private async requireItemInSeason(id: string, seasonId: string): Promise<void> {
    const baseline = await this.baselines.getBaseline(seasonId);
    const exists = baseline
      ? (await this.repository.listItems(baseline.id)).some((item) => item.id === id)
      : false;
    if (!exists) {
      throw new ApplicationError('not_found', 'CHECKLIST_ITEM_NOT_FOUND', '检查项不存在');
    }
  }
}
