import {
  AppSettingsSchema,
  ROBOTICS_TENANT_CONFIG,
  baselineScenarioFixture,
  checklistScenarioFixture,
  governanceScenarioFixture,
  inventoryScenarioFixture,
  kbScenarioFixture,
} from '@teamhub/hub-contracts';
import type {
  AppSettings,
  ChecklistTemplate,
  ConfigIdentityMode,
  GateChecklistItem,
  GovernanceSnapshot,
  InventorySnapshot,
  KbSnapshot,
  SeasonBaseline,
  SetupInitRequest,
} from '@teamhub/hub-contracts';
import type { Clock } from '../clock.js';
import type { BaselineStore } from './baseline-store.js';
import type { ChecklistStore } from './checklist-store.js';
import type { GovStore } from './gov-store.js';
import { SqliteBaselineStore } from './sqlite-baseline-store.js';
import { SqliteChecklistStore } from './sqlite-checklist-store.js';
import { SqliteDatabase } from './sqlite-db.js';
import { SqliteGovRepository } from './sqlite-gov-repository.js';
import { SqliteInvStore } from './sqlite-inv-store.js';
import { SqliteKbStore } from './sqlite-kb-store.js';
import { SqliteReimburseRepository } from '../modules/reimburse/sqlite-repository.js';

export const TEAMHUB_UNIFIED_SCHEMA_VERSION = 2;

const APP_SETTINGS_TABLE = 'app_settings';
const APP_SETTINGS_ID = 'singleton';

/**
 * setup 的 unclaimed 探测与 graduate 清库共用同一份业务表白名单，避免新增域后只改一边。
 */
export const TEAMHUB_BUSINESS_TABLES = [
  'seasons',
  'groups',
  'members',
  'tasks',
  'dependencies',
  'needs',
  'knowledge_nodes',
  'task_knowledge_tags',
  'artifacts',
  'resources',
  'resource_sessions',
  'relay_handoffs',
  'kb_issue_cards',
  'kb_error_entries',
  'kb_archive_documents',
  'inv_part_types',
  'inv_tracked_parts',
  'inv_actions',
  'baselines',
  'checklist_items',
  'checklist_templates',
  'reimburse_entries',
  'reimburse_batches',
  'reimburse_profile',
] as const;

/** 业务域的初始化标记；graduate 会清掉，重启后由 real 空种子重建。 */
const TEAMHUB_BUSINESS_META_KEYS = [
  'seasonId',
  'projectId',
  'stage',
  'kb_projectId',
  'inv_projectId',
  'reimburse_seeded',
] as const;

export interface UnifiedStores {
  gov: GovStore;
  kb: SqliteKbStore;
  inv: SqliteInvStore;
  baseline: BaselineStore;
  checklist: ChecklistStore;
  reimburse: SqliteReimburseRepository;
  db: SqliteDatabase;
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

export type UnifiedDatabaseState = 'empty' | 'unclaimed' | 'initialized';

export interface AppSettingsRepository {
  get(): AppSettings | undefined;
  create(settings: AppSettings): void;
  replace(settings: AppSettings): void;
}

export interface AppSettingsService {
  getSettings(): AppSettings | undefined;
  getDatabaseState(): UnifiedDatabaseState;
  initialize(input: SetupInitRequest, now: Date): AppSettings;
  updateIdentityMode(identityMode: ConfigIdentityMode, now: Date): AppSettings;
  graduateToReal(now: Date): AppSettings;
}

class SqliteAppSettingsRepository implements AppSettingsRepository {
  constructor(private readonly db: SqliteDatabase) {}

  get(): AppSettings | undefined {
    const raw = this.db.getRow<unknown>(APP_SETTINGS_TABLE, APP_SETTINGS_ID);
    if (raw === undefined) return undefined;
    return AppSettingsSchema.parse(raw);
  }

  create(settings: AppSettings): void {
    const validated = AppSettingsSchema.parse(settings);
    if (this.get() !== undefined) {
      throw new Error('TeamHub 已初始化，app_settings 单例不可重复创建');
    }
    this.db.insertRow(APP_SETTINGS_TABLE, APP_SETTINGS_ID, validated);
  }

  replace(settings: AppSettings): void {
    const validated = AppSettingsSchema.parse(settings);
    if (this.db.updateRow(APP_SETTINGS_TABLE, APP_SETTINGS_ID, validated) !== 1) {
      throw new Error('app_settings 单例不存在，拒绝隐式创建');
    }
  }
}

export function defaultSeeds(demoSeed: boolean): UnifiedDbSeeds {
  return {
    gov: demoSeed
      ? governanceScenarioFixture
      : {
          seasonId: governanceScenarioFixture.seasonId,
          seasons: [],
          projectId: governanceScenarioFixture.projectId,
          stage: governanceScenarioFixture.stage,
          groups: [],
          members: [],
          tasks: [],
          dependencies: [],
          needs: [],
          knowledgeNodes: [],
          taskKnowledgeTags: [],
          artifacts: [],
        },
    kb: demoSeed
      ? kbScenarioFixture
      : {
          projectId: kbScenarioFixture.projectId,
          issueCards: [],
          errorEntries: [],
          archiveDocuments: [],
        },
    inv: demoSeed
      ? inventoryScenarioFixture
      : {
          projectId: inventoryScenarioFixture.projectId,
          partTypes: [],
          trackedParts: [],
          actions: [],
        },
    baseline: demoSeed ? baselineScenarioFixture : [],
    checklist: demoSeed ? checklistScenarioFixture : [],
    checklistTemplates: [],
    demoSeed,
  };
}

function assembleStores(
  db: SqliteDatabase,
  seeds: UnifiedDbSeeds,
  clock?: Clock,
): UnifiedStores {
  return {
    gov: SqliteGovRepository.fromSharedDb(db, seeds.gov, clock, seeds.demoSeed),
    kb: SqliteKbStore.fromSharedDb(db, seeds.kb),
    inv: SqliteInvStore.fromSharedDb(db, seeds.inv, clock),
    baseline: SqliteBaselineStore.fromSharedDb(db, seeds.baseline),
    checklist: SqliteChecklistStore.fromSharedDb(
      db,
      seeds.checklist,
      seeds.checklistTemplates,
    ),
    reimburse: SqliteReimburseRepository.fromSharedDb(db, undefined, clock),
    db,
  };
}

export class UnifiedDatabase implements AppSettingsService {
  readonly settings: AppSettingsRepository;

