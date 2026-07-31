import type {
  PassMilestoneRequest,
  SeasonBaseline,
  UpdateBaselineRequest,
} from '@teamhub/hub-contracts';
import { baselineScenarioFixture } from '@teamhub/hub-contracts';
import type { SqliteDatabase } from './sqlite-db.js';
import { applyMilestonePass, mergeBaseline } from './base-baseline-logic.js';
import type { BaselineStore } from './baseline-store.js';

const BASELINE_TABLES = ['baselines'] as const;

export class SqliteBaselineStore implements BaselineStore {
  private readonly sdb: SqliteDatabase;

  private constructor(sdb: SqliteDatabase) {
    this.sdb = sdb;
  }

  static fromSharedDb(
    sdb: SqliteDatabase,
    seed: SeasonBaseline[] = baselineScenarioFixture,
  ): SqliteBaselineStore {
    sdb.ensureEntityTables(BASELINE_TABLES);
    if (sdb.allRows('baselines').length === 0 && seed.length > 0) {
      sdb.tx(() => sdb.bulkInsert('baselines', seed));
    }
    return new SqliteBaselineStore(sdb);
  }

  async getBaseline(seasonId: string): Promise<SeasonBaseline | null> {
    const all = this.sdb.allRows<SeasonBaseline>('baselines');
    return all.find((b) => b.seasonId === seasonId) ?? null;
  }

  async upsertBaseline(
    seasonId: string,
    patch: UpdateBaselineRequest,
  ): Promise<SeasonBaseline> {
    return this.sdb.tx(() => {
      const all = this.sdb.allRows<SeasonBaseline>('baselines');
      const prior = all.find((b) => b.seasonId === seasonId);
      const merged = mergeBaseline(seasonId, patch, prior);
      if (prior) {
        this.sdb.updateRow('baselines', prior.id, merged);
      } else {
        this.sdb.insertRow('baselines', merged.id, merged);
      }
      return merged;
    });
  }

  async passMilestone(
    seasonId: string,
    milestoneId: string,
    input: PassMilestoneRequest,
  ): Promise<SeasonBaseline | null> {
    return this.sdb.tx(() => {
      const all = this.sdb.allRows<SeasonBaseline>('baselines');
      const baseline = all.find((b) => b.seasonId === seasonId);
      if (!baseline) return null;
      const next = applyMilestonePass(baseline, milestoneId, input);
      if (!next) return null;
      this.sdb.updateRow('baselines', baseline.id, next);
      return next;
    });
  }
}
