import { randomBytes } from 'node:crypto';
import type { SqliteDatabase } from './sqlite-db.js';

export interface LarkConfigRecord {
  appId: string;
  appSecret: string;
  chatId: string;
  status: 'unconfigured' | 'connected' | 'error';
  lastCheckedAt?: string;
  error?: string;
}

const LARK_CONFIG_KEY = 'lark_config';
const WRITE_TOKEN_KEY = 'write_token';

export class LarkIntegrationStore {
  private constructor(private readonly db: SqliteDatabase) {}

  static fromSharedDb(db: SqliteDatabase): LarkIntegrationStore {
    return new LarkIntegrationStore(db);
  }

  getConfig(): LarkConfigRecord | null {
    const raw = this.db.getMeta(LARK_CONFIG_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LarkConfigRecord;
  }

  saveConfig(config: LarkConfigRecord): void {
    this.db.setMeta(LARK_CONFIG_KEY, JSON.stringify(config));
  }

  clearConfig(): void {
    this.db.setMeta(LARK_CONFIG_KEY, JSON.stringify({ status: 'unconfigured' }));
  }

  getWriteToken(): string {
    const existing = this.db.getMeta(WRITE_TOKEN_KEY);
    if (existing) return existing;
    const token = randomBytes(32).toString('hex');
    this.db.setMeta(WRITE_TOKEN_KEY, token);
    return token;
  }

  rotateWriteToken(): string {
    const token = randomBytes(32).toString('hex');
    this.db.setMeta(WRITE_TOKEN_KEY, token);
    return token;
  }
}
