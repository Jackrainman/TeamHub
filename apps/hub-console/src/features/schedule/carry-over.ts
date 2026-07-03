import type {
  CreateResourceSessionRequest,
  ResourceSession,
  TodayPlanSessionDraft,
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

/**
 * 「继续昨天」的表格版（D-082 §5 表格页）：与 `buildCarryOverDraft` 同一套 I0 guard（结转机器人/组/任务/
 * 接力序，`invitedMemberIds` 恒 `[]`、`eta`/`note` 恒 `null`），但产出 `TodayPlanSessionDraft[]`——未确认
 * 草稿，供表格预览/微调（`draftsToRows` 消费），而非直接可 POST 的 `CreateResourceSessionRequest`。
 * 两者并存、互不影响：画布上原有的「沿用上一天计划」按钮仍走 `buildCarryOverDraft` 直接写库；
 * 表格页的「继续昨天」走这个函数只铺草稿，落盘统一走【确认】→ POST /api/resource-sessions/batch。
 * `source` 恒 `'human'`（沿用即视为人工基线，同 `deriveTodayPlanFromPresets` 的定调）。
 */
export function buildCarryOverPlan(
  prevDaySessions: ResourceSession[],
  targetWindowLabel: string,
): TodayPlanSessionDraft[] {
  return prevDaySessions.map((session) => ({
    projectId: session.projectId,
    resourceId: session.resourceId,
    windowLabel: targetWindowLabel,
    orderInWindow: session.orderInWindow,
    holderGroupId: session.holderGroupId,
    holderTaskId: session.holderTaskId,
    invitedMemberIds: [],
    note: null,
    source: 'human',
    eta: null,
  }));
}
