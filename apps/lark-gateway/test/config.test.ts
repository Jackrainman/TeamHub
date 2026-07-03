import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { ConfigSchema, loadConfigFrom } from '../src/config';

const REQUIRED_KEYS = {
  LARK_APP_ID: 'cli_xxx',
  LARK_APP_SECRET: 'secret_xxx',
  LARK_BOT_OPEN_ID: 'ou_xxx',
};

describe('ConfigSchema', () => {
  test('accepts a valid env-like object with required + defaults', () => {
    const parsed = ConfigSchema.safeParse(REQUIRED_KEYS);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.LARK_DOMAIN).toBe('feishu');
      expect(parsed.data.PROBEFLASH_SKILL_MODE).toBe('mock');
    }
  });

  test('rejects when LARK_APP_ID is missing', () => {
    const { LARK_APP_ID: _omit, ...rest } = REQUIRED_KEYS;
    const parsed = ConfigSchema.safeParse(rest);
    expect(parsed.success).toBe(false);
  });

  test('rejects when LARK_APP_SECRET is empty string', () => {
    const parsed = ConfigSchema.safeParse({
      ...REQUIRED_KEYS,
      LARK_APP_SECRET: '',
    });
    expect(parsed.success).toBe(false);
  });

  test('rejects unknown LARK_DOMAIN value', () => {
    const parsed = ConfigSchema.safeParse({
      ...REQUIRED_KEYS,
      LARK_DOMAIN: 'wechat',
    });
    expect(parsed.success).toBe(false);
  });

  test('rejects unknown PROBEFLASH_SKILL_MODE value', () => {
    const parsed = ConfigSchema.safeParse({
      ...REQUIRED_KEYS,
      PROBEFLASH_SKILL_MODE: 'gpt5',
    });
    expect(parsed.success).toBe(false);
  });

  test('accepts overridden LARK_DOMAIN=lark', () => {
    const parsed = ConfigSchema.safeParse({
      ...REQUIRED_KEYS,
      LARK_DOMAIN: 'lark',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.LARK_DOMAIN).toBe('lark');
  });

  // L6（code-audit-2026-06-14）入站信任边界字段：全部可选，未配置时保持现行为。
  test('L6 fields are optional and omitted → undefined (existing deployments unaffected)', () => {
    const parsed = ConfigSchema.safeParse(REQUIRED_KEYS);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.LARK_ALLOWED_TENANT_KEY).toBeUndefined();
      expect(parsed.data.LARK_ALLOWED_SENDER_IDS).toBeUndefined();
      expect(parsed.data.LARK_RATE_LIMIT_PER_MINUTE).toBeUndefined();
    }
  });

  test('coerces LARK_RATE_LIMIT_PER_MINUTE from env string to number', () => {
    const parsed = ConfigSchema.safeParse({
      ...REQUIRED_KEYS,
      LARK_RATE_LIMIT_PER_MINUTE: '30',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.LARK_RATE_LIMIT_PER_MINUTE).toBe(30);
  });

  test('rejects non-positive LARK_RATE_LIMIT_PER_MINUTE', () => {
    const parsed = ConfigSchema.safeParse({
      ...REQUIRED_KEYS,
      LARK_RATE_LIMIT_PER_MINUTE: '0',
    });
    expect(parsed.success).toBe(false);
  });

  test('accepts LARK_ALLOWED_SENDER_IDS as a comma-separated string', () => {
    const parsed = ConfigSchema.safeParse({
      ...REQUIRED_KEYS,
      LARK_ALLOWED_SENDER_IDS: 'ou_a,ou_b',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.LARK_ALLOWED_SENDER_IDS).toBe('ou_a,ou_b');
    }
  });
});

describe('loadConfigFrom', () => {
  test('returns parsed config when env has all required fields', () => {
    const cfg = loadConfigFrom(REQUIRED_KEYS);
    expect(cfg.LARK_APP_ID).toBe('cli_xxx');
    expect(cfg.PROBEFLASH_SKILL_MODE).toBe('mock');
  });

  test('throws with field-name details when env is invalid', () => {
    expect(() => loadConfigFrom({})).toThrow(/LARK_APP_ID/);
  });
});
