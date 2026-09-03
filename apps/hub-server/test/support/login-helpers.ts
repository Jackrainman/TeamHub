import { governanceScenarioFixture } from '@teamhub/hub-contracts';

/**
 * AUTH-LOGIN-USERNAME 测试支撑：登录请求从 memberId 改为自输用户名（displayName）。
 * 各路由测试的 login 助手仍按 fixture memberId 语义书写，此处统一做 id → displayName 解析
 * （数据源 = 与 InMemoryPmRepository 同一个 governanceScenarioFixture，不产生第二份真相）。
 */
const USERNAME_BY_MEMBER_ID = new Map(
  governanceScenarioFixture.members.map((m) => [m.id, m.displayName]),
);

/** fixture memberId → 登录用户名（displayName）；未知 id 直接抛错（测试写错要响）。
 *  各测试自建名册里的非 fixture 成员（m-plain/m-boss 等）走 extra 传入。 */
export function usernameOf(memberId: string, extra?: Readonly<Record<string, string>>): string {
  const name = USERNAME_BY_MEMBER_ID.get(memberId) ?? extra?.[memberId];
  if (!name) throw new Error(`fixture 无此成员：${memberId}`);
  return name;
}

/** 各测试自建名册常见的非 fixture 成员 id → displayName（m-plain/m-boss 惯例）。 */
export const CUSTOM_TEST_USERNAMES: Readonly<Record<string, string>> = {
  'm-plain': '普通成员',
  'm-boss': '队长',
};
