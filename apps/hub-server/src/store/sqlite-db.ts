import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync: DatabaseSyncCtor } =
  nodeRequire('node:sqlite') as typeof import('node:sqlite');

type MetaRow = { value: string };
type DataRow = { data: string };
type IdRow = { id: string };
type UserVersionRow = { user_version: number | bigint };

export class SqliteDatabase {
  private readonly db: DatabaseSync;

  private constructor(db: DatabaseSync) {
    this.db = db;
  }

  static open(filePath: string): SqliteDatabase {
    return new SqliteDatabase(new DatabaseSyncCtor(filePath));
  }

  allRows<T>(table: string): T[] {
    const rows = this.db
      .prepare(`SELECT data FROM "${table}" ORDER BY rowid`)
      .all() as DataRow[];
    return rows.map((r) => JSON.parse(r.data) as T);
  }

  getRow<T>(table: string, id: string): T | undefined {
    const row = this.db
      .prepare(`SELECT data FROM "${table}" WHERE id = ?`)
      .get(id) as DataRow | undefined;
    return row ? (JSON.parse(row.data) as T) : undefined;
  }

  insertRow(table: string, id: string, value: unknown): void {
    this.db
      .prepare(`INSERT INTO "${table}" (id, data) VALUES (?, ?)`)
      .run(id, JSON.stringify(value));
  }

  updateRow(table: string, id: string, value: unknown): number {
    return Number(
      this.db
        .prepare(`UPDATE "${table}" SET data = ? WHERE id = ?`)
        .run(JSON.stringify(value), id).changes,
    );
  }

  deleteRow(table: string, id: string): number {
    return Number(this.db.prepare(`DELETE FROM "${table}" WHERE id = ?`).run(id).changes);
  }

  getMeta(key: string): string | undefined {
    const row = this.db
      .prepare('SELECT value FROM meta WHERE key = ?')
      .get(key) as MetaRow | undefined;
    return row?.value;
  }

  setMeta(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value);
  }

  tx<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  maxSuffix(table: string, prefix: string): number {
    const rows = this.db.prepare(`SELECT id FROM "${table}"`).all() as IdRow[];
    const re = new RegExp(`^${prefix}-(\\d+)$`);
    let max = 0;
    for (const { id } of rows) {
      const m = re.exec(id);
      if (m) {
        const n = Number(m[1]);
        if (n > max) max = n;
      }
    }
    return max;
  }

  readUserVersion(): number {
    const row = this.db.prepare('PRAGMA user_version').get() as UserVersionRow;
    return Number(row.user_version);
  }

  setUserVersion(version: number): void {
    this.db.exec(`PRAGMA user_version = ${version}`);
  }

  ensureMetaTable(): void {
    this.db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  }

  ensureEntityTables(tables: readonly string[]): void {
    for (const table of tables) {
      this.db.exec(`CREATE TABLE IF NOT EXISTS "${table}" (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
    }
  }

  bulkInsert(table: string, items: ReadonlyArray<{ id: string }>): void {
    const stmt = this.db.prepare(`INSERT INTO "${table}" (id, data) VALUES (?, ?)`);
    for (const item of items) stmt.run(item.id, JSON.stringify(item));
  }

  close(): void {
    this.db.close();
  }
}
