import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ALL_MODULE_IDS } from '@teamhub/hub-contracts';
import { SqliteDatabase } from '../src/store/sqlite-db.js';
import {
  TEAMHUB_BUSINESS_TABLES,
  TEAMHUB_UNIFIED_SCHEMA_VERSION,
  openUnifiedDb,
} from '../src/store/sqlite-unified.js';

const NOW = new Date('2026-08-15T01:02:03.000Z');

describe('统一 SQLite + app_settings', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'teamhub-unified-'));
    dbPath = join(dir, 'teamhub.sqlite');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('首次打开只建数据库壳，业务表和 settings 都不抢跑', () => {
    const database = openUnifiedDb(dbPath);
    try {
      expect(database.getDatabaseState()).toBe('empty');
      expect(database.getSettings()).toBeUndefined();
      expect(database.db.readUserVersion()).toBe(TEAMHUB_UNIFIED_SCHEMA_VERSION);
      expect(database.db.getMeta('schema_kind')).toBe('unified');
      expect(TEAMHUB_BUSINESS_TABLES.every((table) => !database.db.tableExists(table))).toBe(true);
    } finally {
      database.close();
    }
  });

  it('初始化把六域 demo seed 与 app_settings 单例放在同一提交中', async () => {
    const database = openUnifiedDb(dbPath);
    try {
      const settings = database.initialize(
        { dataMode: 'demo', identityMode: 'identity' },
        NOW,
      );
      expect(settings).toEqual({
        schemaVersion: 1,
        projectId: 'prj-robots',
        dataMode: 'demo',
        identityMode: 'identity',
        verticalId: 'robotics',
        enabledModules: [...ALL_MODULE_IDS],
        initializedAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      });
      expect(database.getDatabaseState()).toBe('initialized');

      const stores = database.openStores();
      expect((await stores.gov.getSnapshot()).tasks.length).toBeGreaterThan(0);
      expect((await stores.kb.getKbSnapshot()).issueCards.length).toBeGreaterThan(0);
      expect((await stores.inv.getInventorySnapshot()).partTypes.length).toBeGreaterThan(0);
      expect(await stores.baseline.getBaseline('season-robocon-2026')).not.toBeNull();
      expect((await stores.checklist.listItems('baseline-season-robocon-2026')).length).toBeGreaterThan(0);
      expect(await stores.reimburse.listEntries()).toEqual([]);
      expect(stores.reimburse.getProfile().expectedPurchaserName).toBe('哈尔滨工业大学');
    } finally {
      database.close();
    }
  });

  it('real 初始化得到空业务板，重开后 settings 与写入均存活', async () => {
    const database = openUnifiedDb(dbPath);
    database.initialize({ dataMode: 'real', identityMode: 'anonymous' }, NOW);
    const stores = database.openStores();
    expect((await stores.gov.getSnapshot()).tasks).toEqual([]);
    const created = await stores.gov.createTask({
      projectId: 'p',
      title: 'persist',
      rawSummary: 'persist',
      groupId: 'grp-ec',
      ownerId: null,
      collaboratorIds: [],
      intrinsicComplexity: 'normal',
    });
    database.close();

    const reopened = openUnifiedDb(dbPath);
    try {
      expect(reopened.getSettings()?.dataMode).toBe('real');
      expect((await reopened.openStores().gov.getSnapshot()).tasks.some((task) => task.id === created.id)).toBe(true);
    } finally {
      reopened.close();
    }
  });

  it('有业务数据但无 settings 时标成 unclaimed，并拒绝初始化覆盖', () => {
    const database = openUnifiedDb(dbPath);
    try {
      database.db.ensureEntityTables(['tasks']);
      database.db.insertRow('tasks', 'legacy-task', { id: 'legacy-task' });
      expect(database.getDatabaseState()).toBe('unclaimed');
      expect(() =>
        database.initialize({ dataMode: 'real', identityMode: 'anonymous' }, NOW),
      ).toThrow(/未认领/);
      expect(database.db.getRow('tasks', 'legacy-task')).toEqual({ id: 'legacy-task' });
    } finally {
      database.close();
    }
  });

  it('graduate 同事务清业务表并更新 real，保留 write_token/lark_config', async () => {
    const database = openUnifiedDb(dbPath);
    try {
      database.initialize({ dataMode: 'demo', identityMode: 'anonymous' }, NOW);
      database.db.setMeta('write_token', 'keep-token');
      database.db.setMeta('lark_config', '{"status":"unconfigured"}');
      expect((await database.openStores().gov.getSnapshot()).tasks.length).toBeGreaterThan(0);

      const next = database.graduateToReal(new Date('2026-08-15T02:00:00.000Z'));
      expect(next.dataMode).toBe('real');
      expect(database.db.getMeta('write_token')).toBe('keep-token');
      expect(database.db.getMeta('lark_config')).toBe('{"status":"unconfigured"}');
      for (const table of TEAMHUB_BUSINESS_TABLES) {
        expect(database.db.rowCount(table), table).toBe(0);
      }
    } finally {
      database.close();
    }
  });

  it('fail-closed：更高 user_version 与 v1 旧库均拒绝打开，不做静默迁移', () => {
    const tooNew = SqliteDatabase.open(dbPath);
    tooNew.ensureMetaTable();
    tooNew.setMeta('schema_kind', 'unified');
    tooNew.setUserVersion(TEAMHUB_UNIFIED_SCHEMA_VERSION + 1);
    tooNew.close();
    expect(() => openUnifiedDb(dbPath)).toThrow(/高于本代码支持/);

    const oldPath = join(dir, 'old-v1.sqlite');
    const old = SqliteDatabase.open(oldPath);
    old.ensureMetaTable();
    old.setMeta('schema_kind', 'unified');
    old.setUserVersion(1);
    old.close();
    expect(() => openUnifiedDb(oldPath)).toThrow(/不受支持/);
  });
});

describe('SqliteDatabase 同步可重入事务', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'teamhub-tx-'));
    dbPath = join(dir, 'tx.sqlite');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('内层成功随外层提交，内层失败可被外层捕获且只回滚 savepoint', () => {
    const db = SqliteDatabase.open(dbPath);
    db.ensureEntityTables(['items']);
    db.tx(() => {
      db.insertRow('items', 'outer', { id: 'outer' });
      db.tx(() => db.insertRow('items', 'nested', { id: 'nested' }));
      try {
        db.tx(() => {
          db.insertRow('items', 'rolled-back', { id: 'rolled-back' });
          throw new Error('expected');
        });
      } catch {
        // 外层继续提交。
      }
    });
    expect(db.getRow('items', 'outer')).toBeDefined();
    expect(db.getRow('items', 'nested')).toBeDefined();
    expect(db.getRow('items', 'rolled-back')).toBeUndefined();
    db.close();
  });

  it('拒绝 Promise 回调并回滚', async () => {
    const db = SqliteDatabase.open(dbPath);
    db.ensureEntityTables(['items']);
    expect(() =>
      db.tx(async () => {
        db.insertRow('items', 'async', { id: 'async' });
      }),
    ).toThrow(/必须同步/);
    expect(db.getRow('items', 'async')).toBeUndefined();
    db.close();
  });
});
