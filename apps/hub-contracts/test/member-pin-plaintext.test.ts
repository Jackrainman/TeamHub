import { describe, expect, test } from 'vitest';
import {
  MemberPinResponseSchema,
  MemberPublicSchema,
  MemberSchema,
} from '../src/index.js';

/**
 * pinPlaintext 明文副本契约（打磨轮刀⑧②，2026-07-25 用户拍板的密钥纪律例外）：
 *  - MemberSchema 收 optional pinPlaintext（≥4 位；旧落盘无此字段照常加载）；
 *  - MemberPublicSchema 照 pinHash 同法剥离（zod parse 默认剥未知键，读边界双字段皆不过）；
 *  - MemberPinResponseSchema = { pin }（GET /api/members/:id/pin 唯一透出口）。
 */

const BASE_MEMBER = {
  id: 'm-x',
  displayName: '某人',
  role: 'member',
  grade: 'junior',
  groupId: 'grp-ec',
  status: 'idle',
  currentTaskId: null,
  updatedBy: 'console',
  updatedAt: '2026-07-25T00:00:00.000Z',
} as const;

describe('MemberSchema.pinPlaintext', () => {
  test('optional：旧落盘（无 pinPlaintext/pinHash）照常加载；带双字段也加载', () => {
    expect(MemberSchema.safeParse(BASE_MEMBER).success).toBe(true);
    const withPin = MemberSchema.parse({
      ...BASE_MEMBER,
      pinHash: 'scrypt:aa:bb',
      pinPlaintext: '1234',
    });
    expect(withPin.pinPlaintext).toBe('1234');
    expect(withPin.pinHash).toBe('scrypt:aa:bb');
  });

  test('边界：pinPlaintext 少于 4 位拒收', () => {
    expect(MemberSchema.safeParse({ ...BASE_MEMBER, pinPlaintext: '123' }).success).toBe(false);
  });
});

describe('MemberPublicSchema 剥双字段（密钥纪律）', () => {
  test('parse 后 pinHash/pinPlaintext 皆不剩，其余字段保留', () => {
    const pub = MemberPublicSchema.parse({
      ...BASE_MEMBER,
      pinHash: 'scrypt:aa:bb',
      pinPlaintext: '1234',
      gateReviewer: true,
    });
    expect('pinHash' in pub).toBe(false);
    expect('pinPlaintext' in pub).toBe(false);
    expect(pub.gateReviewer).toBe(true);
    expect(JSON.stringify(pub)).not.toContain('scrypt:');
    expect(JSON.stringify(pub)).not.toContain('1234');
  });
});

describe('MemberPinResponseSchema（GET pin 唯一透出口）', () => {
  test('{ pin } 合法；缺 pin / 短于 4 位拒收', () => {
    expect(MemberPinResponseSchema.parse({ pin: '1234' })).toEqual({ pin: '1234' });
    expect(MemberPinResponseSchema.safeParse({}).success).toBe(false);
    expect(MemberPinResponseSchema.safeParse({ pin: '123' }).success).toBe(false);
  });
});
