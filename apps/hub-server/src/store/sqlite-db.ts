import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync: DatabaseSyncCtor } =
  nodeRequire('node:sqlite') as typeof import('node:sqlite');

type MetaRow = { value: string };
type DataRow = { data: string };
type IdRow = { id: string };
type UserVersionRow = { user_version: number | bigint };
type CountRow = { count: number | bigint };
type TableExistsRow = { name: string };

export class SqliteDatabase {
  private readonly db: DatabaseSync;
  private transactionDepth = 0;
  private savepointSequence = 0;

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

  deleteMeta(key: string): number {
    return Number(this.db.prepare('DELETE FROM meta WHERE key = ?').run(key).changes);
  }

  tx<T>(fn: () => T): T {
    const outermost = this.transactionDepth === 0;
    const savepoint = `teamhub_tx_${++this.savepointSequence}`;
    this.db.exec(outermost ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`);
    this.transactionDepth += 1;
    try {
      const result = fn();
      if (
        result !== null &&
        (typeof result === 'object' || typeof result === 'function') &&
        typeof (result as { then?: unknown }).then === 'function'
      ) {
        throw new TypeError('SqliteDatabase.tx 回调必须同步，不能返回 Promise');
      }
      this.db.exec(outermost ? 'COMMIT' : `RELEASE SAVEPOINT ${savepoint}`);
      return result;
    } catch (err) {
      if (outermost) {
        this.db.exec('ROLLBACK');
      } else {
        this.db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        this.db.exec(`RELEASE SAVEPOINT ${savepoint}`);
      }
      throw err;
    } finally {
      this.transactionDepth -= 1;
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

  ensureSingletonEntityTable(table: string, singletonId: string): void {
    const escapedId = singletonId.replaceAll("'", "''");
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS "${table}" (` +
        `id TEXT PRIMARY KEY CHECK (id = '${escapedId}'), data TEXT NOT NULL)`,
    );
  }

  tableExists(table: string): boolean {
    const row = this.db
      .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = ?")
      .get(table) as TableExistsRow | undefined;
    return row !== undefined;
  }

  rowCount(table: string): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get() as CountRow;
    return Number(row.count);
  }

  clearTable(table: string): void {
    this.db.exec(`DELETE FROM "${table}"`);
  }

  bulkInsert(table: string, items: ReadonlyArray<{ id: string }>): void {
    const stmt = this.db.prepare(`INSERT INTO "${table}" (id, data) VALUES (?, ?)`);
    for (const item of items) stmt.run(item.id, JSON.stringify(item));
  }

  close(): void {
    this.db.close();
  }
}
