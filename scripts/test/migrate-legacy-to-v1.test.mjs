import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { migrateLegacyToV1 } from '../migrate-legacy-to-v1.mjs';

const SCRIPT = path.resolve('scripts/migrate-legacy-to-v1.mjs');
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamhub-v1-migration-'));
  const input = path.join(root, 'old.sqlite');
  const attachments = path.join(root, 'old-evidence');
  fs.mkdirSync(attachments);
  fs.writeFileSync(path.join(attachments, 'evidence-1.pdf'), 'fixture evidence');
  const db = new DatabaseSync(input);
  db.exec(`PRAGMA user_version = 4;
    CREATE TABLE groups (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE members (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE reimburse_entries (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE reimburse_batches (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE reimburse_payouts (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE reimburse_evidence_downloads (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE reimburse_profile (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE app_settings (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE sessions (token TEXT PRIMARY KEY, member_id TEXT, identity TEXT, expires_at INTEGER, pin_upgrade_required INTEGER);`);
  const insert = (table, value) => db.prepare(`INSERT INTO ${table} (id, data) VALUES (?, ?)`).run(value.id, JSON.stringify(value));
  insert('groups', { id: 'grp-1', seasonId: 'old-season', parentGroupId: null, name: '电路', kind: 'ec' });
  insert('members', { id: 'member-1', displayName: '测试成员', role: 'member', grade: 'junior', groupId: 'grp-1',
    status: 'idle', currentTaskId: null, updatedBy: 'console', updatedAt: '2026-01-01T00:00:00.000Z', pinHash: 'test-pin-sentinel' });
  insert('tasks', { id: 'task-1', projectId: 'old-project', groupId: 'grp-1', title: '跨周任务', rawSummary: '测试',
    polishedSummary: '旧摘要', status: 'inProgress', statusSource: 'console', ownerId: 'member-1', collaboratorIds: [], intrinsicComplexity: 'normal',
    lastProgressAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: { id: 'member-1', displayName: '测试成员', source: 'console' },
    completedBy: { id: 'member-1', displayName: '测试成员', source: 'console' },
    weekLinks: [{ weekKey: '2026-W02', linkedAt: '2026-01-01T00:00:00.000Z', linkedBy: { id: 'member-1', displayName: '测试成员', source: 'console' } },
      { weekKey: '2026-W01', linkedAt: '2026-01-01T00:00:00.000Z', linkedBy: { id: 'member-1', displayName: '测试成员', source: 'console' } }],
    ownershipEvents: [] });
  insert('tasks', { id: 'task-2', projectId: 'old-project', groupId: 'grp-1', title: '无日期任务', rawSummary: '测试',
    status: 'pending', statusSource: 'console', ownerId: null, collaboratorIds: [], intrinsicComplexity: 'normal',
    lastProgressAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
  insert('reimburse_entries', { id: 'entry-1', projectId: 'old-project', seasonId: 'old-season', memberId: 'member-1',
    batchId: null, kind: 'expense', recognitionSource: 'manual', totalAmountFen: 100, items: [], actualItemName: null,
    materials: { paymentShot: false, inspection: false }, note: null,
    evidence: [{ id: 'evidence-1', kind: 'invoice', originalName: 'invoice.pdf', ext: '.pdf', sizeBytes: 16,
      sha256: 'fixture-sha', uploadedBy: 'member-1', uploadedAt: '2026-01-01T00:00:00.000Z' }],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
  insert('reimburse_profile', { id: 'singleton', expectedPurchaserName: '', expectedPurchaserTaxNo: '' });
  insert('app_settings', { id: 'singleton', schemaVersion: 1, dataMode: 'real', identityMode: 'identity',
    initializedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
  db.prepare('INSERT INTO sessions (token, member_id, identity, expires_at, pin_upgrade_required) VALUES (?, ?, ?, ?, ?)')
    .run('test-session-sentinel', 'member-1', '{}', 1, 0);
  db.close();
  return { root, input, attachments,
    output: path.join(root, 'new.sqlite'), outputAttachments: path.join(root, 'new-evidence') };
}

test('dry-run is read-only and write preserves ids, derives inclusive dates and drops retired references', () => {
  const value = fixture();
  const dry = migrateLegacyToV1({ ...value, write: false });
  assert.equal(dry.mode, 'dry-run');
  assert.equal(dry.after.tasks, 2);
  assert.equal(dry.after.scheduledTasks, 1);
  assert.equal(dry.after.unscheduledTasks, 1);
  assert.equal(dry.evidence.missing, 0);
  assert.equal(dry.danglingReferences, 0);
  assert.equal(dry.discardedFields['tasks.polishedSummary'], 1);
  assert.equal(dry.discardedFields['tasks.lastProgressAt'], 2);
  assert.equal(dry.discardedFields['tasks.statusSource'], 2);
  assert.equal(dry.discardedFields['members.status'], 1);
  assert.equal(dry.discardedFields['members.currentTaskId'], 1);
  assert.equal(dry.discardedFields['members.updatedBy'], 1);
  assert.equal(fs.existsSync(value.output), false);
  assert.equal(fs.existsSync(value.outputAttachments), false);

  const result = migrateLegacyToV1({ ...value, write: true });
  assert.equal(result.evidence.copied, 1);
  const db = new DatabaseSync(value.output, { readOnly: true });
  assert.equal(Number(db.prepare('PRAGMA user_version').get().user_version), 1);
  assert.equal(db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_kind').value, 'unified');
  assert.equal(db.prepare('SELECT count(*) count FROM sessions').get().count, 0);
  const first = JSON.parse(db.prepare('SELECT data FROM tasks WHERE id = ?').get('task-1').data);
  const second = JSON.parse(db.prepare('SELECT data FROM tasks WHERE id = ?').get('task-2').data);
  assert.equal(first.plannedStart, '2025-12-29');
  assert.equal(first.plannedEnd, '2026-01-11');
  assert.equal(first.projectId, undefined);
  assert.equal(first.ownershipEvents, undefined);
  assert.equal(first.polishedSummary, undefined);
  assert.equal(first.lastProgressAt, undefined);
  assert.equal(first.statusSource, undefined);
  assert.equal(first.updatedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(first.createdBy.id, 'member-1');
  assert.equal(first.completedBy.id, 'member-1');
  assert.equal(second.plannedStart, null);
  assert.equal(second.plannedEnd, null);
  const member = JSON.parse(db.prepare('SELECT data FROM members WHERE id = ?').get('member-1').data);
  assert.equal(member.pinHash, 'test-pin-sentinel');
  assert.equal(member.status, undefined);
  assert.equal(member.currentTaskId, undefined);
  assert.equal(member.updatedBy, undefined);
  assert.equal(member.updatedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(JSON.parse(db.prepare('SELECT data FROM groups WHERE id = ?').get('grp-1').data).seasonId, undefined);
  assert.equal(JSON.parse(db.prepare('SELECT data FROM reimburse_entries WHERE id = ?').get('entry-1').data).workflowStatus, 'draft');
  assert.equal(fs.readFileSync(path.join(value.outputAttachments, 'evidence-1.pdf'), 'utf8'), 'fixture evidence');
  db.close();
  const old = new DatabaseSync(value.input, { readOnly: true });
  assert.equal(Number(old.prepare('PRAGMA user_version').get().user_version), 4);
  assert.equal(JSON.parse(old.prepare('SELECT data FROM tasks WHERE id = ?').get('task-1').data).projectId, 'old-project');
  assert.equal(old.prepare('SELECT count(*) count FROM sessions').get().count, 1);
  old.close();
  fs.rmSync(value.root, { recursive: true, force: true });
});

test('missing evidence aborts before creating output and CLI never prints credentials', () => {
  const value = fixture();
  fs.rmSync(path.join(value.attachments, 'evidence-1.pdf'));
  assert.throws(() => migrateLegacyToV1({ ...value, write: true }), /1 missing evidence files/);
  assert.equal(fs.existsSync(value.output), false);
  const cli = spawnSync(process.execPath, [SCRIPT, '--input', value.input, '--attachments', value.attachments,
    '--output', value.output, '--output-attachments', value.outputAttachments], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /missing evidence files/);
  assert.equal(cli.stdout.includes('test-pin-sentinel') || cli.stderr.includes('test-pin-sentinel'), false);
  assert.equal(cli.stdout.includes('test-session-sentinel') || cli.stderr.includes('test-session-sentinel'), false);
  fs.rmSync(value.root, { recursive: true, force: true });
});
