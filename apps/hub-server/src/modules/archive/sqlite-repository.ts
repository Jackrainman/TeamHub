import type { ArtifactRef } from '@teamhub/hub-contracts';

import type { Clock } from '../../clock.js';
import { FixedClock } from '../../clock.js';
import { GOVERNANCE_SCENARIO_NOW } from '@teamhub/hub-contracts';
import { createIdSequence, nextSequentialId } from '../../store/id-sequence.js';
import type { IdSequence } from '../../store/id-sequence.js';
import type { SqliteDatabase } from '../../store/sqlite-db.js';
import {
  buildCreatedArtifact,
  type ArtifactDraft,
  type ArtifactRepository,
} from './repository.js';

const ARCHIVE_TABLES = ['artifacts'] as const;

/**
 * 归档物域 SQLite repository（ARCH-UNIFY A4；自 store/sqlite-gov-repository.ts 摘出 artifacts 表）。
 * 与其余域共用同一 `SqliteDatabase`（统一 SQLite 单库，表名按模块隔离）；种子策略=表空才种
 * （既有生产库的 artifacts 行原样保留，不重建、不清空）。
 */
export class SqliteArtifactRepository implements ArtifactRepository {
  private readonly sdb: SqliteDatabase;
  private readonly clock: Clock;
  private artifactSeq!: IdSequence;

  private constructor(sdb: SqliteDatabase, clock?: Clock) {
    this.sdb = sdb;
    this.clock = clock ?? new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW));
    this.artifactSeq = createIdSequence(this.sdb.maxSuffix('artifacts', 'artifact-new'));
  }

  static fromSharedDb(
    sdb: SqliteDatabase,
    seed: readonly ArtifactRef[] = [],
    clock?: Clock,
  ): SqliteArtifactRepository {
    sdb.ensureEntityTables(ARCHIVE_TABLES);
    // 表空才种：既有库（含生产）artifacts 非空 → 跳过，行原样保留。
    if (sdb.allRows('artifacts').length === 0 && seed.length > 0) {
      sdb.tx(() => sdb.bulkInsert('artifacts', seed));
    }
    return new SqliteArtifactRepository(sdb, clock);
  }

  async listArtifacts(): Promise<ArtifactRef[]> {
    return this.sdb.allRows<ArtifactRef>('artifacts');
  }

  async appendArtifact(draft: ArtifactDraft): Promise<ArtifactRef> {
    const now = this.clock.now().toISOString();
    const artifact = buildCreatedArtifact(
      draft,
      nextSequentialId('artifact-new', this.artifactSeq),
      now,
    );
    this.sdb.tx(() => this.sdb.insertRow('artifacts', artifact.id, artifact));
    return artifact;
  }

  async setArtifactFile(
    id: string,
    file: NonNullable<ArtifactRef['storedFile']>,
  ): Promise<ArtifactRef | null> {
    return this.sdb.tx(() => {
      const prev = this.sdb.getRow<ArtifactRef>('artifacts', id);
      if (!prev) return null;
      const updated: ArtifactRef = { ...prev, storedFile: file };
      this.sdb.updateRow('artifacts', id, updated);
      return updated;
    });
  }
}
