import {
  deriveBlockAttributions,
  toDepGraphView,
  type GovernanceSnapshot,
} from './attribution.js';
import type {
  Dependency,
  DepNodeKnowledge,
  PresenceMode,
  PresenceReason,
  PresenceRecommendation,
  ResourceSession,
  SharedResource,
  Task,
} from './governance.js';

/**
 * 差异化在场排班的纯派生函数（无 IO、可单测；D-029）。
 *
 * 输入 = 治理真相快照 + 共享资源 + 占用窗口（队长一拍即录）。
 * 输出 = 按"组 × 窗口"派生的在场建议（present/onCall/free）。
 *
 * 反排名结构保证：PresenceRecommendation 主键是 group/resource/task，
 * **没有 memberId 维度、没有对人出勤计数**；差异化由"依赖位置 + 资源状态"自动落出，
 * 不手排、不评人。与该资源 / 持有任务无任何依赖关系的组 → 不产生建议（沉默，A4）。
 */
export interface ScheduleSnapshot extends GovernanceSnapshot {
  resources: SharedResource[];
  resourceSessions: ResourceSession[];
}

function indexBy<T>(items: T[], key: (item: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) map.set(key(item), item);
  return map;
}

/** 只走 active + 已确认（confirmedBy 非空）的边，aiSuggested 未确认不参与（C4）。 */
function isLiveEdge(dep: Dependency): boolean {
  return dep.status === 'active' && dep.confirmedBy !== null;
}

/** 沿 DAG 反向收集 holderTask 的全部 live 未完成上游任务 id。 */
function upstreamLiveTaskIds(
  holderTaskId: string,
  tasksById: Map<string, Task>,
  liveDeps: Dependency[],
): Set<string> {
  const result = new Set<string>();
  const visited = new Set<string>([holderTaskId]);
  const queue: string[] = [holderTaskId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const dep of liveDeps) {
      if (dep.toTaskId !== current) continue;
      const from = tasksById.get(dep.fromTaskId);
      if (!from || from.status === 'done' || visited.has(from.id)) continue;
      visited.add(from.id);
      result.add(from.id);
      queue.push(from.id);
    }
  }
  return result;
}

interface PresenceAcc {
  mode: PresenceMode;
  reason: PresenceReason;
  resourceId: string | null;
  holderTaskLabel: string | null;
  orderInWindow: number | null;
}

const MODE_RANK: Record<PresenceMode, number> = {
  present: 3,
  onCall: 2,
  free: 1,
};

function renderFact(
  acc: PresenceAcc,
  groupName: string,
  resourceName: string | null,
  statusReason: string | null,
): string {
  switch (acc.reason) {
    case 'holdsResource':
      return `${groupName}组本窗在场：持有「${resourceName ?? '实车'}」做「${acc.holderTaskLabel ?? '联调'}」。`;
    case 'upstreamOnCall':
      return `${groupName}组本窗随叫：其任务在「${acc.holderTaskLabel ?? '联调'}」上游链上仍在推进，可能临时需要。`;
    case 'blockedFree':
      return `${groupName}组本窗可不在场：相关任务被上游卡住、本窗无法推进，这段时间可看相关资料。`;
    case 'resourceDown':
      return `${groupName}组本窗可不在场：「${resourceName ?? '实车'}」${statusReason ?? '不可用'}，依赖它的工作整片暂停。`;
  }
}

/**
 * 派生某窗口的在场建议。
 *
 * 规则（MVP 启发式，精确化留 D-029 open）：
 * 1. 持有该窗口资源的组 → present（接力则多组，各带 orderInWindow）。
 * 2. 持有任务的 live 未完成上游组 → onCall（若该组上游任务全是 blockedIdle 则降为 free）。
 * 3. 被卡而空闲（blockedIdle）的组 → free，挂"这段时间可以看的资料"。
 * 4. 资源 down/upgrading → holder + 所有 require 它（robotTarget 对齐）的组 → free(resourceDown)。
 * 5. 与窗口资源 / 持有任务无关的组 → 不产生建议（沉默）。
 * 优先级 present > onCall > free（同组跨 session 取最高）。
 */
