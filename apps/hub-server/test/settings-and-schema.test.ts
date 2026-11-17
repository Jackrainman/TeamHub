import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
import { afterEach, describe, expect, it } from 'vitest';
import { openV1Database } from '../src/store/v1-database.js';
import { createTestHub, login, TEST_PASSWORDS, type TestHub } from './support/build-test-hub-server.js';

let hub: TestHub | undefined;
afterEach(async () => { if (hub) await hub.close(); hub = undefined; });
describe('v1 schema and settings', () => {
  it('rejects a v4 file without changing it and does not seed an empty real database', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamhub-v1-schema-'));
    const oldPath = path.join(root, 'old.sqlite');
    const old = new DatabaseSync(oldPath);
    old.exec('PRAGMA user_version = 4; CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    old.close();
    expect(() => openV1Database(oldPath)).toThrow(/unsupported database schema 4/);
    const check = new DatabaseSync(oldPath, { readOnly: true });
    expect(Number(check.prepare('PRAGMA user_version').get()!.user_version)).toBe(4);
    check.close();
    const current = openV1Database(path.join(root, 'current.sqlite'));
    expect(current.getDatabaseState()).toBe('empty');
    expect(current.db.rowCount('groups')).toBe(0);
    expect(current.db.rowCount('members')).toBe(0);
    expect(current.db.rowCount('tasks')).toBe(0);
    current.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('manages groups, member roles and last-admin protection through authorized routes', async () => {
    hub = createTestHub();
    const cookie = await login(hub.app, 'admin', TEST_PASSWORDS.admin);
    const created = await hub.app.inject({ method: 'POST', url: '/api/groups', headers: { cookie }, payload: { name: '算法' } });
    expect(created.statusCode).toBe(201);
    const group = created.json().group;
    expect(group.parentGroupId).toBeUndefined();
    const renamed = await hub.app.inject({ method: 'PUT', url: `/api/groups/${group.id}`, headers: { cookie }, payload: { name: '算法组' } });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().group.name).toBe('算法组');
    expect((await hub.app.inject({ method: 'DELETE', url: `/api/groups/${group.id}`, headers: { cookie } })).statusCode).toBe(200);
    const members = await hub.app.inject({ method: 'GET', url: '/api/members', headers: { cookie } });
    const admin = members.json().members.find((member: { displayName: string }) => member.displayName === 'admin');
    const revoked = await hub.app.inject({ method: 'PUT', url: `/api/members/${admin.id}/project-manager`, headers: { cookie }, payload: { projectManager: false } });
    expect(revoked.statusCode).toBe(409);
    const owner = members.json().members.find((member: { displayName: string }) => member.displayName === 'owner');
    const role = await hub.app.inject({ method: 'PUT', url: `/api/members/${owner.id}/role`, headers: { cookie }, payload: { role: 'groupAdmin' } });
    expect(role.statusCode).toBe(200);
    expect(role.json().member.role).toBe('groupAdmin');
    expect(role.json().member.pinHash).toBeUndefined();
    expect((await hub.app.inject({ method: 'GET', url: '/api/export/roster', headers: { cookie } })).statusCode).toBe(200);
    expect((await hub.app.inject({ method: 'GET', url: '/api/export/tasks', headers: { cookie } })).statusCode).toBe(200);
  });
});
