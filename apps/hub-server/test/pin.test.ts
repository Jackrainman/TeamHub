import { describe, expect, test } from 'vitest';
import { hashPin, verifyPin } from '../src/identity/pin.js';

describe('PIN 散列（IDENTITY-LITE：scrypt + 随机盐 + 常量时间校验）', () => {
  test('hashPin 输出 scrypt:<saltHex>:<hashHex> 格式、不含明文', () => {
    const hash = hashPin('1234');
    const parts = hash.split(':');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe('scrypt');
    expect(parts[1]).toMatch(/^[0-9a-f]+$/); // saltHex
    expect(parts[2]).toMatch(/^[0-9a-f]+$/); // hashHex
    // 密钥纪律：散列串里绝不出现明文 PIN
    expect(hash).not.toContain('1234');
  });

  test('同一 PIN 两次散列盐不同、结果不同（随机盐生效）', () => {
    const a = hashPin('secret-pin');
    const b = hashPin('secret-pin');
    expect(a).not.toBe(b);
  });

  test('verifyPin：正确 PIN → true，错误 PIN → false', () => {
    const hash = hashPin('4321');
    expect(verifyPin('4321', hash)).toBe(true);
    expect(verifyPin('0000', hash)).toBe(false);
    expect(verifyPin('', hash)).toBe(false);
  });

  test('verifyPin fail-closed：格式非法 / 缺段 / 空散列一律 false，不抛错', () => {
    expect(verifyPin('1234', '')).toBe(false);
    expect(verifyPin('1234', 'notscrypt:aa:bb')).toBe(false);
    expect(verifyPin('1234', 'scrypt:aa')).toBe(false);
    expect(verifyPin('1234', 'scrypt::')).toBe(false);
    expect(verifyPin('1234', 'plaintext-pin')).toBe(false);
  });
});
