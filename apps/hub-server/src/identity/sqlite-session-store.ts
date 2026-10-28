import { SessionIdentitySchema } from '@teamhub/hub-contracts';
import type { SqliteDatabase } from '../store/sqlite-db.js';
import type { SessionEntry, SessionStore } from './session-store.js';

type SessionRow = { identity: string; expires_at: number; pin_upgrade_required: number };

export class SqliteSessionStore implements SessionStore {
  constructor(private readonly db: Pick<SqliteDatabase, 'prepare'>) {}

  create(token: string, entry: SessionEntry): void {
    this.db.prepare(`INSERT INTO sessions
      (token, member_id, identity, expires_at, pin_upgrade_required) VALUES (?, ?, ?, ?, ?)`)
      .run(token, entry.identity.memberId, JSON.stringify(entry.identity), entry.expiresAt,
        Number(entry.pinUpgradeRequired));
  }

  find(token: string): SessionEntry | undefined {
    const row = this.db.prepare('SELECT identity, expires_at, pin_upgrade_required FROM sessions WHERE token = ?')
      .get(token) as SessionRow | undefined;
    return row ? {
      identity: SessionIdentitySchema.parse(JSON.parse(row.identity)),
      expiresAt: row.expires_at,
      pinUpgradeRequired: row.pin_upgrade_required !== 0,
    } : undefined;
  }

  delete(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }

  clearPinUpgrade(memberId: string): void {
    this.db.prepare('UPDATE sessions SET pin_upgrade_required = 0 WHERE member_id = ?').run(memberId);
  }

  touch(token: string, expiresAt: number): void {
    this.db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run(expiresAt, token);
  }
}
