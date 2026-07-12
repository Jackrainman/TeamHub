import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * PIN 散列（IDENTITY-LITE，D-083 §4.2）。**密钥纪律**：绝不存明文，pinHash 走 `node:crypto` scrypt +
 * 每 PIN 独立随机盐；校验用常量时间比较（timingSafeEqual），杜绝按时序侧信道逐位猜 PIN。
 *
 * 存储格式（自描述、单字段落库进 Member.pinHash）：`scrypt:<saltHex>:<hashHex>`。
 * 家庭影院级威胁模型：小作坊内网、PIN 是「谁在写」的轻确认而非高价值密钥，scrypt 默认代价参数足够
 * （N=16384），不引第三方 KDF 依赖。
 */

const SCRYPT_KEYLEN = 64; // 派生密钥字节数
const SALT_BYTES = 16; // 每 PIN 随机盐字节数
const HASH_PREFIX = 'scrypt';

/** 明文 PIN → `scrypt:<saltHex>:<hashHex>`（随机盐，绝不回存明文）。 */
export function hashPin(pin: string): string {
  const salt = randomBytes(SALT_BYTES);
  const derived = scryptSync(pin, salt, SCRYPT_KEYLEN);
  return `${HASH_PREFIX}:${salt.toString('hex')}:${derived.toString('hex')}`;
}

/**
 * 常量时间校验：明文 PIN 是否匹配已存散列。格式非法 / 盐或散列缺失 / scrypt 抛错 → 一律 false
 * （fail-closed，绝不因解析异常放行）。派生长度对齐已存散列长度，再 timingSafeEqual。
 */
export function verifyPin(pin: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== HASH_PREFIX) return false;
  const [, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  if (salt.length === 0 || expected.length === 0) return false;
  let derived: Buffer;
  try {
    derived = scryptSync(pin, salt, expected.length);
  } catch {
    return false;
  }
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
