import type { IdentityMode, MemberPublic, SessionIdentity } from '@teamhub/hub-contracts';

/**
 * 轻身份登录（IDENTITY-LITE，I2 console 接线）纯函数集——被 App.tsx / PmCreatePanel.tsx /
 * IdentityBar.tsx 共用，抽出来单测（不测 DOM/RTL，符合本仓「测逻辑不测 DOM」风格，同
 * theme.test.ts / console-pages.test.ts）。本文件不含任何 React / fetch，零副作用。
 */

/**
 * React Query queryKey 身份维度：当前登录人 memberId；未登录 / 匿名模式统一归一成 `'anon'`。
 * 供个人化查询（如总览）拼进 queryKey，使身份切换（登录/登出/换人）后天然落进不同缓存桶，
 * 不会读到切换前那个人缓存下的数据（product-redefine §9-②「queryKey 无身份维度」审计项）。
 */
export function identityCacheKey(session: SessionIdentity | null): string {
  return session?.memberId ?? 'anon';
}

/**
 * 写门：身份模式下必须登录才能写；匿名模式恒可写（今天的形态，零变化）。
 * 供各写表单算 `disabled` + 是否显示「登录后可写」提示。
 */
export function canWriteIdentity(
  mode: IdentityMode,
  session: SessionIdentity | null,
): boolean {
  return mode !== 'identity' || session !== null;
}

/**
 * 任务 ownerId 表单默认值：身份模式已登录 → 当前登录人（D-083 §4.2「ownerId 默认=当前登录人」）；
 * 匿名模式 / 身份模式未登录 → 空（沿用现状，不臆造默认值）。
 */
export function defaultOwnerId(
  mode: IdentityMode,
  session: SessionIdentity | null,
): string {
  return mode === 'identity' && session ? session.memberId : '';
}

/**
 * 成员选择器候选文案：memberId → displayName。候选未加载 / id 已失效（成员被删/改名前的旧值）→
 * 原样回退 id，不让选择器因数据竞态整段报错或吞掉已选值。
 */
export function memberOptionLabel(
  members: readonly MemberPublic[],
  id: string,
): string {
  return members.find((m) => m.id === id)?.displayName ?? id;
}
