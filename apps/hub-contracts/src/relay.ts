import { z } from 'zod';
import { canBoardResource, RelayHandoffSchema } from './governance.js';
import type { RelayHandoff } from './governance.js';
import type { ScheduleSnapshot } from './schedule.js';

/**
 * 接力交接画布的派生层（R1，纯函数、无 IO、可单测；D-029）。
 *
 * 「队长可编辑的接力画布」读侧真相：把某个 windowLabel 已确认的占用窗口压成
 * 一排可拖排序的卡片（RelayStage），再叠上队长拉的接力交接线（RelayHandoff）。
 * 所有人看同一块。独立依赖图页 DepGraphPage 不动——接力交接 ≠ 任务依赖。
 *
 * 反监视红线（必须守，结构性钉死）：RelayStage / 本文件任何返回体
 * **绝不**含 memberId / invitedMemberIds / 出勤计数。主键只 session / 资源 / 组 / 任务。
 */

/**
 * 接力一站（看板卡片，组键，无人维度）：一张 = 一条已确认 ResourceSession。
 * displayCode 走机器人编号回退链（displayCode ?? name ?? id）；groupName / taskLabel 同理查表回退。
 * boardable = 该资源当前状态能否上场（canBoardResource）；不可上时画布把这站标灰但仍展示。
 */
export const RelayStageSchema = z.object({
  sessionId: z.string().min(1),
  resourceId: z.string().min(1),
  displayCode: z.string().min(1), // 机器人编号 26R1，无则回退 name / id
  groupId: z.string().min(1), // 组键（反排名核心，无 memberId）
  groupName: z.string().min(1),
  taskLabel: z.string().min(1).nullable(), // 关联任务标题，无则 null
  orderInWindow: z.number().int().nonnegative(), // 画布内拖动排序的先后
  eta: z.string().min(1).nullable(), // 队长可选填的预估完成时间
  boardable: z.boolean(), // 该资源当前能否上场（canBoardResource）
  statusReason: z.string().min(1).nullable(), // 机器人状态自由注释（"撞坏底盘"），无则 null
});

export type RelayStage = z.infer<typeof RelayStageSchema>;

/** 接力画布读视图：一排站 + 站间交接线。 */
export interface RelayBoard {
  stages: RelayStage[];
  handoffs: RelayHandoff[];
}

/**
 * GET /api/relay?windowLabel= 读响应（R1 接力画布读视图）：一排接力站（RelayStage）+ 站间交接线。
 * 由 deriveRelayBoard 纯函数派生（无 IO）。handoffs 经读边界**剥 confirmedBy**（I0：ActorRef 永不过边界）。
 * **反监视红线**：stages / handoffs 任何字段都无 memberId / invitedMemberIds / 出勤计数——
 * RelayStageSchema 结构上无人维度，RelayHandoff 剥 confirmedBy 后亦无人键。
 * （原住 pm-requests.ts，step1 迁回接力本域以剪 pm-requests→relay 跨域环。）
 */
export const RelayBoardResponseSchema = z.object({
  stages: z.array(RelayStageSchema),
  handoffs: z.array(RelayHandoffSchema.omit({ confirmedBy: true })),
});

export type RelayBoardResponse = z.infer<typeof RelayBoardResponseSchema>;

function indexBy<T>(items: T[], key: (item: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) map.set(key(item), item);
  return map;
}

/**
 * 派生某窗口的接力画布。
 *
 * stages：取 windowLabel 匹配且 **confirmedBy != null**（仅已确认窗口上画布）的 session，
 *   按 (resources 顺序, orderInWindow) 排序——同机器人的接力先后靠 orderInWindow，
 *   跨机器人按资源在 snapshot.resources 里的登记顺序，得到确定性排版。
 * handoffs：relayHandoffs 里 windowLabel 匹配的全部交接线（先后交接，**非**任务依赖）。
 *
 * 全程无成员维度：RelayStage 主键只 session / 资源 / 组 / 任务。
 */
export function deriveRelayBoard(
  snapshot: ScheduleSnapshot,
  windowLabel: string,
): RelayBoard {
  const resourcesById = indexBy(snapshot.resources, (r) => r.id);
  const groupsById = indexBy(snapshot.groups, (g) => g.id);
  const tasksById = indexBy(snapshot.tasks, (t) => t.id);
  // 资源登记顺序 → 跨机器人排版的确定性键。
  const resourceOrder = new Map<string, number>();
  snapshot.resources.forEach((r, i) => resourceOrder.set(r.id, i));

  const stages: RelayStage[] = snapshot.resourceSessions
    .filter((s) => s.windowLabel === windowLabel && s.confirmedBy !== null)
    .map((session) => {
      const resource = resourcesById.get(session.resourceId);
      const group = groupsById.get(session.holderGroupId);
      const task = session.holderTaskId
        ? tasksById.get(session.holderTaskId)
        : undefined;
      return {
        sessionId: session.id,
        resourceId: session.resourceId,
        displayCode:
          resource?.displayCode ?? resource?.name ?? session.resourceId,
        groupId: session.holderGroupId,
        groupName: group?.name ?? session.holderGroupId,
        taskLabel: task?.title ?? null,
        orderInWindow: session.orderInWindow,
        eta: session.eta,
        boardable: resource ? canBoardResource(resource.status) : false,
        statusReason: resource?.statusReason ?? null,
      };
    })
    .sort((a, b) => {
      const ra = resourceOrder.get(a.resourceId) ?? Number.MAX_SAFE_INTEGER;
      const rb = resourceOrder.get(b.resourceId) ?? Number.MAX_SAFE_INTEGER;
      return ra - rb || a.orderInWindow - b.orderInWindow;
    });

  const handoffs = snapshot.relayHandoffs.filter(
    (h) => h.windowLabel === windowLabel,
  );

  return { stages, handoffs };
}
