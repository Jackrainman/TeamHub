import { describe, expect, test } from 'vitest';
import {
  SessionIdentitySchema,
  SetMemberRoleRequestSchema,
  SetupSuperAdminRequestSchema,
} from '../src/index.js';

/**
 * 权限地基契约单测（K1，minor bump）：SessionIdentity 快照 gateReviewer、成员角色写请求（三档枚举）、
 * 初始化管理员 PIN 请求（min4 max64）。红线：这些 schema 只带资格/角色字段，不引入任何按人聚合维度。
 */

describe('SessionIdentitySchema：role 必填 + gateReviewer optional 快照', () => {
  const base = {
    memberId: 'm-ecB',
    displayName: '电控B',
    groupId: 'grp-ec',
    role: 'member' as const,
  };

  test('省略 gateReviewer 合法（旧会话 / 非验收人视同 false）', () => {
    const parsed = SessionIdentitySchema.parse(base);
    expect(parsed.gateReviewer).toBeUndefined();
    expect(parsed.role).toBe('member');
  });

  test('gateReviewer 布尔快照 + 三档 role 均可解析', () => {
    expect(SessionIdentitySchema.parse({ ...base, gateReviewer: true }).gateReviewer).toBe(true);
    expect(SessionIdentitySchema.parse({ ...base, role: 'superAdmin' }).role).toBe('superAdmin');
    expect(SessionIdentitySchema.parse({ ...base, role: 'groupAdmin' }).role).toBe('groupAdmin');
  });

  test('缺 role → 拒绝；未知 role → 拒绝', () => {
    const noRole = { memberId: 'm-ecB', displayName: '电控B', groupId: 'grp-ec' };
    expect(SessionIdentitySchema.safeParse(noRole).success).toBe(false);
    expect(SessionIdentitySchema.safeParse({ ...base, role: 'owner' }).success).toBe(false);
  });
});

describe('SetMemberRoleRequestSchema：三档角色枚举', () => {
  test('三档均合法', () => {
    for (const role of ['superAdmin', 'groupAdmin', 'member'] as const) {
      expect(SetMemberRoleRequestSchema.parse({ role }).role).toBe(role);
    }
  });

  test('未知角色 / 缺字段 → 拒绝', () => {
    expect(SetMemberRoleRequestSchema.safeParse({ role: 'root' }).success).toBe(false);
    expect(SetMemberRoleRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('SetupSuperAdminRequestSchema：PIN min4 max64', () => {
  test('4–64 位合法；<4 拒绝；>64 拒绝；缺 pin 拒绝', () => {
    expect(SetupSuperAdminRequestSchema.safeParse({ pin: '1234' }).success).toBe(true);
    expect(SetupSuperAdminRequestSchema.safeParse({ pin: 'x'.repeat(64) }).success).toBe(true);
    expect(SetupSuperAdminRequestSchema.safeParse({ pin: '123' }).success).toBe(false);
    expect(SetupSuperAdminRequestSchema.safeParse({ pin: 'x'.repeat(65) }).success).toBe(false);
    expect(SetupSuperAdminRequestSchema.safeParse({}).success).toBe(false);
  });
});
