import type { GovernanceSnapshot, InventorySnapshot, KbSnapshot, SeasonBaseline, GateChecklistItem, ChecklistTemplate } from '@teamhub/hub-contracts';
import {
  baselineScenarioFixture,
  checklistScenarioFixture,
  governanceScenarioFixture,
  inventoryScenarioFixture,
  kbScenarioFixture,
} from '@teamhub/hub-contracts';
import type { Clock } from '../clock.js';
import { SqliteDatabase } from './sqlite-db.js';
import { SqliteGovStore } from './sqlite-gov-store.js';
import { SqliteKbStore } from './sqlite-kb-store.js';
import { SqliteInvStore } from './sqlite-inv-store.js';
import { SqliteBaselineStore } from './sqlite-baseline-store.js';
import { SqliteChecklistStore } from './sqlite-checklist-store.js';
import { SqliteReimburseStore } from './sqlite-reimburse-store.js';
import type { GovStore } from './gov-store.js';
import type { BaselineStore } from './baseline-store.js';
import type { ChecklistStore } from './checklist-store.js';

export const TEAMHUB_UNIFIED_SCHEMA_VERSION = 1;

export interface UnifiedStores {
  gov: GovStore;
  kb: SqliteKbStore;
  inv: SqliteInvStore;
  baseline: BaselineStore;
  checklist: ChecklistStore;
  // REIMBURSE-PROC：报账域（reimburse_entries/reimburse_batches 两表，KV JSON 模式；空种子无演示 fixture）。
  reimburse: SqliteReimburseStore;
  db: SqliteDatabase;
  close(): void;
}

export interface UnifiedDbSeeds {
  gov: GovernanceSnapshot;
  kb: KbSnapshot;
  inv: InventorySnapshot;
  baseline: SeasonBaseline[];
  checklist: GateChecklistItem[];
  checklistTemplates: ChecklistTemplate[];
  demoSeed: boolean;
}

export function defaultSeeds(demoSeed: boolean): UnifiedDbSeeds {
  return {
    gov: demoSeed ? governanceScenarioFixture : {
      seasonId: governanceScenarioFixture.seasonId,
      seasons: governanceScenarioFixture.seasons,
      projectId: governanceScenarioFixture.projectId,
      stage: governanceScenarioFixture.stage,
      groups: [], members: [], tasks: [], dependencies: [],
      needs: [], knowledgeNodes: [], taskKnowledgeTags: [], artifacts: [],
    },
    kb: demoSeed ? kbScenarioFixture : {
      projectId: kbScenarioFixture.projectId,
      issueCards: [], errorEntries: [], archiveDocuments: [],
    },
    inv: demoSeed ? inventoryScenarioFixture : {
      projectId: inventoryScenarioFixture.projectId,
      partTypes: [], trackedParts: [], actions: [],
    },
    baseline: demoSeed ? baselineScenarioFixture : [],
    checklist: demoSeed ? checklistScenarioFixture : [],
    checklistTemplates: [],
    demoSeed,
  };
}

export function openUnifiedDb(
  filePath: string,
  opts: { seeds?: UnifiedDbSeeds; clock?: Clock } = {},
): UnifiedStores {
  const seeds = opts.seeds ?? defaultSeeds(true);
  const sdb = SqliteDatabase.open(filePath);

  const uv = sdb.readUserVersion();
  if (uv > TEAMHUB_UNIFIED_SCHEMA_VERSION) {
    sdb.close();
    throw new Error(
      `统一 SQLite 库 schema 版本 ${uv} 高于本代码支持的 ${TEAMHUB_UNIFIED_SCHEMA_VERSION}` +
        '（fail-closed：拒绝以旧代码读写更高版本数据）',
    );
  }

  sdb.ensureMetaTable();

  if (uv === 0) {
    sdb.setMeta('schema_kind', 'unified');
    sdb.setUserVersion(TEAMHUB_UNIFIED_SCHEMA_VERSION);
  } else {
    const kind = sdb.getMeta('schema_kind');
    if (kind !== 'unified') {
      sdb.close();
      throw new Error(
        '该库是旧版 gov-only SQLite（无 schema_kind=unified 标记）。' +
          '请跑 scripts/migrate-all-to-sqlite.mjs 迁移为统一库。',
      );
    }
  }

  const gov = SqliteGovStore.fromSharedDb(sdb, seeds.gov, opts.clock, seeds.demoSeed);
  const kb = SqliteKbStore.fromSharedDb(sdb, seeds.kb);
  const inv = SqliteInvStore.fromSharedDb(sdb, seeds.inv, opts.clock);
  const baseline = SqliteBaselineStore.fromSharedDb(sdb, seeds.baseline);
  const checklist = SqliteChecklistStore.fromSharedDb(sdb, seeds.checklist, seeds.checklistTemplates);
  const reimburse = SqliteReimburseStore.fromSharedDb(sdb, undefined, opts.clock);

  return {
    gov,
    kb,
    inv,
    baseline,
    checklist,
    reimburse,
    db: sdb,
    close: () => sdb.close(),
  };
}
