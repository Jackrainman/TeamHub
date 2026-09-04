import type {
  RelayHandoff,
  ResourceSession,
  SharedResource,
} from '@teamhub/hub-contracts';
import { scheduleScenarioFixture } from '@teamhub/hub-contracts';
import type { Clock } from '../../clock.js';
import { FixedClock } from '../../clock.js';
import { GOVERNANCE_SCENARIO_NOW } from '@teamhub/hub-contracts';
import type { SqliteDatabase } from '../../store/sqlite-db.js';
import { createIdSequence, nextSequentialId, type IdSequence } from '../../store/id-sequence.js';
import {
  applyResourceDefaultPreset,
  applyResourceSessionPatch,
  applyResourceStatus,
  buildCreatedRelayHandoff,
  buildCreatedResource,
  buildCreatedResourceSession,
  buildCreatedResourceSessionsBatch,
} from './logic.js';
import type {
  RelayHandoffDraft,
  ResourceDefaultPresetPatch,
  ResourceDraft,
  ResourceSessionDraft,
  ResourceSessionPatch,
  ResourceStatusPatch,
  ScheduleRepository,
} from './repository.js';

/** schedule 域实体表（每表 `(id TEXT PRIMARY KEY, data TEXT)`，整实体 JSON 落 data 列，与 SqliteGovRepository 同式）。 */
export const SCHEDULE_ENTITY_TABLES = ['resources', 'resource_sessions', 'relay_handoffs'] as const;

/**
 * schedule 域 SQLite 实现（ARCH-UNIFY A4 自 store/sqlite-gov-repository.ts 摘出）：共享物理资源车 +
 * 占用窗口 + 接力交接线。方法体逐字搬迁、零行为变化；id 序列打开时从各表 `<prefix>-N` 最大后缀重建。
 */
export class SqliteScheduleRepository implements ScheduleRepository {
  private resourceSeq!: IdSequence;
  private resourceSessionSeq!: IdSequence;
  private relayHandoffSeq!: IdSequence;

  private constructor(
    private readonly sdb: SqliteDatabase,
    private readonly clock: Clock,
  ) {
    this.resourceSeq = createIdSequence(sdb.maxSuffix('resources', 'res-new'));
    this.resourceSessionSeq = createIdSequence(sdb.maxSuffix('resource_sessions', 'sess-new'));
    this.relayHandoffSeq = createIdSequence(sdb.maxSuffix('relay_handoffs', 'handoff-new'));
  }

