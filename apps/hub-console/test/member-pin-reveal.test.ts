import { describe, expect, test } from 'vitest';
import type { PageIdentityCtx } from '../src/console-pages';
import { canShowMemberPin } from '../src/features/settings/SettingsPage';
import { translations } from '../src/i18n/translations';

/**
 * 成员与权限页 刀⑧ 三件套纯数据单测——不测 DOM/RTL（「测逻辑不测 DOM」风格同 bootstrap-gate.test.ts）：
 *  - ②「显示PIN」按钮可见性判定 canShowMemberPin：仅身份模式 + 已登录 +（本人行 或 持旗管理员）；
 *  - ① 验收人只读徽标 + ② 显示PIN 相关 i18n 键 zh/en 双语齐全。
 */

function ctx(partial: Partial<PageIdentityCtx>): PageIdentityCtx {
  return { mode: 'anonymous', session: null, isLoading: false, canWrite: true, ...partial };
}

const SELF = {
  memberId: 'm-a',
  displayName: '本人',
  groupId: 'grp-ec',
  role: 'member' as const,
};

describe('canShowMemberPin（显示PIN 按钮可见性，服务端 403 兜底之上层的 UI 判定）', () => {
  test('匿名模式恒 false（端点 404、无身份概念）', () => {
    expect(canShowMemberPin(ctx({ mode: 'anonymous' }), 'm-a')).toBe(false);
  });

  test('身份模式未登录 → false', () => {
    expect(canShowMemberPin(ctx({ mode: 'identity', session: null, canWrite: false }), 'm-a')).toBe(
      false,
    );
  });

  test('本人行 → true；普通成员看他人行 → false', () => {
    const identity = ctx({ mode: 'identity', session: SELF });
    expect(canShowMemberPin(identity, 'm-a')).toBe(true);
    expect(canShowMemberPin(identity, 'm-b')).toBe(false);
  });

  test('持旗管理员看他人行 → true', () => {
    const identity = ctx({
      mode: 'identity',
      session: { ...SELF, projectManager: true },
    });
    expect(canShowMemberPin(identity, 'm-b')).toBe(true);
  });
});

describe('刀⑧ i18n 键 zh/en 双语齐全', () => {
  test('验收人只读徽标 + 显示PIN 五键', () => {
    const keys = [
      'settings.reviewers.badge.auto',
      'settings.members.showPin',
      'settings.members.showPin.hide',
      'settings.members.showPin.revealed',
      'settings.members.showPin.unset',
      'settings.members.showPin.error',
    ] as const;
    for (const key of keys) {
      expect(translations.zh[key]).toBeTruthy();
      expect(translations.en[key]).toBeTruthy();
    }
    // 旧手勾交互键已随 checkbox 一并删除
    expect('settings.reviewers.toggle' in translations.zh).toBe(false);
    expect('settings.reviewers.toggle' in translations.en).toBe(false);
  });
});
