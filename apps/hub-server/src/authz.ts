import type { Member } from '@teamhub/hub-contracts';

/**
 * 名单/角色鉴权 helper（库里首个「按名单」授权先例——体检报告 ②-2/D6，2026-07-15）。
 *
 * 此前全库零「按名单/角色」鉴权（PIN 路由那次只是本人自我核对，非名单）。GATE-CHECKLIST-IOU 的
 * 豁免权（waived）与 TASK-POST-CLAIM 的组长确认都从零起步、且逻辑同形（「actor 在某名单里吗」→
 * 是则放行、否则 403），故按体检 D6 收进本文件共用，防同一逻辑两处各写走样。
 *
 * **phase 2 已兑现（TASK-POST-CLAIM，D-088）**：下方并列新增 `isGroupLeadOf(members, memberId, groupId)`
 * （`role==='groupAdmin' && groupId===task.groupId`，体检 ①/②-1 裁定「不给 Group 加 leadMemberId」）——
 * 两刀共用一处鉴权基元、同一「布尔条件 + 403」范式（照 server.ts:638 PIN 路由内嵌先例）。
 */

/**
 * 该成员是否在「门验收人名单」上（GATE-CHECKLIST-IOU，D-087 拍板②/③）：有权书面豁免欠条（waived）
 * + 门验收兜底。名单 = `Member.gateReviewer` 布尔位（验收人=大三，每年换届更新，gate-checklist-iou.md §3）。
 *
 * **I0**：只回一个布尔资格判定，绝不做任何按人聚合/排行/按人筛选（本 helper 只在写路由做「这一个人能不能
 * 豁免」的授权门，不派生名单视图）。`memberId` 不存在名册 / 未设 gateReviewer → false（fail-closed，
 * 无资格默认拒绝）。
 */
export function isGateReviewer(members: readonly Member[], memberId: string): boolean {
  return members.find((m) => m.id === memberId)?.gateReviewer === true;
}

/**
 * 该成员是否为某组的组长（TASK-POST-CLAIM 指派 / 跨组确认鉴权，D-088 / 体检 D6 phase 2 兑现）：
 * `role==='groupAdmin' && groupId===该组`。体检 ①/②-1 裁定「不给 Group 加 leadMemberId」——组长身份由
 * `MemberRole==='groupAdmin'` + `Member.groupId` 直接判出，无需新字段（`superAdmin` 不算某组组长，
 * 只有本组 groupAdmin 才是）。与 `isGateReviewer` 同居本文件、同「布尔条件 + 403」范式。
 *
 * **I0**：只回一个布尔资格判定，绝不做任何按人聚合/排行/按人筛选（本 helper 只在写路由做「这一个人是不是
 * 该组组长」的授权门，不派生名单视图）。`memberId` 不在名册 / 非 groupAdmin / 组不匹配 → false
 * （fail-closed，无资格默认拒绝）。
 */
export function isGroupLeadOf(
  members: readonly Member[],
  memberId: string,
  groupId: string,
): boolean {
  const member = members.find((m) => m.id === memberId);
  return member?.role === 'groupAdmin' && member.groupId === groupId;
}

/**
 * 该成员是否为超级管理员（K1 权限地基）：`role==='superAdmin'`。全库敏感写门（改角色 / 验收人名单维护 /
 * 建赛季）的鉴权基元——**身份模式**下只有 superAdmin 能过这些门（否则 403），**匿名模式**各门跳过本判定
 * （宿主级写门即可，演示态零门槛）。与 isGateReviewer/isGroupLeadOf 同居本文件、同「布尔条件 + 403」范式。
 *
 * **I0**：只回一个布尔资格判定，绝不做任何按人聚合/排行/按人筛选（本 helper 只在写路由做「这一个人是不是
 * 超级管理员」的授权门，不派生名单视图）。`memberId` 不在名册 / 非 superAdmin → false（fail-closed，
 * 无资格默认拒绝）。
 */
export function isSuperAdmin(members: readonly Member[], memberId: string): boolean {
  return members.find((m) => m.id === memberId)?.role === 'superAdmin';
}
