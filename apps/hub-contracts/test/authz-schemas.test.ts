import { describe, expect, test } from 'vitest';
import {
  MemberSchema,
  SessionIdentitySchema,
  SetMemberRoleRequestSchema,
  SetProjectManagerRequestSchema,
  SetupSuperAdminRequestSchema,
} from '../src/index.js';

/**
 * 权限地基契约单测（K1 + MEMBER-PM-FLAG 公测补强刀②b）：SessionIdentity 快照 gateReviewer/projectManager、
 * 成员角色写请求（两档枚举）、项目管理旗标写请求、初始化管理员 PIN 请求（min4 max64）、旧数据
 * role:'superAdmin' 加载归一。红线：这些 schema 只带资格/角色字段，不引入任何按人聚合维度。
 */

describe('SessionIdentitySchema：role 必填 + gateReviewer/projectManager optional 快照', () => {
  const base = {
    memberId: 'm-ecB',
    displayName: '电控B',
    groupId: 'grp-ec',
    role: 'member' as const,
  };

  test('省略 gateReviewer / projectManager 合法（旧会话 / 无资格视同 false）', () => {
    const parsed = SessionIdentitySchema.parse(base);
    expect(parsed.gateReviewer).toBeUndefined();
    expect(parsed.projectManager).toBeUndefined();
    expect(parsed.role).toBe('member');
  });

  test('gateReviewer / projectManager 布尔快照 + 两档 role 均可解析', () => {
    expect(SessionIdentitySchema.parse({ ...base, gateReviewer: true }).gateReviewer).toBe(true);
    expect(SessionIdentitySchema.parse({ ...base, projectManager: true }).projectManager).toBe(true);
    expect(SessionIdentitySchema.parse({ ...base, role: 'groupAdmin' }).role).toBe('groupAdmin');
  });

  test('缺 role → 拒绝；未知 role（含旧 superAdmin 档）→ 拒绝', () => {
    const noRole = { memberId: 'm-ecB', displayName: '电控B', groupId: 'grp-ec' };
    expect(SessionIdentitySchema.safeParse(noRole).success).toBe(false);
    expect(SessionIdentitySchema.safeParse({ ...base, role: 'owner' }).success).toBe(false);
    expect(SessionIdentitySchema.safeParse({ ...base, role: 'superAdmin' }).success).toBe(false);
  });
});

describe('SetMemberRoleRequestSchema：两档角色枚举（MEMBER-PM-FLAG 收窄）', () => {
  test('两档均合法', () => {
    for (const role of ['groupAdmin', 'member'] as const) {
      expect(SetMemberRoleRequestSchema.parse({ role }).role).toBe(role);
    }
  });

  test('未知角色 / 旧 superAdmin 档 / 缺字段 → 拒绝', () => {
    expect(SetMemberRoleRequestSchema.safeParse({ role: 'root' }).success).toBe(false);
    expect(SetMemberRoleRequestSchema.safeParse({ role: 'superAdmin' }).success).toBe(false);
    expect(SetMemberRoleRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('SetProjectManagerRequestSchema：旗标布尔位', () => {
  test('true / false 均合法；非布尔 / 缺字段 → 拒绝', () => {
    expect(SetProjectManagerRequestSchema.parse({ projectManager: true }).projectManager).toBe(true);
    expect(SetProjectManagerRequestSchema.parse({ projectManager: false }).projectManager).toBe(
      false,
    );
    expect(SetProjectManagerRequestSchema.safeParse({ projectManager: 'yes' }).success).toBe(false);
    expect(SetProjectManagerRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('MemberSchema：旧数据 role:superAdmin 加载归一（MEMBER-PM-FLAG 双读兼容）', () => {
  const legacy = {
    id: 'm-old',
    displayName: '老队长',
    role: 'superAdmin', // v0.28 及更早落盘值
    grade: 'senior',
    groupId: 'grp-ec',
    status: 'idle',
    currentTaskId: null,
    updatedBy: 'console',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  test('role:superAdmin → projectManager:true + role:member（fail-closed 不误杀旧文件）', () => {
    const parsed = MemberSchema.parse(legacy);
    expect(parsed.role).toBe('member');
    expect(parsed.projectManager).toBe(true);
  });

  test('两档 role 原样通过；projectManager 缺省不补（optional）', () => {
    const member = MemberSchema.parse({ ...legacy, role: 'groupAdmin' });
    expect(member.role).toBe('groupAdmin');
    expect(member.projectManager).toBeUndefined();
  });
});

describe('SetupSuperAdminRequestSchema：密码 min8 max64（AUTH-GATE 升级）', () => {
  test('8–64 位合法；<8 拒绝；>64 拒绝；缺 pin 拒绝', () => {
    expect(SetupSuperAdminRequestSchema.safeParse({ pin: '1234abcd' }).success).toBe(true);
    expect(SetupSuperAdminRequestSchema.safeParse({ pin: 'x'.repeat(64) }).success).toBe(true);
    expect(SetupSuperAdminRequestSchema.safeParse({ pin: '1234567' }).success).toBe(false);
    expect(SetupSuperAdminRequestSchema.safeParse({ pin: 'x'.repeat(65) }).success).toBe(false);
    expect(SetupSuperAdminRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('SetPinRequestSchema：密码 min8（AUTH-GATE）', () => {
  test('<8 拒绝；≥8 合法', async () => {
    const { SetPinRequestSchema } = await import('../src/index.js');
    expect(SetPinRequestSchema.safeParse({ pin: '1234' }).success).toBe(false);
    expect(SetPinRequestSchema.safeParse({ pin: '12345678' }).success).toBe(true);
  });
});
