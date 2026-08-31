import { z } from 'zod';
import {
  derivePresenceSchedule,
  deriveRelayBoard,
  parseFleetCsv,
  wouldCreateCycle,
} from '@teamhub/hub-contracts';
import type {
  CreateResourceSessionRequest,
  CreateResourceSessionsBatchRequest,
  CreateResourcesBatchRequestSchema,
  CreateRelayHandoffRequest,
  FleetParseResult,
  RelayBoard,
  RelayHandoff,
  ResourceSession,
  ScheduleSnapshot,
  SharedResource,
  PresenceRecommendation,
} from '@teamhub/hub-contracts';
import type { Clock } from '../../clock.js';
import type {
  PmSnapshotReadPort,
  RelayHandoffDraft,
  ResourceDefaultPresetPatch,
  ResourceDraft,
  ResourceSessionDraft,
  ResourceSessionPatch,
  ResourceStatusPatch,
  ScheduleRepository,
} from './repository.js';

/** 业务校验失败（批量窗口字段冲突 / 接力交接线非法）——route 映射 400。 */
export class ScheduleValidationError extends Error {
  constructor(public readonly detail: string) {
    super(detail);
    this.name = 'ScheduleValidationError';
  }
}

/**
 * 排班域 application service（ARCH-UNIFY A4；前身 routes/schedule.ts 的路由内编排）。
 * 用例：在场建议 / 接力板纯派生（组装 ScheduleSnapshot → contracts 纯函数）、占用窗口批量原子录入
 * （存在性 + orderInWindow 冲突校验）、接力交接线（同窗 + 自环/成环校验）、车队 CSV 预览与批量建档。
 * 简单 CRUD（建车/改状态/改阵型/改窗口/删窗口/删交接线）直传 repository（编排为空、不加无谓间接层）。
 *
 * **I0 反监视**：派生输出主键 group/resource/task、永无 memberId；批量录入时 invitedMemberIds
 * 恒由 repository 强制清空（双保险）。
 */
export class ScheduleService {
  constructor(
    private readonly repository: ScheduleRepository,
    private readonly pmRead: PmSnapshotReadPort,
    private readonly clock: Clock,
  ) {}

  /** 组装 ScheduleSnapshot（GovernanceSnapshot + 资源/窗口/交接线三块独立读口）。 */
  private async buildSnapshot(): Promise<ScheduleSnapshot> {
    const [snapshot, resources, resourceSessions, relayHandoffs] = await Promise.all([
      this.pmRead.getSnapshot(),
      this.repository.listResources(),
      this.repository.listResourceSessions(),
      this.repository.listRelayHandoffs(),
    ]);
    return { ...snapshot, resources, resourceSessions, relayHandoffs };
  }

  /** GET /api/schedule：差异化在场建议（派生输出无 memberId 维度）。 */
  async getPresenceSchedule(windowLabel: string): Promise<{
    windowLabel: string;
    recommendations: PresenceRecommendation[];
  }> {
    const snapshot = await this.buildSnapshot();
    return {
      windowLabel,
      recommendations: derivePresenceSchedule(snapshot, this.clock.now().toISOString(), windowLabel),
    };
  }

  /** GET /api/relay：接力板（占用窗口 + 交接线 + 阶段派生）。 */
  async getRelayBoard(windowLabel: string): Promise<RelayBoard> {
    return deriveRelayBoard(await this.buildSnapshot(), windowLabel);
  }

  listResources(): Promise<SharedResource[]> {
    return this.repository.listResources();
  }

  listResourceSessions(): Promise<ResourceSession[]> {
    return this.repository.listResourceSessions();
  }

  createResource(draft: ResourceDraft): Promise<SharedResource> {
    return this.repository.createResource(draft);
  }

  updateResourceStatus(id: string, patch: ResourceStatusPatch): Promise<SharedResource | null> {
    return this.repository.updateResourceStatus(id, patch);
  }

  setResourceDefaultPreset(
    id: string,
    preset: ResourceDefaultPresetPatch,
  ): Promise<SharedResource | null> {
    return this.repository.setResourceDefaultPreset(id, preset);
  }

  createResourceSession(draft: ResourceSessionDraft): Promise<ResourceSession> {
    return this.repository.createResourceSession(draft);
  }

  updateResourceSession(id: string, patch: ResourceSessionPatch): Promise<ResourceSession | null> {
    return this.repository.updateResourceSession(id, patch);
  }

  deleteResourceSession(id: string): Promise<boolean> {
    return this.repository.deleteResourceSession(id);
  }

  deleteRelayHandoff(id: string): Promise<boolean> {
    return this.repository.deleteRelayHandoff(id);
  }

