import { describe, expect, test } from 'vitest';
import type { MemberPublic, SessionIdentity } from '@teamhub/hub-contracts';
import {
  canWriteIdentity,
  defaultOwnerId,
  identityCacheKey,
  memberOptionLabel,
} from '../src/shared/lib/identity-utils';

// 轻身份登录（IDENTITY-LITE，I2 console 接线）纯函数单测——不测 DOM/RTL（本仓无 jsdom/RTL 依赖，
// 「测逻辑不测 DOM」风格同 theme.test.ts / console-pages.test.ts）。

const SESSION: SessionIdentity = {
  memberId: 'm-1',
  displayName: '张三',
  groupId: 'g-mech',
  role: 'member',
};

describe('identityCacheKey：queryKey 身份维度', () => {
  test('已登录 → memberId', () => {
    expect(identityCacheKey(SESSION)).toBe('m-1');
  });

  test('未登录 / 匿名模式（session=null）→ 归一 anon', () => {
    expect(identityCacheKey(null)).toBe('anon');
  });
});

describe('canWriteIdentity：写门', () => {
  test('匿名模式恒可写，即便 session 传了非 null 也不影响（不该发生但不炸）', () => {
    expect(canWriteIdentity('anonymous', null)).toBe(true);
    expect(canWriteIdentity('anonymous', SESSION)).toBe(true);
  });

  test('身份模式：已登录可写，未登录不可写', () => {
    expect(canWriteIdentity('identity', SESSION)).toBe(true);
    expect(canWriteIdentity('identity', null)).toBe(false);
  });
});

describe('defaultOwnerId：ownerId 表单默认值', () => {
  test('身份模式已登录 → 当前登录人 memberId', () => {
    expect(defaultOwnerId('identity', SESSION)).toBe('m-1');
  });

  test('身份模式未登录 → 空（不臆造默认值）', () => {
    expect(defaultOwnerId('identity', null)).toBe('');
  });

  test('匿名模式 → 恒空（沿用现状，即便碰巧带了 session）', () => {
    expect(defaultOwnerId('anonymous', null)).toBe('');
    expect(defaultOwnerId('anonymous', SESSION)).toBe('');
  });
});

describe('memberOptionLabel：成员选择器候选文案', () => {
  const members: MemberPublic[] = [
    {
      id: 'm-1',
      displayName: '张三',
      role: 'member',
      grade: 'sophomore',
      groupId: 'g-mech',
      status: 'idle',
      currentTaskId: null,
      updatedBy: 'console',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
  ];

  test('命中 → displayName', () => {
    expect(memberOptionLabel(members, 'm-1')).toBe('张三');
  });

  test('未命中（候选未加载完 / id 已失效）→ 原样回退 id，不炸', () => {
    expect(memberOptionLabel(members, 'm-ghost')).toBe('m-ghost');
    expect(memberOptionLabel([], 'm-1')).toBe('m-1');
  });
});
