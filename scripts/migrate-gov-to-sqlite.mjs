#!/usr/bin/env node
//
// 治理快照 gov.json → SQLite 增量迁移脚本（SS3 SQLite，product-redefine-2026-07 §4.4 / §9-③）。
//
// 把 FileGovStore 的三份落盘（gov.json + 同目录 resources.json + schedule-sessions.json）灌进**一个**
// SQLite 文件，产出可被 `SqliteGovStore.create()` 直接打开的库（表结构 = sqlite-gov-store.ts 的
// 文档式行存：每域一表 `(id TEXT PRIMARY KEY, data TEXT NOT NULL)` + meta 标量键值表 + PRAGMA user_version）。
// 迁移完就**读回逐字段比对**，零丢失才算成功（否则非零退出，绝不「看着跑完了却少了数据」）。
//
// **SYNC**：本文件内联的表名 / 建表 DDL / SCHEMA_VERSION 必须与 apps/hub-server/src/store/sqlite-gov-store.ts
// 一致（.mjs 独立运行、不 import 编译产物，故两处各写一份）——迁移往返测试
// （apps/hub-server/test/sqlite-gov-store.test.ts）是漂移哨兵：任一处表名/结构漂移即测试红。
//
// ⚠️ **铁律：只对副本操作**。本脚本对源 gov.json 全程**只读**（从不回写），且拒绝覆盖已存在的输出库
// （除非 --force）。演练 / 测试务必指向 ~/teamhub-data 之外的副本，绝不拿真实数据当靶子（AGENTS §8 / 铁律5）。
// 建议先跑 scripts/backup-teamhub-data.sh 留快照。
//
// 用法：
//   node scripts/migrate-gov-to-sqlite.mjs <gov.json 路径> <输出.sqlite 路径> [--force]
//   node scripts/migrate-gov-to-sqlite.mjs                       # 用默认路径（见下）
//   TEAMHUB_GOV_DATA_FILE=... TEAMHUB_GOV_SQLITE_FILE=... node scripts/migrate-gov-to-sqlite.mjs
//     --force    输出库已存在时先删再建（默认存在即拒绝、避免误覆盖）
//     --dry-run  只解析源 + 报计数，不写任何库
//
// 退出码：0 = 迁移成功且往返比对零丢失（含 dry-run）；非零 = 读取/解析/写入/比对失败。

import { DatabaseSync } from 'node:sqlite';
import { readFile, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

// ── SYNC with apps/hub-server/src/store/sqlite-gov-store.ts ────────────────────────────
const SCHEMA_VERSION = 1;
const ENTITY_TABLES = [
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
];

// GovernanceSnapshot 数组字段 → 表名（本表是 gov.json 内 9 个数组字段的映射；
// resources/resource_sessions/relay_handoffs 来自同目录的 sibling 文件，见下）。
const SNAPSHOT_ARRAY_TABLES = {
  seasons: 'seasons',
  groups: 'groups',
  members: 'members',
  tasks: 'tasks',
  dependencies: 'dependencies',
  needs: 'needs',
  knowledgeNodes: 'knowledge_nodes',
  taskKnowledgeTags: 'task_knowledge_tags',
  artifacts: 'artifacts',
};
// ──────────────────────────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[migrate-gov-to-sqlite] ${msg}`);
}
function fail(msg) {
  console.error(`[migrate-gov-to-sqlite] ✗ ${msg}`);
  process.exitCode = 1;
}

async function readJsonIfExists(path) {
  let raw;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
  return JSON.parse(raw);
}

