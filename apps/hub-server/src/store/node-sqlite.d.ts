// 最小化 `node:sqlite` 环境声明（SS3 SQLite）。
//
// **为何需要**：运行时是 node24（`node:sqlite` 内置、稳定可用），但本包 `@types/node` 仍是 v20
// （早于 node:sqlite 的类型声明加入 DefinitelyTyped）。为遵守「不引新依赖 / 不擅自 bump @types/node
// 免得类型面涟漪」的纪律，这里只声明 `SqliteGovRepository` 真正用到的极小子集，而非升级整包类型。
// 加字段用到新 API 时按需补声明；若将来 @types/node 升到含官方 node:sqlite 声明，删本文件即可。
declare module 'node:sqlite' {
  type SqliteParam = string | number | bigint | boolean | null | Uint8Array;

  interface StatementRunResult {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  class StatementSync {
    run(...params: SqliteParam[]): StatementRunResult;
    get(...params: SqliteParam[]): unknown;
    all(...params: SqliteParam[]): unknown[];
  }

  class DatabaseSync {
    constructor(location: string, options?: { readOnly?: boolean; open?: boolean });
    prepare(sql: string): StatementSync;
    exec(sql: string): void;
    close(): void;
  }
}