export function derivePresenceSchedule(
  snapshot: ScheduleSnapshot,
  now: string,
  windowLabel: string,
): PresenceRecommendation[] {
  const tasksById = indexBy(snapshot.tasks, (t) => t.id);
  const groupsById = indexBy(snapshot.groups, (g) => g.id);
  const resourcesById = indexBy(snapshot.resources, (r) => r.id);
  const liveDeps = snapshot.dependencies.filter(isLiveEdge);

  const blockedIdleTaskIds = new Set(
    deriveBlockAttributions(snapshot, now).map((a) => a.idleTaskId),
  );
  const depView = toDepGraphView(snapshot, now);
  const nodeById = indexBy(depView.nodes, (n) => n.id);

  const sessions = snapshot.resourceSessions
    .filter((s) => s.windowLabel === windowLabel && s.confirmedBy !== null)
    .sort((a, b) => a.orderInWindow - b.orderInWindow);

  const byGroup = new Map<string, PresenceAcc>();
  const upgrade = (groupId: string, cand: PresenceAcc): void => {
    const prev = byGroup.get(groupId);
    if (!prev || MODE_RANK[cand.mode] > MODE_RANK[prev.mode]) {
      byGroup.set(groupId, cand);
    }
  };

  for (const session of sessions) {
    const resource = resourcesById.get(session.resourceId);
    const holderTask = session.holderTaskId
      ? tasksById.get(session.holderTaskId)
      : undefined;
    const holderTaskLabel = holderTask?.title ?? null;

    // 资源 down/upgrading：整片下游今晚作罢（车撞坏全卡）。
    if (resource && (resource.status === 'down' || resource.status === 'upgrading')) {
      const affected = new Set<string>([session.holderGroupId]);
      for (const task of snapshot.tasks) {
        if (task.robotTarget === resource.robotTarget && task.status !== 'done') {
          affected.add(task.groupId);
        }
      }
      for (const groupId of affected) {
        upgrade(groupId, {
          mode: 'free',
          reason: 'resourceDown',
          resourceId: session.resourceId,
          holderTaskLabel: null,
          orderInWindow: null,
        });
      }
      continue;
    }

    // 持有组 → present。
    upgrade(session.holderGroupId, {
      mode: 'present',
      reason: 'holdsResource',
      resourceId: session.resourceId,
      holderTaskLabel,
      orderInWindow: session.orderInWindow,
    });

    if (!holderTask) continue;

    // 上游组：有任一非 blockedIdle 上游任务 → onCall；否则（全被卡）→ free。
    const upstream = upstreamLiveTaskIds(holderTask.id, tasksById, liveDeps);
    const groupHasActiveUpstream = new Map<string, boolean>();
    for (const taskId of upstream) {
      const task = tasksById.get(taskId);
      if (!task || task.groupId === session.holderGroupId) continue;
      const active = !blockedIdleTaskIds.has(taskId);
      groupHasActiveUpstream.set(
        task.groupId,
        (groupHasActiveUpstream.get(task.groupId) ?? false) || active,
      );
    }
    for (const [groupId, hasActive] of groupHasActiveUpstream) {
      upgrade(
        groupId,
        hasActive
          ? {
              mode: 'onCall',
              reason: 'upstreamOnCall',
              resourceId: session.resourceId,
              holderTaskLabel,
              orderInWindow: null,
            }
          : {
              mode: 'free',
              reason: 'blockedFree',
              resourceId: null,
              holderTaskLabel: null,
              orderInWindow: null,
            },
      );
    }
  }

  const recs: PresenceRecommendation[] = [];
  for (const [groupId, acc] of byGroup) {
    const groupName = groupsById.get(groupId)?.name ?? groupId;
    const resource = acc.resourceId ? resourcesById.get(acc.resourceId) : undefined;

    // blockedFree 挂该组被卡任务的"可看的资料"（复用 DepGraph 已派生的 relatedKnowledge）。
    let relatedKnowledge: DepNodeKnowledge[] = [];
    if (acc.reason === 'blockedFree') {
      for (const taskId of blockedIdleTaskIds) {
        const task = tasksById.get(taskId);
        if (task?.groupId !== groupId) continue;
        const node = nodeById.get(taskId);
        if (node) relatedKnowledge = relatedKnowledge.concat(node.relatedKnowledge);
      }
    }

    recs.push({
      id: `presc-${windowLabel}-${groupId}`,
      windowLabel,
      groupId,
      mode: acc.mode,
      resourceId: acc.resourceId,
      holderTaskLabel: acc.holderTaskLabel,
      orderInWindow: acc.orderInWindow,
      reason: acc.reason,
      factStatement: renderFact(
        acc,
        groupName,
        resource?.name ?? null,
        resource?.statusReason ?? null,
      ),
      relatedKnowledge,
      detectedBy: 'derived',
      detectedAt: now,
    });
  }

  // 确定性排序：present → onCall → free，再按 groupId。
  recs.sort(
    (a, b) =>
      MODE_RANK[b.mode] - MODE_RANK[a.mode] || a.groupId.localeCompare(b.groupId),
  );
  return recs;
}
