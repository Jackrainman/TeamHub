#!/usr/bin/env node
//
// 统一 SQLite 迁移脚本：把五个 JSON 落盘域（gov/kb/inv/baseline/checklist）灌进一个 teamhub.sqlite。
//
// 用法：
//   node scripts/migrate-all-to-sqlite.mjs [--out <path>] [--force] [--dry-run]
//   node scripts/migrate-all-to-sqlite.mjs --gov ~/teamhub-data/gov.json --kb ~/teamhub-data/kb.json ...
//
// 各域源文件路径默认从 env 读（TEAMHUB_GOV_DATA_FILE 等），缺则用 ~/teamhub-data/ 默认路径。
// 某域源文件不存在 → 该域 seed 空（不中断整批）。
//
// 退出码：0 = 迁移成功且往返比对零丢失；非零 = 失败。

import { DatabaseSync } from 'node:sqlite';
import { readFile, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

// ── SYNC with apps/hub-server/src/store/sqlite-unified.ts ────────────────────────────
const SCHEMA_VERSION = 1;

const GOV_TABLES = [
  'seasons', 'groups', 'members', 'tasks', 'dependencies', 'needs',
  'knowledge_nodes', 'task_knowledge_tags', 'artifacts',
  'resources', 'resource_sessions', 'relay_handoffs',
];
const KB_TABLES = ['kb_issue_cards', 'kb_error_entries', 'kb_archive_documents'];
const INV_TABLES = ['inv_part_types', 'inv_tracked_parts', 'inv_actions'];
const BASELINE_TABLES = ['baselines'];
const CHECKLIST_TABLES = ['checklist_items', 'checklist_templates'];

const ALL_TABLES = [
  ...GOV_TABLES, ...KB_TABLES, ...INV_TABLES, ...BASELINE_TABLES, ...CHECKLIST_TABLES,
];
// ──────────────────────────────────────────────────────────────────────────────────────

function log(msg) { console.log(`[migrate-all] ${msg}`); }
function fail(msg) { console.error(`[migrate-all] ✗ ${msg}`); process.exitCode = 1; }

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { force: false, dryRun: false, out: null, sources: {} };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--force': opts.force = true; break;
      case '--dry-run': opts.dryRun = true; break;
      case '--out': opts.out = args[++i]; break;
      case '--gov': opts.sources.gov = args[++i]; break;
      case '--kb': opts.sources.kb = args[++i]; break;
      case '--inv': opts.sources.inv = args[++i]; break;
      case '--baseline': opts.sources.baseline = args[++i]; break;
      case '--checklist': opts.sources.checklist = args[++i]; break;
      default: fail(`未知参数: ${args[i]}`); process.exit(1);
    }
  }
  const home = homedir();
  const dataDir = join(home, 'teamhub-data');
  opts.sources.gov ??= process.env.TEAMHUB_GOV_DATA_FILE ?? join(dataDir, 'gov.json');
  opts.sources.kb ??= process.env.TEAMHUB_KB_DATA_FILE ?? join(dataDir, 'kb.json');
  opts.sources.inv ??= process.env.TEAMHUB_INV_DATA_FILE ?? join(dataDir, 'inventory.json');
  opts.sources.baseline ??= process.env.TEAMHUB_BASELINE_DATA_FILE ?? join(dataDir, 'baseline.json');
  opts.sources.checklist ??= process.env.TEAMHUB_CHECKLIST_DATA_FILE ?? join(dataDir, 'checklist.json');
  opts.out ??= process.env.TEAMHUB_DB_FILE ?? join(dataDir, 'teamhub.sqlite');
  return opts;
}

