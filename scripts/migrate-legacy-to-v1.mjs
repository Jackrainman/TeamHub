#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

const DAY = 86_400_000;
const TABLES = ['groups', 'members', 'tasks', 'reimburse_entries', 'reimburse_batches', 'reimburse_payouts', 'reimburse_evidence_downloads'];
const TASK_DROPPED = new Set([
  'projectId', 'seasonId', 'milestoneId', 'convergenceScope', 'investment', 'assignReason',
  'assignedBy', 'partnerMemberId', 'crossClaimConfirmedBy', 'ownershipEvents',
]);
const GROUP_DROPPED = new Set(['seasonId', 'parentGroupId']);
const REIMBURSE_DROPPED = new Set(['projectId', 'seasonId']);
const MEMBER_DROPPED = new Set(['pinPlaintext']);

function readRows(db, table) {
  return db.prepare(`SELECT data FROM ${table} ORDER BY rowid`).all().map((row) => JSON.parse(row.data));
}
function dropFields(value, dropped, domain, counters) {
  const next = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (dropped.has(key)) {
      const field = `${domain}.${key}`;
      counters[field] = (counters[field] ?? 0) + 1;
    } else next[key] = fieldValue;
  }
  return next;
}
function weekMonday(key) {
  if (!/^[1-9]\d{3}-W\d{2}$/.test(key)) throw new Error(`invalid weekLink: ${key}`);
  const year = Number(key.slice(0, 4));
  const week = Number(key.slice(6));
  const jan4 = new Date(Date.UTC(year, 0, 4));
  return new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * DAY + (week - 1) * 7 * DAY);
}
function dateKey(date) { return date.toISOString().slice(0, 10); }
function deriveDates(task) {
  const keys = [...new Set((task.weekLinks ?? []).map((link) => link.weekKey))].sort();
  if (keys.length === 0) return { plannedStart: null, plannedEnd: null };
  const first = weekMonday(keys[0]);
  const last = weekMonday(keys.at(-1));
  return {
    plannedStart: dateKey(first),
    plannedEnd: dateKey(new Date(last.getTime() + 6 * DAY)),
  };
}
function normalizeMember(raw, counters) {
  const member = dropFields(raw, MEMBER_DROPPED, 'members', counters);
  if (member.role === 'superAdmin') {
    member.role = 'member';
    member.projectManager = true;
    counters['members.role(superAdmin)'] = (counters['members.role(superAdmin)'] ?? 0) + 1;
  }
  return member;
}
function normalizeEntry(raw, counters) {
  const entry = dropFields(raw, REIMBURSE_DROPPED, 'reimburse', counters);
  return {
    workflowStatus: 'draft', revision: 1, recognitionConfirmedRevision: null,
    checkedRevision: null, reviewedRevision: null, approvedAmountFen: null,
    reviewNote: null, returnReason: null, payoutId: null, history: [], evidence: [],
    expenseType: null, summary: null, batchId: null, ...entry,
    materials: { invoice: false, paymentShot: false, inspection: false, ...(entry.materials ?? {}) },
  };
}
function evidenceFile(sourceDir, evidence) {
  const expected = `${evidence.id}${evidence.ext}`;
  const exact = path.join(sourceDir, expected);
  if (fs.existsSync(exact) && fs.statSync(exact).isFile()) return { source: exact, name: expected };
  const candidates = fs.readdirSync(sourceDir).filter((name) => name.startsWith(`${evidence.id}.`));
  if (candidates.length === 1) return { source: path.join(sourceDir, candidates[0]), name: candidates[0] };
  return null;
}
function uniqueIds(rows, domain) {
  const ids = new Set();
  for (const row of rows) {
    if (!row.id || ids.has(row.id)) throw new Error(`${domain}: duplicate or missing id`);
    ids.add(row.id);
  }
  return ids;
}
function actorId(actor) { return actor && typeof actor === 'object' ? actor.id : undefined; }
function countDangling(report, domain, id, field, target) {
  if (target) report.dangling.push(`${domain}:${id}.${field}`);
}

