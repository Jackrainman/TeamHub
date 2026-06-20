import type {
  CreateResourceSessionRequest,
  ResourceSession,
} from '@teamhub/hub-contracts';

/**
 * 「沿用上一天计划」把上一天的一条占用窗口结转为目标日期的「加一棒」请求（纯函数）。
 *
 * **I0 反监视结构 guard 落点**：只取 机器人 / 项目 / 组 / 任务 / 接力序，windowLabel 换成目标日期；
 * 三处刻意清空、绝不跨日带：
 *  - `invitedMemberIds` 恒 `[]`——源 session 即便带「本窗操作名单」（`GET /api/resource-sessions`
 *    读视图 I0 许可其存在），也**绝不**跨日结转，杜绝把成员维度带进新一天。
 *  - `eta` 恒 `null`——昨天的预估完成时间今天无意义。
 *  - `note` 恒 `null`——上一天的临时备注不沿用。
 * `confirmedBy` 由调用方传入（人点即拍板，console actor）。handoffs 不在此结转（接力线当天临时拉）。
 */
export function buildCarryOverDraft(
  session: ResourceSession,
  targetWindowLabel: string,
  confirmedBy: CreateResourceSessionRequest['confirmedBy'],
): CreateResourceSessionRequest {
  return {
    projectId: session.projectId,
    resourceId: session.resourceId,
    windowLabel: targetWindowLabel,
    orderInWindow: session.orderInWindow,
    holderGroupId: session.holderGroupId,
    holderTaskId: session.holderTaskId,
    invitedMemberIds: [],
    note: null,
    eta: null,
    confirmedBy,
  };
}