function createSchema(db) {
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  for (const table of ALL_TABLES) {
    db.exec(`CREATE TABLE IF NOT EXISTS "${table}" (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
  }
}

function bulkInsert(db, table, items) {
  const stmt = db.prepare(`INSERT INTO "${table}" (id, data) VALUES (?, ?)`);
  for (const item of items) stmt.run(item.id, JSON.stringify(item));
}

function canonicalEqual(a, b) {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === 'object') {
    return Object.keys(v).sort().reduce((o, k) => { o[k] = sortKeys(v[k]); return o; }, {});
  }
  return v;
}

async function main() {
  const opts = parseArgs();
  log('源文件：');
  for (const [domain, path] of Object.entries(opts.sources)) {
    const exists = await stat(resolve(path)).then(() => true, () => false);
    log(`  ${domain}: ${path} ${exists ? '' : '(不存在→空域)'}`);
  }
  log(`输出：${opts.out}`);

  // 读源
  const gov = await readJsonIfExists(resolve(opts.sources.gov));
  const resources = await readJsonIfExists(
    join(dirname(resolve(opts.sources.gov)), 'resources.json'));
  const scheduleSessions = await readJsonIfExists(
    join(dirname(resolve(opts.sources.gov)), 'schedule-sessions.json'));
  const kb = await readJsonIfExists(resolve(opts.sources.kb));
  const inv = await readJsonIfExists(resolve(opts.sources.inv));
  const baseline = await readJsonIfExists(resolve(opts.sources.baseline));
  const checklist = await readJsonIfExists(resolve(opts.sources.checklist));

  const counts = {
    gov: gov ? (gov.tasks?.length ?? 0) : 0,
    kb: kb ? (kb.issueCards?.length ?? 0) : 0,
    inv: inv ? (inv.partTypes?.length ?? 0) : 0,
    baseline: Array.isArray(baseline) ? baseline.length : 0,
    checklist: checklist ? (checklist.items?.length ?? 0) : 0,
  };
  log(`计数：gov.tasks=${counts.gov} kb.issueCards=${counts.kb} inv.partTypes=${counts.inv} baselines=${counts.baseline} checklist.items=${counts.checklist}`);

  if (opts.dryRun) {
    log('dry-run 模式：不写库。');
    return;
  }

  // 拒绝覆盖
  const outPath = resolve(opts.out);
  const outExists = await stat(outPath).then(() => true, () => false);
  if (outExists && !opts.force) {
    fail(`输出库已存在：${outPath}（用 --force 覆盖）`);
    process.exit(1);
  }
  if (outExists) await unlink(outPath);

  await (async () => {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(dirname(outPath), { recursive: true });
  })();

  const db = new DatabaseSync(outPath);
  createSchema(db);

  db.exec('BEGIN');
  try {
    // meta
    db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('schema_kind', 'unified');

    // gov 域
    if (gov) {
      const setMeta = (k, v) => db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(k, v);
      setMeta('seasonId', gov.seasonId ?? '');
      setMeta('projectId', gov.projectId ?? '');
      setMeta('stage', gov.stage ?? '');
      const arrayTables = {
        seasons: 'seasons', groups: 'groups', members: 'members', tasks: 'tasks',
        dependencies: 'dependencies', needs: 'needs', knowledgeNodes: 'knowledge_nodes',
        taskKnowledgeTags: 'task_knowledge_tags', artifacts: 'artifacts',
      };
      for (const [field, table] of Object.entries(arrayTables)) {
        bulkInsert(db, table, gov[field] ?? []);
      }
    }
    if (resources) bulkInsert(db, 'resources', resources.resources ?? resources ?? []);
    if (scheduleSessions) {
      bulkInsert(db, 'resource_sessions', scheduleSessions.resourceSessions ?? scheduleSessions ?? []);
      bulkInsert(db, 'relay_handoffs', scheduleSessions.relayHandoffs ?? []);
    }

    // kb 域
    if (kb) {
      db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('kb_projectId', kb.projectId ?? '');
      bulkInsert(db, 'kb_issue_cards', kb.issueCards ?? []);
      bulkInsert(db, 'kb_error_entries', kb.errorEntries ?? []);
      for (const doc of kb.archiveDocuments ?? []) {
        db.prepare('INSERT INTO "kb_archive_documents" (id, data) VALUES (?, ?)').run(doc.issueId, JSON.stringify({ id: doc.issueId, ...doc }));
      }
    } else {
      db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('kb_projectId', '');
    }

    // inv 域
    if (inv) {
      db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('inv_projectId', inv.projectId ?? '');
      bulkInsert(db, 'inv_part_types', inv.partTypes ?? []);
      bulkInsert(db, 'inv_tracked_parts', inv.trackedParts ?? []);
      bulkInsert(db, 'inv_actions', inv.actions ?? []);
    } else {
      db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('inv_projectId', '');
    }

    // baseline 域
    if (Array.isArray(baseline)) {
      bulkInsert(db, 'baselines', baseline);
    }

    // checklist 域
    if (checklist) {
      bulkInsert(db, 'checklist_items', checklist.items ?? []);
      bulkInsert(db, 'checklist_templates', checklist.templates ?? []);
    }

    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    db.close();
    throw err;
  }

  // 往返校验
  log('往返校验…');
  let mismatches = 0;
  const readBack = (table) => {
    const rows = db.prepare(`SELECT data FROM "${table}" ORDER BY rowid`).all();
    return rows.map((r) => JSON.parse(r.data));
  };

  if (gov) {
    for (const [field, table] of Object.entries({
      seasons: 'seasons', groups: 'groups', members: 'members', tasks: 'tasks',
      dependencies: 'dependencies', needs: 'needs', knowledgeNodes: 'knowledge_nodes',
      taskKnowledgeTags: 'task_knowledge_tags', artifacts: 'artifacts',
    })) {
      const src = gov[field] ?? [];
      const dst = readBack(table);
      if (!canonicalEqual(src, dst)) { fail(`gov.${field} 往返不一致（src=${src.length} dst=${dst.length}）`); mismatches++; }
    }
  }
  if (kb) {
    for (const [field, table] of Object.entries({ issueCards: 'kb_issue_cards', errorEntries: 'kb_error_entries' })) {
      const src = kb[field] ?? [];
      const dst = readBack(table);
      if (!canonicalEqual(src, dst)) { fail(`kb.${field} 往返不一致`); mismatches++; }
    }
    const srcDocs = kb.archiveDocuments ?? [];
    const dstDocs = readBack('kb_archive_documents').map(({ id: _id, ...doc }) => doc);
    if (!canonicalEqual(srcDocs, dstDocs)) { fail('kb.archiveDocuments 往返不一致'); mismatches++; }
  }
  if (inv) {
    for (const [field, table] of Object.entries({ partTypes: 'inv_part_types', trackedParts: 'inv_tracked_parts', actions: 'inv_actions' })) {
      const src = inv[field] ?? [];
      const dst = readBack(table);
      if (!canonicalEqual(src, dst)) { fail(`inv.${field} 往返不一致`); mismatches++; }
    }
  }
  if (Array.isArray(baseline)) {
    const dst = readBack('baselines');
    if (!canonicalEqual(baseline, dst)) { fail('baseline 往返不一致'); mismatches++; }
  }
  if (checklist) {
    const srcItems = checklist.items ?? [];
    const dstItems = readBack('checklist_items');
    if (!canonicalEqual(srcItems, dstItems)) { fail('checklist.items 往返不一致'); mismatches++; }
  }

  db.close();

  if (mismatches > 0) {
    fail(`${mismatches} 处往返不一致，迁移无效`);
    process.exit(1);
  }
  log(`✓ 迁移成功 → ${outPath}（schema_kind=unified, user_version=${SCHEMA_VERSION}）`);
  log('接线：设 TEAMHUB_BACKEND=sqlite TEAMHUB_DB_FILE=' + outPath + ' 后重启 start-teamhub.sh');
}

main().catch((err) => { fail(err.message ?? String(err)); process.exit(1); });