  /**
   * demoSeed=true 且 resources 表空 → 铺演示锚点（车 + 今晚占用窗口）。resources 只增不物删
   * （退役=状态迁移），故「表空」只在全新库出现，不会往真实库回灌演示数据。
   */
  static fromSharedDb(
    sdb: SqliteDatabase,
    clock?: Clock,
    demoSeed = true,
  ): SqliteScheduleRepository {
    sdb.ensureEntityTables(SCHEDULE_ENTITY_TABLES);
    if (demoSeed && sdb.allRows('resources').length === 0) {
      sdb.tx(() => {
        sdb.bulkInsert('resources', scheduleScenarioFixture.resources);
        sdb.bulkInsert('resource_sessions', scheduleScenarioFixture.resourceSessions);
        sdb.bulkInsert('relay_handoffs', scheduleScenarioFixture.relayHandoffs);
      });
    }
    return new SqliteScheduleRepository(sdb, clock ?? new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW)));
  }



  async listResources(): Promise<SharedResource[]> {
    return this.sdb.allRows<SharedResource>('resources');
  }

  async createResource(draft: ResourceDraft): Promise<SharedResource> {
    const now = this.clock.now().toISOString();
    const resource = buildCreatedResource(
      draft,
      nextSequentialId('res-new', this.resourceSeq),
      now,
    );
    this.sdb.tx(() => this.sdb.insertRow('resources', resource.id, resource));
    return resource;
  }

  async updateResourceStatus(
    id: string,
    patch: ResourceStatusPatch,
  ): Promise<SharedResource | null> {
    return this.sdb.tx(() => {
      const prev = this.sdb.getRow<SharedResource>('resources', id);
      if (!prev) return null;
      const updated = applyResourceStatus(prev, patch, this.clock.now().toISOString());
      this.sdb.updateRow('resources', id, updated);
      return updated;
    });
  }

  async setResourceDefaultPreset(
    id: string,
    preset: ResourceDefaultPresetPatch,
  ): Promise<SharedResource | null> {
    return this.sdb.tx(() => {
      const prev = this.sdb.getRow<SharedResource>('resources', id);
      if (!prev) return null;
      const updated = applyResourceDefaultPreset(prev, preset, this.clock.now().toISOString());
      this.sdb.updateRow('resources', id, updated);
      return updated;
    });
  }

  async listResourceSessions(): Promise<ResourceSession[]> {
    return this.sdb.allRows<ResourceSession>('resource_sessions');
  }

  async createResourceSession(
    draft: ResourceSessionDraft,
  ): Promise<ResourceSession> {
    const now = this.clock.now().toISOString();
    const session = buildCreatedResourceSession(
      draft,
      nextSequentialId('sess-new', this.resourceSessionSeq),
      now,
    );
    this.sdb.tx(() => this.sdb.insertRow('resource_sessions', session.id, session));
    return session;
  }

  async createResourceSessionsBatch(
    drafts: ResourceSessionDraft[],
  ): Promise<ResourceSession[]> {
    const now = this.clock.now().toISOString();
    return this.sdb.tx(() => {
      const sessions = buildCreatedResourceSessionsBatch(
        drafts,
        () => nextSequentialId('sess-new', this.resourceSessionSeq),
        now,
      );
      for (const session of sessions) {
        this.sdb.insertRow('resource_sessions', session.id, session);
      }
      return sessions;
    });
  }

  async updateResourceSession(
    id: string,
    patch: ResourceSessionPatch,
  ): Promise<ResourceSession | null> {
    return this.sdb.tx(() => {
      const prev = this.sdb.getRow<ResourceSession>('resource_sessions', id);
      if (!prev) return null;
      const updated = applyResourceSessionPatch(prev, patch);
      this.sdb.updateRow('resource_sessions', id, updated);
      return updated;
    });
  }

  async deleteResourceSession(id: string): Promise<boolean> {
    return this.sdb.tx(() => {
      if (this.sdb.deleteRow('resource_sessions', id) === 0) return false;
      // 级联删除引用该 session 的接力交接线（fromSessionId/toSessionId 命中，避免悬空箭头）——
      // 与本 session 删除同一事务原子落盘（避免「session 没了但 handoff 悬空」的中间态）。
      const handoffs = this.sdb.allRows<RelayHandoff>('relay_handoffs');
      for (const h of handoffs) {
        if (h.fromSessionId === id || h.toSessionId === id) {
          this.sdb.deleteRow('relay_handoffs', h.id);
        }
      }
      return true;
    });
  }

  async listRelayHandoffs(): Promise<RelayHandoff[]> {
    return this.sdb.allRows<RelayHandoff>('relay_handoffs');
  }

  async createRelayHandoff(draft: RelayHandoffDraft): Promise<RelayHandoff> {
    const now = this.clock.now().toISOString();
    const handoff = buildCreatedRelayHandoff(
      draft,
      nextSequentialId('handoff-new', this.relayHandoffSeq),
      now,
    );
    this.sdb.tx(() => this.sdb.insertRow('relay_handoffs', handoff.id, handoff));
    return handoff;
  }

  async deleteRelayHandoff(id: string): Promise<boolean> {
    return this.sdb.tx(() => this.sdb.deleteRow('relay_handoffs', id) > 0);
  }}
