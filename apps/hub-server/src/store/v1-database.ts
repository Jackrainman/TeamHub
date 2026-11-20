import { AppSettingsSchema, type AppSettings, type SetupInitRequest } from '@teamhub/hub-contracts';
import { SqliteDatabase } from './sqlite-db.js';

export const V1_SCHEMA_VERSION = 1;
const ENTITY_TABLES = [
  'app_settings', 'groups', 'members', 'tasks', 'reimburse_entries', 'reimburse_batches',
  'reimburse_payouts', 'reimburse_evidence_downloads', 'reimburse_import_jobs',
] as const;
const BUSINESS_TABLES = ENTITY_TABLES.filter((table) => table !== 'app_settings');

export class V1Database {
  private constructor(readonly db: SqliteDatabase) {}

  static open(filePath: string): V1Database {
    const db = SqliteDatabase.open(filePath);
    const version = db.readUserVersion();
    if (version !== 0 && version !== V1_SCHEMA_VERSION) {
      const actual = version;
      db.close();
      throw new Error(`unsupported database schema ${actual}; expected v1, use scripts/migrate-legacy-to-v1.mjs`);
    }
    if (version === 0) {
      try {
        db.tx(() => {
          db.ensureMetaTable();
          db.ensureEntityTables(ENTITY_TABLES);
          db.ensureSingletonEntityTable('reimburse_profile', 'singleton');
          db.ensureSessionTable();
          db.setMeta('schema_kind', 'unified');
          db.setUserVersion(V1_SCHEMA_VERSION);
        });
      } catch (error) {
        db.close();
        throw error;
      }
    } else {
      db.ensureMetaTable();
      db.ensureEntityTables(ENTITY_TABLES);
      db.ensureSingletonEntityTable('reimburse_profile', 'singleton');
      db.ensureSessionTable();
      if (db.getMeta('schema_kind') === undefined) db.setMeta('schema_kind', 'unified');
    }
    return new V1Database(db);
  }

  getSettings(): AppSettings | null {
    const row = this.db.getRow<unknown>('app_settings', 'singleton');
    return row ? AppSettingsSchema.parse(row) : null;
  }

  getDatabaseState(): 'empty' | 'unclaimed' | 'initialized' {
    if (this.getSettings()) return 'initialized';
    return BUSINESS_TABLES.some((table) => this.db.rowCount(table) > 0) ? 'unclaimed' : 'empty';
  }

  initialize(input: SetupInitRequest, now: Date): AppSettings {
    if (this.getDatabaseState() !== 'empty') throw new Error('database is not empty');
    const settings: AppSettings = {
      schemaVersion: 1, dataMode: input.dataMode, identityMode: input.identityMode,
      initializedAt: now.toISOString(), updatedAt: now.toISOString(),
    };
    this.db.tx(() => this.db.insertRow('app_settings', 'singleton', settings));
    return settings;
  }

  updateIdentityMode(identityMode: AppSettings['identityMode'], now: Date): AppSettings {
    const current = this.getSettings();
    if (!current) throw new Error('settings missing');
    const next = { ...current, identityMode, updatedAt: now.toISOString() };
    this.db.tx(() => this.db.updateRow('app_settings', 'singleton', next));
    return next;
  }

  graduateToReal(now: Date): AppSettings {
    const current = this.getSettings();
    if (!current || current.dataMode !== 'demo') throw new Error('not a demo database');
    const next = { ...current, dataMode: 'real' as const, updatedAt: now.toISOString() };
    this.db.tx(() => {
      for (const table of BUSINESS_TABLES) this.db.clearTable(table);
      this.db.clearTable('sessions');
      this.db.updateRow('app_settings', 'singleton', next);
    });
    return next;
  }

  close(): void { this.db.close(); }
}

export function openV1Database(filePath: string): V1Database {
  return V1Database.open(filePath);
}