  /**
   * POST /api/resource-sessions/batch（D-082 §5 表格页【确认】）：全量校验（windowLabel 一致 +
   * resource/group/task 存在 + 同车同窗 orderInWindow 不冲突），任一不过整批不落（repository 原子）。
   * invitedMemberIds 恒清空（I0 双保险的第一道，repository 内还有第二道）。
   */
  async createResourceSessionsBatch(
    parsed: CreateResourceSessionsBatchRequest,
    confirmedBy: CreateResourceSessionRequest['confirmedBy'],
  ): Promise<ResourceSession[]> {
    const { windowLabel, sessions } = parsed;
    const [snapshot, resources, existingSessions] = await Promise.all([
      this.pmRead.getSnapshot(),
      this.repository.listResources(),
      this.repository.listResourceSessions(),
    ]);
    const resourceIds = new Set(resources.map((r) => r.id));
    const groupIds = new Set(snapshot.groups.map((g) => g.id));
    const taskIds = new Set(snapshot.tasks.map((t) => t.id));
    const orderKeys = new Set(
      existingSessions.map((s) => `${s.resourceId}|${s.windowLabel}|${s.orderInWindow}`),
    );
    for (const [index, draft] of sessions.entries()) {
      if (draft.windowLabel !== windowLabel) {
        throw new ScheduleValidationError(`sessions[${index}].windowLabel 须与请求 windowLabel 一致`);
      }
      if (!resourceIds.has(draft.resourceId)) {
        throw new ScheduleValidationError(`sessions[${index}]: 未知 resourceId ${draft.resourceId}`);
      }
      if (!groupIds.has(draft.holderGroupId)) {
        throw new ScheduleValidationError(`sessions[${index}]: 未知 holderGroupId ${draft.holderGroupId}`);
      }
      if (draft.holderTaskId !== null && !taskIds.has(draft.holderTaskId)) {
        throw new ScheduleValidationError(`sessions[${index}]: 未知 holderTaskId ${draft.holderTaskId}`);
      }
      const orderKey = `${draft.resourceId}|${draft.windowLabel}|${draft.orderInWindow}`;
      if (orderKeys.has(orderKey)) {
        throw new ScheduleValidationError(
          `sessions[${index}]: 该车该窗口 orderInWindow=${draft.orderInWindow} 已被占用`,
        );
      }
      orderKeys.add(orderKey);
    }
    const drafts: ResourceSessionDraft[] = sessions.map((draft) => ({
      projectId: draft.projectId,
      resourceId: draft.resourceId,
      windowLabel: draft.windowLabel,
      orderInWindow: draft.orderInWindow,
      holderGroupId: draft.holderGroupId,
      holderTaskId: draft.holderTaskId,
      invitedMemberIds: [],
      note: draft.note,
      eta: draft.eta,
      confirmedBy,
    }));
    return this.repository.createResourceSessionsBatch(drafts);
  }

  /**
   * POST /api/relay-handoffs（R1 画布拉线）：from/to session 存在 + 同窗 + 自环/成环校验
   * （contracts wouldCreateCycle 纯函数），通过才落库。
   */
  async createRelayHandoff(
    parsed: CreateRelayHandoffRequest,
    confirmedBy: RelayHandoffDraft['confirmedBy'] | undefined,
  ): Promise<RelayHandoff> {
    const { fromSessionId, toSessionId, windowLabel } = parsed;
    const sessionsById = new Map(
      (await this.repository.listResourceSessions()).map((s) => [s.id, s] as const),
    );
    const fromSession = sessionsById.get(fromSessionId);
    const toSession = sessionsById.get(toSessionId);
    if (!fromSession || !toSession) {
      throw new ScheduleValidationError('from/to session not found');
    }
    if (fromSession.windowLabel !== windowLabel || toSession.windowLabel !== windowLabel) {
      throw new ScheduleValidationError(
        'from/to sessions must belong to the same windowLabel as the handoff',
      );
    }
    const existingEdges = (await this.repository.listRelayHandoffs()).map((h) => ({
      fromTaskId: h.fromSessionId,
      toTaskId: h.toSessionId,
    }));
    if (wouldCreateCycle(existingEdges, fromSessionId, toSessionId)) {
      throw new ScheduleValidationError(
        fromSessionId === toSessionId ? 'self handoff not allowed' : 'relay handoff would create a cycle',
      );
    }
    return this.repository.createRelayHandoff(
      confirmedBy ? { ...parsed, confirmedBy } : parsed,
    );
  }

  /** POST /api/resources/preview：车队 CSV 纯解析（不落库）。 */
  previewFleetCsv(text: string): FleetParseResult {
    return parseFleetCsv(text);
  }

  /**
   * POST /api/resources/batch：逐台建档（非 available 初态再补一次状态迁移）。
   * 历史行为保留：逐台顺序落库、非整批事务（C3 小作坊，初始化向导低频路径）。
   */
  async createResourcesBatch(
    parsed: z.output<typeof CreateResourcesBatchRequestSchema>,
  ): Promise<SharedResource[]> {
    const created: SharedResource[] = [];
    for (const row of parsed.resources) {
      const resource = await this.repository.createResource({
        projectId: 'prj-robots',
        name: row.name,
        kind: row.kind,
        robotTarget: row.robotTarget,
        season: row.season,
        version: row.version,
      });
      if (row.status && row.status !== 'available') {
        const migrated = await this.repository.updateResourceStatus(resource.id, {
          status: row.status,
          statusReason: row.statusReason ?? null,
        });
        created.push(migrated ?? resource);
      } else {
        created.push(resource);
      }
    }
    return created;
  }
}
