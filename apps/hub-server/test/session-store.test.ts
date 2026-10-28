import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionManager } from '../src/identity/session-store.js';
import { SqliteSessionStore } from '../src/identity/sqlite-session-store.js';
import { openUnifiedDb, type UnifiedDatabase } from '../src/store/sqlite-unified.js';

const identity = { memberId: 'm-session', displayName: 'Session member', groupId: 'grp-test', role: 'member' as const };
const DAY = 86_400_000;

describe('SQLite sessions', () => {
  let dir: string;
  let path: string;
  let database: UnifiedDatabase;
  let store: SqliteSessionStore;
  let sessions: SessionManager;
  let now: number;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'teamhub-sessions-'));
    path = join(dir, 'sessions.sqlite');
    now = Date.UTC(2026, 9, 28);
    database = openUnifiedDb(path);
    store = new SqliteSessionStore(database.db);
    sessions = new SessionManager(store, 30 * DAY, () => now);
  });
  afterEach(async () => {
    database.close();
    await rm(dir, { recursive: true, force: true });
  });

  test('identity and PIN flag survive close/reopen; sensitive fields are not stored', () => {
    const token = sessions.create({ ...identity, pinHash: 'must-not-persist' } as typeof identity, { pinUpgradeRequired: true });
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(sessions.create(identity)).not.toBe(token);
    expect(store.find(token)?.identity).toEqual(identity);
    const raw = database.db.prepare('SELECT identity FROM sessions WHERE token = ?').get(token);
    expect(JSON.parse(String(raw?.identity))).toEqual(identity);
    database.close();
    database = openUnifiedDb(path);
    sessions = new SessionManager(new SqliteSessionStore(database.db), 30 * DAY, () => now);
    expect(sessions.resolve(token)).toEqual(identity);
    expect(sessions.isPinUpgradeRequired(token)).toBe(true);
    sessions.destroy(token);
    sessions.destroy(token);
    expect(sessions.resolve(token)).toBeNull();
    expect(sessions.isPinUpgradeRequired(token)).toBe(false);
    database.close();
    database = openUnifiedDb(path);
    expect(new SqliteSessionStore(database.db).find(token)).toBeUndefined();
  });

  test.each(['resolve', 'isPinUpgradeRequired', 'touch'] as const)('%s evicts at the exact expiry without reviving', (method) => {
    const token = sessions.create(identity, { pinUpgradeRequired: true });
    now += 30 * DAY - 1;
    expect(sessions.resolve(token)).toEqual(identity);
    now += 1;
    expect(sessions[method](token)).toBe(method === 'resolve' ? null : false);
    expect(store.find(token)).toBeUndefined();
    expect(sessions.touch(token)).toBe(false);
  });

  test('touch writes only below half TTL and preserves the upgrade flag', () => {
    const start = now;
    const token = sessions.create(identity, { pinUpgradeRequired: true });
    now += 15 * DAY;
    expect(sessions.touch(token)).toBe(false);
    expect(store.find(token)?.expiresAt).toBe(start + 30 * DAY);
    now += 1;
    expect(sessions.touch(token)).toBe(true);
    expect(store.find(token)?.expiresAt).toBe(start + 45 * DAY + 1);
    expect(sessions.touch(token)).toBe(false);
    expect(sessions.isPinUpgradeRequired(token)).toBe(true);
    now = start + 30 * DAY;
    expect(sessions.resolve(token)).toEqual(identity);
    now = start + 45 * DAY + 1;
    expect(sessions.resolve(token)).toBeNull();
  });

  test('clearing PIN upgrade affects all sessions of only that member', () => {
    const first = sessions.create(identity, { pinUpgradeRequired: true });
    const second = sessions.create(identity, { pinUpgradeRequired: true });
    const other = sessions.create({ ...identity, memberId: 'another-member' }, { pinUpgradeRequired: true });
    sessions.clearPinUpgrade(identity.memberId);
    sessions.clearPinUpgrade('missing');
    expect(sessions.isPinUpgradeRequired(first)).toBe(false);
    expect(sessions.isPinUpgradeRequired(second)).toBe(false);
    expect(sessions.isPinUpgradeRequired(other)).toBe(true);
    expect(sessions.resolve(first)).toEqual(identity);
    database.close();
    database = openUnifiedDb(path);
    sessions = new SessionManager(new SqliteSessionStore(database.db), 30 * DAY, () => now);
    expect(sessions.isPinUpgradeRequired(second)).toBe(false);
    expect(sessions.isPinUpgradeRequired(other)).toBe(true);
  });
});
