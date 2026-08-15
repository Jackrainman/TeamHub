import { baselineScenarioFixture } from '@teamhub/hub-contracts';
import type {
  PassMilestoneRequest,
  SeasonBaseline,
  UpdateBaselineRequest,
} from '@teamhub/hub-contracts';
import type { SqliteDatabase } from '../../store/sqlite-db.js';
import { applyMilestonePass, mergeBaseline } from './repository.js';
import type { BaselineRepository } from './repository.js';

const BASELINE_TABLES = ['baselines'] as const;

export class SqliteBaselineRepository implements BaselineRepository {
  private constructor(private readonly sdb: SqliteDatabase) {}

  static fromSharedDb(
    sdb: SqliteDatabase,
    seed: SeasonBaseline[] = baselineScenarioFixture,
  ): SqliteBaselineRepository {
    sdb.ensureEntityTables(BASELINE_TABLES);
    if (sdb.allRows('baselines').length === 0 && seed.length > 0) {
      sdb.tx(() => sdb.bulkInsert('baselines', seed));
    }
    return new SqliteBaselineRepository(sdb);
  }

  async getBaseline(seasonId: string): Promise<SeasonBaseline | null> {
    return this.sdb
      .allRows<SeasonBaseline>('baselines')
      .find((baseline) => baseline.seasonId === seasonId) ?? null;
  }

  async upsertBaseline(
    seasonId: string,
    patch: UpdateBaselineRequest,
  ): Promise<SeasonBaseline> {
    return this.sdb.tx(() => {
      const prior = this.sdb
        .allRows<SeasonBaseline>('baselines')
        .find((baseline) => baseline.seasonId === seasonId);
      const merged = mergeBaseline(seasonId, patch, prior);
      if (prior) this.sdb.updateRow('baselines', prior.id, merged);
      else this.sdb.insertRow('baselines', merged.id, merged);
      return merged;
    });
  }

  async passMilestone(
    seasonId: string,
    milestoneId: string,
    input: PassMilestoneRequest,
  ): Promise<SeasonBaseline | null> {
    return this.sdb.tx(() => {
      const baseline = this.sdb
        .allRows<SeasonBaseline>('baselines')
        .find((candidate) => candidate.seasonId === seasonId);
      if (!baseline) return null;
      const next = applyMilestonePass(baseline, milestoneId, input);
      if (!next) return null;
      this.sdb.updateRow('baselines', baseline.id, next);
      return next;
    });
  }
}