export function migrateLegacyToV1(options) {
  const input = path.resolve(options.input);
  const output = path.resolve(options.output);
  const attachments = path.resolve(options.attachments);
  const outputAttachments = path.resolve(options.outputAttachments);
  const write = options.write === true;
  if (input === output) throw new Error('input and output database must differ; in-place migration is forbidden');
  if (attachments === outputAttachments) throw new Error('input and output attachment directories must differ');
  if (!fs.existsSync(input) || !fs.statSync(input).isFile()) throw new Error(`input database not found: ${input}`);
  if (!fs.existsSync(attachments) || !fs.statSync(attachments).isDirectory()) throw new Error(`attachment directory not found: ${attachments}`);
  if (write && (fs.existsSync(output) || fs.existsSync(outputAttachments))) throw new Error('output paths must be new; refusing to overwrite');

  const discardedFields = {};
  const source = new DatabaseSync(input, { readOnly: true });
  let groups, members, tasks, entries, batches, payouts, downloads, profile, settings;
  try {
    const version = Number(source.prepare('PRAGMA user_version').get().user_version);
    if (version !== 4) throw new Error(`expected legacy schema v4, found ${version}`);
    groups = readRows(source, 'groups').map((row) => dropFields(row, GROUP_DROPPED, 'groups', discardedFields));
    members = readRows(source, 'members').map((row) => normalizeMember(row, discardedFields));
    tasks = readRows(source, 'tasks').map((row) => ({
      ...dropFields(row, TASK_DROPPED, 'tasks', discardedFields),
      ...deriveDates(row),
    }));
    entries = readRows(source, 'reimburse_entries').map((row) => normalizeEntry(row, discardedFields));
    batches = readRows(source, 'reimburse_batches').map((row) => ({
      ...dropFields(row, REIMBURSE_DROPPED, 'reimburse', discardedFields),
      status: row.status === 'reimbursed' ? 'submitted' : row.status,
    }));
    payouts = readRows(source, 'reimburse_payouts').map((row) => dropFields(row, REIMBURSE_DROPPED, 'reimburse', discardedFields));
    downloads = readRows(source, 'reimburse_evidence_downloads');
    profile = source.prepare('SELECT data FROM reimburse_profile WHERE id = ?').get('singleton');
    settings = source.prepare('SELECT data FROM app_settings WHERE id = ?').get('singleton');
  } finally { source.close(); }

  const groupIds = uniqueIds(groups, 'groups');
  const memberIds = uniqueIds(members, 'members');
  const taskIds = uniqueIds(tasks, 'tasks');
  const entryIds = uniqueIds(entries, 'reimburse_entries');
  const batchIds = uniqueIds(batches, 'reimburse_batches');
  const dangling = [];
  const report = { dangling };
  for (const member of members) {
    countDangling(report, 'members', member.id, 'groupId', member.groupId && !groupIds.has(member.groupId));
    if (member.currentTaskId && !taskIds.has(member.currentTaskId)) {
      member.currentTaskId = null;
      discardedFields['members.currentTaskId(cleared)'] = (discardedFields['members.currentTaskId(cleared)'] ?? 0) + 1;
    }
  }
  for (const task of tasks) {
    countDangling(report, 'tasks', task.id, 'groupId', !groupIds.has(task.groupId));
    countDangling(report, 'tasks', task.id, 'ownerId', task.ownerId && !memberIds.has(task.ownerId));
    for (const id of task.collaboratorIds ?? []) countDangling(report, 'tasks', task.id, 'collaboratorIds', !memberIds.has(id));
    for (const id of task.reviewerIds ?? []) countDangling(report, 'tasks', task.id, 'reviewerIds', !memberIds.has(id));
    const actors = [task.createdBy, task.completedBy, task.reviewedBy,
      ...(task.weekLinks ?? []).map((link) => link.linkedBy),
      ...(task.transitions ?? []).map((transition) => transition.by),
      ...(task.activity ?? []).map((activity) => activity.by)];
    for (const actor of actors) countDangling(report, 'tasks', task.id, 'actor', actorId(actor) && !memberIds.has(actorId(actor)));
  }
  const payoutIds = uniqueIds(payouts, 'reimburse_payouts');
  for (const entry of entries) {
    countDangling(report, 'reimburse_entries', entry.id, 'memberId', !memberIds.has(entry.memberId));
    countDangling(report, 'reimburse_entries', entry.id, 'batchId', entry.batchId && !batchIds.has(entry.batchId));
    countDangling(report, 'reimburse_entries', entry.id, 'payoutId', entry.payoutId && !payoutIds.has(entry.payoutId));
    for (const evidence of entry.evidence ?? []) countDangling(report, 'reimburse_entries', entry.id, 'evidence.uploadedBy', !memberIds.has(evidence.uploadedBy));
    for (const event of entry.history ?? []) countDangling(report, 'reimburse_entries', entry.id, 'history.actorId', !memberIds.has(event.actorId));
  }
  for (const payout of payouts) {
    countDangling(report, 'reimburse_payouts', payout.id, 'recipientId', !memberIds.has(payout.recipientId));
    countDangling(report, 'reimburse_payouts', payout.id, 'recordedBy', !memberIds.has(payout.recordedBy));
    for (const id of payout.entryIds) countDangling(report, 'reimburse_payouts', payout.id, 'entryIds', !entryIds.has(id));
  }
  for (const download of downloads) {
    countDangling(report, 'reimburse_evidence_downloads', download.id, 'entryId', !entryIds.has(download.entryId));
    countDangling(report, 'reimburse_evidence_downloads', download.id, 'actorId', !memberIds.has(download.actorId));
    const entry = entries.find((item) => item.id === download.entryId);
    countDangling(report, 'reimburse_evidence_downloads', download.id, 'evidenceId', !entry?.evidence?.some((item) => item.id === download.evidenceId));
  }

  const evidenceRefs = entries.flatMap((entry) => entry.evidence ?? []);
  const copies = evidenceRefs.map((evidence) => ({ evidence, file: evidenceFile(attachments, evidence) }));
  const missingEvidence = copies.filter((copy) => !copy.file).map((copy) => copy.evidence.id);
  const now = new Date().toISOString();
  const migratedSettings = {
    schemaVersion: 1,
    dataMode: settings ? JSON.parse(settings.data).dataMode : 'real',
    identityMode: settings ? JSON.parse(settings.data).identityMode : 'identity',
    initializedAt: settings ? JSON.parse(settings.data).initializedAt : now,
    updatedAt: now,
  };
  const summary = {
    mode: write ? 'write' : 'dry-run',
    rule: 'plannedStart=earliest weekLink Monday; plannedEnd=latest weekLink Sunday (both inclusive); no weekLinks => null',
    before: { tasks: tasks.length, members: members.length, groups: groups.length, reimburse: entries.length },
    after: {
      tasks: tasks.length, members: members.length, groups: groups.length, reimburse: entries.length,
      batches: batches.length, payouts: payouts.length, evidenceDownloads: downloads.length, sessions: 0,
      scheduledTasks: tasks.filter((task) => task.plannedStart).length, unscheduledTasks: tasks.filter((task) => !task.plannedStart).length,
    },
    discardedFields,
    evidence: { referenced: evidenceRefs.length, copied: copies.length - missingEvidence.length, missing: missingEvidence.length },
    danglingReferences: dangling.length,
  };
  if (dangling.length > 0 || missingEvidence.length > 0) {
    const error = new Error(`migration validation failed: ${dangling.length} dangling references, ${missingEvidence.length} missing evidence files`);
    error.report = summary;
    error.missingEvidence = missingEvidence;
    throw error;
  }
  if (!write) return summary;

  const tmpDb = `${output}.tmp-${process.pid}`;
  const tmpAttachments = `${outputAttachments}.tmp-${process.pid}`;
  try {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.mkdirSync(path.dirname(outputAttachments), { recursive: true });
    const target = new DatabaseSync(tmpDb);
    try {
      target.exec('BEGIN IMMEDIATE');
      target.exec(`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE app_settings (id TEXT PRIMARY KEY CHECK (id = 'singleton'), data TEXT NOT NULL);
        CREATE TABLE groups (id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE members (id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE reimburse_entries (id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE reimburse_batches (id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE reimburse_payouts (id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE reimburse_evidence_downloads (id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE reimburse_profile (id TEXT PRIMARY KEY CHECK (id = 'singleton'), data TEXT NOT NULL);
        CREATE TABLE sessions (token TEXT PRIMARY KEY, member_id TEXT NOT NULL, identity TEXT NOT NULL,
          expires_at INTEGER NOT NULL, pin_upgrade_required INTEGER NOT NULL DEFAULT 0);
        CREATE INDEX idx_sessions_member ON sessions (member_id);
        PRAGMA user_version = 1;`);
      const insert = (table, row) => target.prepare(`INSERT INTO ${table} (id, data) VALUES (?, ?)`).run(row.id, JSON.stringify(row));
      for (const [table, rows] of Object.entries({ groups, members, tasks,
        reimburse_entries: entries, reimburse_batches: batches, reimburse_payouts: payouts,
        reimburse_evidence_downloads: downloads })) for (const row of rows) insert(table, row);
      target.prepare('INSERT INTO app_settings (id, data) VALUES (?, ?)').run('singleton', JSON.stringify(migratedSettings));
      target.prepare('INSERT INTO reimburse_profile (id, data) VALUES (?, ?)').run('singleton',
        profile?.data ?? JSON.stringify({ expectedPurchaserName: '', expectedPurchaserTaxNo: '' }));
      target.exec('COMMIT');
    } catch (error) {
      target.exec('ROLLBACK');
      throw error;
    } finally { target.close(); }
    fs.mkdirSync(tmpAttachments, { recursive: true });
    for (const copy of copies) fs.copyFileSync(copy.file.source, path.join(tmpAttachments, copy.file.name), fs.constants.COPYFILE_EXCL);
    fs.renameSync(tmpAttachments, outputAttachments);
    fs.renameSync(tmpDb, output);
    return { ...summary, output, outputAttachments };
  } catch (error) {
    fs.rmSync(tmpDb, { force: true });
    fs.rmSync(tmpAttachments, { recursive: true, force: true });
    throw error;
  }
}

function parseArgs(argv) {
  const result = { write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--write') result.write = true;
    else if (['--input', '--output', '--attachments', '--output-attachments'].includes(arg)) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      result[key] = argv[++index];
    } else throw new Error(`unknown argument: ${arg}`);
  }
  for (const key of ['input', 'output', 'attachments', 'outputAttachments']) {
    if (!result[key]) throw new Error(`missing --${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
  }
  return result;
}
function runCli() {
  try {
    const report = migrateLegacyToV1(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    if (error.report) console.error(JSON.stringify(error.report, null, 2));
    console.error(error.message);
    process.exitCode = 1;
  }
}
const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) runCli();