/** 递归排序键的规范化（比对用）：对象按键名排序、数组保序 → 逐字段语义相等（不受键序/文本差异干扰）。 */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
    return out;
  }
  return value;
}
function canonicalEqual(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/**
 * gov.json 归一：新增数组字段（seasons）缺失时兜底空数组（旧落盘向后兼容，D-080）；其余数组字段亦
 * 防御式兜底 []。标量 seasonId/projectId/stage 必填（缺则视为损坏、fail-closed）。
 */
function normalizeSnapshot(gov) {
  for (const scalar of ['seasonId', 'projectId', 'stage']) {
    if (typeof gov[scalar] !== 'string' || gov[scalar].length === 0) {
      throw new Error(`gov.json 缺必填标量字段 ${scalar}（疑似损坏，拒绝迁移）`);
    }
  }
  const arrays = {};
  for (const field of Object.keys(SNAPSHOT_ARRAY_TABLES)) {
    const v = gov[field];
    arrays[field] = Array.isArray(v) ? v : [];
  }
  return {
    seasonId: gov.seasonId,
    projectId: gov.projectId,
    stage: gov.stage,
    arrays,
  };
}

function createSchema(db) {
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  for (const table of ENTITY_TABLES) {
    db.exec(`CREATE TABLE IF NOT EXISTS "${table}" (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
  }
}

function bulkInsert(db, table, items) {
  const stmt = db.prepare(`INSERT INTO "${table}" (id, data) VALUES (?, ?)`);
  for (const item of items) {
    if (!item || typeof item.id !== 'string') {
      throw new Error(`表 ${table} 有记录缺 string 型 id（无法作主键，拒绝迁移）`);
    }
    stmt.run(item.id, JSON.stringify(item));
  }
}

/** 从 sqlite 读回重建（与 SqliteGovStore.getSnapshot / list* 同口径：ORDER BY rowid 还原插入序）。 */
function readBack(db) {
  const meta = {};
  for (const row of db.prepare('SELECT key, value FROM meta').all()) {
    meta[row.key] = row.value;
  }
  const readTable = (table) =>
    db
      .prepare(`SELECT data FROM "${table}" ORDER BY rowid`)
      .all()
      .map((r) => JSON.parse(r.data));
  const arrays = {};
  for (const [field, table] of Object.entries(SNAPSHOT_ARRAY_TABLES)) {
    arrays[field] = readTable(table);
  }
  return {
    seasonId: meta.seasonId,
    projectId: meta.projectId,
    stage: meta.stage,
    arrays,
    resources: readTable('resources'),
    resourceSessions: readTable('resource_sessions'),
    relayHandoffs: readTable('relay_handoffs'),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');
  const positional = args.filter((a) => !a.startsWith('--'));

  const govPath = resolve(
    positional[0] ??
      process.env.TEAMHUB_GOV_DATA_FILE ??
      `${process.env.HOME ?? ''}/teamhub-data/gov.json`,
  );
  const outPath = resolve(
    positional[1] ??
      process.env.TEAMHUB_GOV_SQLITE_FILE ??
      join(dirname(govPath), 'gov.sqlite'),
  );

  // 源 gov.json（必需）
  let gov;
  try {
    gov = JSON.parse(await readFile(govPath, 'utf8'));
  } catch (err) {
    fail(`读取/解析源 gov.json 失败：${govPath} — ${err.message}`);
    return;
  }

  let normalized;
  try {
    normalized = normalizeSnapshot(gov);
  } catch (err) {
    fail(err.message);
    return;
  }

  // sibling 文件（可选）：resources.json + schedule-sessions.json（与 FileGovStore 派生同目录同名）
  const resourcesPath = join(dirname(govPath), 'resources.json');
  const scheduleSessionsPath = join(dirname(govPath), 'schedule-sessions.json');
  let resources = [];
  let resourceSessions = [];
  let relayHandoffs = [];
  try {
    const r = await readJsonIfExists(resourcesPath);
    if (Array.isArray(r)) resources = r;
    const s = await readJsonIfExists(scheduleSessionsPath);
    if (s && typeof s === 'object') {
      if (Array.isArray(s.resourceSessions)) resourceSessions = s.resourceSessions;
      if (Array.isArray(s.relayHandoffs)) relayHandoffs = s.relayHandoffs;
    }
  } catch (err) {
    fail(`读取/解析 sibling 文件失败 — ${err.message}`);
    return;
  }

  const counts = {
    ...Object.fromEntries(
      Object.entries(normalized.arrays).map(([k, v]) => [k, v.length]),
    ),
    resources: resources.length,
    resourceSessions: resourceSessions.length,
    relayHandoffs: relayHandoffs.length,
  };
  log(
    `源：${govPath}\n  计数 = ${Object.entries(counts)
      .map(([k, v]) => `${k}:${v}`)
      .join('  ')}`,
  );

  if (dryRun) {
    log('dry-run：未写任何库。');
    return;
  }

  // 输出库：已存在则拒绝（除非 --force 先删）——避免误覆盖 / INSERT 撞已有主键。
  let outExists = false;
  try {
    await stat(outPath);
    outExists = true;
  } catch {
    outExists = false;
  }
  if (outExists) {
    if (!force) {
      fail(`输出库已存在：${outPath}（要覆盖请加 --force）`);
      return;
    }
    await unlink(outPath);
  }

  const db = new DatabaseSync(outPath);
  try {
    createSchema(db);
    db.exec('BEGIN');
    try {
      db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(
        'seasonId',
        normalized.seasonId,
      );
      db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(
        'projectId',
        normalized.projectId,
      );
      db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(
        'stage',
        normalized.stage,
      );
      for (const [field, table] of Object.entries(SNAPSHOT_ARRAY_TABLES)) {
        bulkInsert(db, table, normalized.arrays[field]);
      }
      bulkInsert(db, 'resources', resources);
      bulkInsert(db, 'resource_sessions', resourceSessions);
      bulkInsert(db, 'relay_handoffs', relayHandoffs);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);

    // 读回逐字段比对（零丢失硬门）
    const back = readBack(db);
    const expected = {
      seasonId: normalized.seasonId,
      projectId: normalized.projectId,
      stage: normalized.stage,
      arrays: normalized.arrays,
      resources,
      resourceSessions,
      relayHandoffs,
    };
    if (!canonicalEqual(back, expected)) {
      // 精确定位第一处差异，便于排障
      const mismatches = [];
      if (back.seasonId !== expected.seasonId) mismatches.push('seasonId');
      if (back.projectId !== expected.projectId) mismatches.push('projectId');
      if (back.stage !== expected.stage) mismatches.push('stage');
      for (const field of Object.keys(SNAPSHOT_ARRAY_TABLES)) {
        if (!canonicalEqual(back.arrays[field], expected.arrays[field])) {
          mismatches.push(field);
        }
      }
      for (const field of ['resources', 'resourceSessions', 'relayHandoffs']) {
        if (!canonicalEqual(back[field], expected[field])) mismatches.push(field);
      }
      fail(`往返比对失败（读回与源不一致）：${mismatches.join(', ') || '（结构差异）'}`);
      return;
    }
  } finally {
    db.close();
  }

  log(`✓ 迁移完成、往返比对零丢失 → ${outPath}（user_version=${SCHEMA_VERSION}）`);
  log(
    '  接线：TEAMHUB_GOV_BACKEND=sqlite TEAMHUB_GOV_SQLITE_FILE=' +
      outPath +
      ' 启动即用该库（默认不设仍走 JSON，现状零变化）。',
  );
}

await main();
