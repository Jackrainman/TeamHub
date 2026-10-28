import type { SessionEntry, SessionStore } from '../../src/identity/session-store.js';

export class InMemorySessionStore implements SessionStore {
  private readonly entries = new Map<string, SessionEntry>();

  create(token: string, entry: SessionEntry): void {
    this.entries.set(token, structuredClone(entry));
  }

  find(token: string): SessionEntry | undefined {
    const entry = this.entries.get(token);
    return entry ? structuredClone(entry) : undefined;
  }

  delete(token: string): void {
    this.entries.delete(token);
  }

  clearPinUpgrade(memberId: string): void {
    for (const entry of this.entries.values()) {
      if (entry.identity.memberId === memberId) entry.pinUpgradeRequired = false;
    }
  }

  touch(token: string, expiresAt: number): void {
    const entry = this.entries.get(token);
    if (entry) entry.expiresAt = expiresAt;
  }
}
