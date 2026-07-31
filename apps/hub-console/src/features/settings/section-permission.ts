import type { PageIdentityCtx } from '../../console-pages';
import type { TranslationKey } from '../../i18n';

// 分区写权限判定（K8 复审留档 nit 收口 + MEMBER-PM-FLAG 刀②b）：区分「未登录」与「身份模式已登录但未持
// 项目管理旗标」两种锁态，各给对应说明（照 K2 前置资格判先例——写控件禁用 + 说明，不隐藏、保可发现性）。
// 匿名模式恒不锁（现状不变）。旗标吃会话快照（登录当刻定格），服务端敏感门另读实时名册。
export function sectionPermission(
  identity: PageIdentityCtx,
  t: (key: TranslationKey) => string,
): { writeLocked: boolean; adminLocked: boolean; lockHint: string | null } {
  const loggedOutLocked = !identity.canWrite;
  const adminLocked =
    identity.mode === 'identity' &&
    !!identity.session &&
    identity.session.projectManager !== true;
  const writeLocked = loggedOutLocked || adminLocked;
  const lockHint = loggedOutLocked
    ? t('identity.writeHint')
    : adminLocked
      ? t('settings.permission.adminOnly')
      : null;
  return { writeLocked, adminLocked, lockHint };
}
