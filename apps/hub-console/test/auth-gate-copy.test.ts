import { describe, expect, test } from 'vitest';
import { translations } from '../src/i18n/translations';

/**
 * AUTH-GATE（公网加固 + PIN 升级密码）console 侧 i18n 键双语齐全：
 * 整屏登录闸 / 首登强制设密码闸 / 重置密码文案；「显示PIN」键随明文副本机制删除。
 */
const KEYS = [
  'identity.gate.title',
  'identity.gate.subtitle',
  'identity.gate.membersError',
  'identity.pinGate.title',
  'identity.pinGate.desc',
  'identity.pinGate.field',
  'identity.pinGate.confirm',
  'identity.pinGate.mismatch',
  'identity.pinGate.submit',
  'identity.pinGate.submitting',
  'identity.pinGate.error',
  'settings.members.resetPin',
] as const;

describe('AUTH-GATE i18n', () => {
  test('闸门与重置密码文案 zh/en 齐全', () => {
    for (const key of KEYS) {
      expect(translations.zh[key], `zh ${key}`).toBeTruthy();
      expect(translations.en[key], `en ${key}`).toBeTruthy();
    }
  });

  test('「显示PIN」键已删除（明文副本机制撤销）', () => {
    const zh = translations.zh as Record<string, string>;
    const en = translations.en as Record<string, string>;
    for (const key of Object.keys(zh)) {
      expect(key.startsWith('settings.members.showPin'), key).toBe(false);
    }
    for (const key of Object.keys(en)) {
      expect(key.startsWith('settings.members.showPin'), key).toBe(false);
    }
  });

  test('密码强度文案：zh 密码+至少 8 位；en password+8', () => {
    expect(translations.zh['identity.pinGate.desc']).toContain('至少 8 位');
    expect(translations.zh['identity.login.pinPlaceholder']).toContain('密码');
    expect(translations.en['identity.pinGate.field']).toContain('8');
  });
});