  constructor(readonly db: SqliteDatabase) {
    this.settings = new SqliteAppSettingsRepository(db);
  }

  getSettings(): AppSettings | undefined {
    return this.settings.get();
  }

  getDatabaseState(): UnifiedDatabaseState {
    if (this.settings.get() !== undefined) return 'initialized';
    return this.hasBusinessData() ? 'unclaimed' : 'empty';
  }

  initialize(input: SetupInitRequest, now: Date): AppSettings {
    const isoNow = now.toISOString();
    const settings = AppSettingsSchema.parse({
      schemaVersion: 1,
      projectId: governanceScenarioFixture.projectId,
      dataMode: input.dataMode,
      identityMode: input.identityMode,
      verticalId: 'robotics',
      enabledModules: [...ROBOTICS_TENANT_CONFIG.enabledModules],
      initializedAt: isoNow,
      updatedAt: isoNow,
    });

    this.db.tx(() => {
      if (this.settings.get() !== undefined) {
        throw new Error('TeamHub 已初始化');
      }
      if (this.hasBusinessData()) {
        throw new Error('数据库含未认领业务数据，拒绝初始化覆盖');
      }
      assembleStores(this.db, defaultSeeds(input.dataMode === 'demo'));
      this.settings.create(settings);
    });
    return settings;
  }

  openStores(clock?: Clock): UnifiedStores {
    const settings = this.settings.get();
    if (!settings) {
      throw new Error('app_settings 不存在，不能装配正常模式业务仓储');
    }
    return assembleStores(this.db, defaultSeeds(settings.dataMode === 'demo'), clock);
  }

  updateIdentityMode(identityMode: ConfigIdentityMode, now: Date): AppSettings {
    return this.db.tx(() => {
      const current = this.requireSettings();
      const next = AppSettingsSchema.parse({
        ...current,
        identityMode,
        updatedAt: now.toISOString(),
      });
      this.settings.replace(next);
      return next;
    });
  }

  graduateToReal(now: Date): AppSettings {
    return this.db.tx(() => {
      const current = this.requireSettings();
      if (current.dataMode !== 'demo') {
        throw new Error('当前已是正式（real）部署');
      }

      for (const table of TEAMHUB_BUSINESS_TABLES) {
        if (this.db.tableExists(table)) this.db.clearTable(table);
      }
      for (const key of TEAMHUB_BUSINESS_META_KEYS) this.db.deleteMeta(key);

      const next = AppSettingsSchema.parse({
        ...current,
        dataMode: 'real',
        updatedAt: now.toISOString(),
      });
      this.settings.replace(next);
      return next;
    });
  }

  close(): void {
    this.db.close();
  }

  private requireSettings(): AppSettings {
    const settings = this.settings.get();
    if (!settings) throw new Error('app_settings 不存在');
    return settings;
  }

  private hasBusinessData(): boolean {
    for (const table of TEAMHUB_BUSINESS_TABLES) {
      if (this.db.tableExists(table) && this.db.rowCount(table) > 0) return true;
    }
    return TEAMHUB_BUSINESS_META_KEYS.some((key) => this.db.getMeta(key) !== undefined);
  }
}

export function openUnifiedDb(filePath: string): UnifiedDatabase {
  const db = SqliteDatabase.open(filePath);
  try {
    const userVersion = db.readUserVersion();
    if (userVersion > TEAMHUB_UNIFIED_SCHEMA_VERSION) {
      throw new Error(
        `统一 SQLite 库 schema 版本 ${userVersion} 高于本代码支持的 ${TEAMHUB_UNIFIED_SCHEMA_VERSION}` +
          '（fail-closed：拒绝以旧代码读写更高版本数据）',
      );
    }

    db.ensureMetaTable();
    if (userVersion === 0) {
      db.tx(() => {
        db.setMeta('schema_kind', 'unified');
        db.ensureSingletonEntityTable(APP_SETTINGS_TABLE, APP_SETTINGS_ID);
        db.setUserVersion(TEAMHUB_UNIFIED_SCHEMA_VERSION);
      });
    } else if (userVersion === TEAMHUB_UNIFIED_SCHEMA_VERSION) {
      if (db.getMeta('schema_kind') !== 'unified') {
        throw new Error('SQLite 库缺少 schema_kind=unified 标记，拒绝按 TeamHub 统一库打开');
      }
      db.ensureSingletonEntityTable(APP_SETTINGS_TABLE, APP_SETTINGS_ID);
    } else {
      throw new Error(
        `SQLite 库 schema 版本 ${userVersion} 不受支持；本版本不迁移旧数据，请使用新的统一库文件`,
      );
    }

    return new UnifiedDatabase(db);
  } catch (error) {
    db.close();
    throw error;
  }
}
