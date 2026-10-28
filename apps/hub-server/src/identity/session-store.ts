import { randomBytes } from 'node:crypto';
import { SessionIdentitySchema, type SessionIdentity } from '@teamhub/hub-contracts';

export interface SessionEntry {
  identity: SessionIdentity;
  expiresAt: number;
  pinUpgradeRequired: boolean;
}

export interface SessionStore {
  create(token: string, entry: SessionEntry): void;
  find(token: string): SessionEntry | undefined;
  delete(token: string): void;
  clearPinUpgrade(memberId: string): void;
  touch(token: string, expiresAt: number): void;
}

/** D-096：生产会话存入统一 SQLite，重启后保留身份与 PIN 升级标记。 */
export class SessionManager {
  constructor(
    private readonly store: SessionStore,
    private readonly ttlMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  create(identity: SessionIdentity, opts?: { pinUpgradeRequired?: boolean }): string {
    const token = randomBytes(32).toString('hex');
    this.store.create(token, {
      // 只持久化公开身份投影，即使调用方误传成员对象也不会落盘 pinHash。
      identity: SessionIdentitySchema.parse(identity),
      expiresAt: this.now() + this.ttlMs,
      pinUpgradeRequired: opts?.pinUpgradeRequired ?? false,
    });
    return token;
  }

  resolve(token: string): SessionIdentity | null {
    return this.findActive(token)?.identity ?? null;
  }

  destroy(token: string): void {
    this.store.delete(token);
  }

  isPinUpgradeRequired(token: string): boolean {
    return this.findActive(token)?.pinUpgradeRequired ?? false;
  }

  clearPinUpgrade(memberId: string): void {
    this.store.clearPinUpgrade(memberId);
  }

  /** 剩余不足半个 TTL 才写库；返回 true 时调用方须同步重发 cookie。 */
  touch(token: string): boolean {
    const now = this.now();
    const entry = this.findActive(token, now);
    if (!entry || entry.expiresAt - now >= this.ttlMs / 2) return false;
    this.store.touch(token, now + this.ttlMs);
    return true;
  }

  private findActive(token: string, now = this.now()): SessionEntry | undefined {
    const entry = this.store.find(token);
    if (entry && now >= entry.expiresAt) {
      this.store.delete(token);
      return undefined;
    }
    return entry;
  }
}
