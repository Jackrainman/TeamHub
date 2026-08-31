import { z } from 'zod';
import {
  deriveBlockAttributions,
  toDepGraphView,
  type GovernanceSnapshot,
} from '../../attribution.js';
import { canBoardResource, RelayHandoffSchema } from './model.js';
import {
  CONVERGENCE_SCOPE_ALL_LEAF_GROUPS,
  CONVERGENCE_SENTINEL_GROUP_ID,
} from '../../pm-core.js';
import type {
  Dependency,
  DepNodeKnowledge,
  Group,
  Member,
  Task,
} from '../../pm-core.js';
import type {
  DefaultPreset,
  PresenceFeasibility,
  PresenceMode,
  PresenceReason,
  PresenceRecommendation,
  RelayHandoff,
  ResourceSession,
  SharedResource,
  WindowDef,
} from './model.js';
import type { MemberAvailability } from '../../growth.js';

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
  // 接力交接线（R1）：镜像 sessions，同走内存、不落盘（D-029）。先后交接，**非**任务依赖。
  relayHandoffs: RelayHandoff[];
}

/**
 * 在场容量上下文（S1，A2，optional 第 4 参）：
 * - availabilities = 成员私有课表（含 visibility，private 条目在派生时被跳过）。
 * - windowDefs = key 为 ResourceSession.id（精确锚定），value 为该窗实际占用的周内分钟段。
 * 未传或某 session 在 windowDefs 里查无锚定 → 该 rec 的 feasibility 保持 null，
 * 逻辑与现行三参路径 100% 一致。
 */
export interface AvailabilityContext {
  availabilities: MemberAvailability[];
  windowDefs: Map<string, WindowDef>;
}

/** 半开区间重叠：busy [s,e) 与 window [ws,we) 重叠 ⇔ s<we && ws<e（相邻不算冲突）。 */
function windowsOverlap(
  s: number,
  e: number,
  win: WindowDef,
): boolean {
  return s < win.endMin && win.startMin < e;
}

/**
 * 组级容量派生（S1，A2 红线核心）。
 *
 * 输入：成员私有课表 + **单个** windowDef + 成员名册（可选组树，本 MVP 不用）。
 * 输出：Map<groupId, capacity:int> —— **只产组级 headcount 整数**。
 *
 * 红线（结构 + 实现双重钉死）：
 * - **每次调用独立、只收单个 windowDef、不跨窗、不缓存任何按人计数**：签名上无法把
 *   "本周谁到场最少→多排谁"这类跨窗按人累计表达出来。绝不在此函数外维护 per-member 计数器。
 * - **绝不返回成员维度**：返回 Map<groupId,int>，无 memberId 列表、无谁忙谁闲、无 per-member 标志位。
 * - visibility==='private' 的成员条目**直接跳过**（不进任何聚合）；只有 'aggregateOnly'
 *   经本人授权才计入组级 headcount。无课表条目的成员视作不冲突（默认可参与）。
 * - 半开区间重叠判定（windowsOverlap），相邻窗（一个 10:00 结束、一个 10:00 开始）不误判。
 *
 * 注意：此函数应只喂 derivePresenceSchedule 内部消费，**绝不**被 server 路由直接回出
 *（类比 invitedMemberIds 绝不按人聚合回），否则等于泄漏个人课表派生明细。
 */
export function deriveGroupAvailability(
  availabilities: MemberAvailability[],
  windowDef: WindowDef,
  members: Member[],
  _groupsById?: Map<string, Group>,
): Map<string, number> {
  // visibility==='private' 直接剔除（A2：私有课表绝不进派生）；只留 aggregateOnly。
  const busyByMember = new Map<string, MemberAvailability>();
  for (const a of availabilities) {
    if (a.visibility === 'private') continue;
    busyByMember.set(a.memberId, a);
  }

  const capacity = new Map<string, number>();
  for (const m of members) {
    const avail = busyByMember.get(m.id);
    // 无授权课表 → 视作不冲突（默认可参与该窗）。
    let conflicts = false;
    if (avail) {
      for (const busy of avail.recurringBusy) {
        if (
          busy.dayOfWeek === windowDef.dayOfWeek &&
          windowsOverlap(busy.startMin, busy.endMin, windowDef)
        ) {
          conflicts = true;
          break;
        }
      }
    }
    if (conflicts) continue;
    // 只累组级整数：该组 +1。绝不记 memberId、绝不跨窗累计。
    capacity.set(m.groupId, (capacity.get(m.groupId) ?? 0) + 1);
  }
  return capacity;
}

function indexBy<T>(items: T[], key: (item: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) map.set(key(item), item);
  return map;
}

/**
 * 收敛哨兵组 id（PRESENCE-RECONCILE-LOCK 路线 C）：仅承载总联调收敛任务的归属，
 * 无成员、**绝不进派生在场输出**（render 循环显式跳过）、不算叶子组。
 * 常量单源已上提 `pm-core.ts`（CONVERGENCE-TASK-ENTRY，路由层校验同用）。
 */

/**
 * 叶子组派生（PRESENCE-RECONCILE-LOCK 决定）：组树中**没有子组的节点** = 叶子组，
 * 剔除收敛哨兵组（无成员、不进派生）。当前 fixture → [grp-mech, grp-circuit, grp-ec, grp-vision]
 * （grp-program 有子组 grp-ec/grp-vision 故非叶子；grp-convergence 是哨兵故剔除；
 * grp-mech/grp-circuit 虽是顶层但无子组 → 仍是叶子）。
 * 总联调（convergenceScope='allLeafGroups'）即「这些叶子组各到至少一人在场」。
 * 纯派生、不硬编码组数——未来给某叶子组加子组，它自动不再算叶子（期望行为）。
 */
export function deriveLeafGroups(groups: Group[]): string[] {
  // 有子组的节点 = 非叶子（某 group.parentGroupId 指向它）。
  const hasChildren = new Set(
    groups.map((g) => g.parentGroupId).filter((p): p is string => p !== null),
  );
  return groups
    .filter(
      (g) =>
        !hasChildren.has(g.id) && g.id !== CONVERGENCE_SENTINEL_GROUP_ID,
    )
    .map((g) => g.id);
}

/** 只走 active + 已确认（confirmedBy 非空）的边，aiSuggested 未确认不参与（C4）。 */
function isLiveEdge(dep: Dependency): boolean {
  return dep.status === 'active' && dep.confirmedBy !== null;
}

/**
 * 顶层大组祖先（汇报按大组）：沿 parentGroupId 上溯到根。
 * 电控 / 视觉 → 程序；电路 / 机械（本就顶层）→ 自身。环 / 缺失则停在当前。
 */
function topLevelGroupId(
  groupId: string,
  groupsById: Map<string, Group>,
): string {
  let current = groupId;
  const seen = new Set<string>([current]);
  for (;;) {
    const parent = groupsById.get(current)?.parentGroupId;
    if (!parent || seen.has(parent)) return current;
    seen.add(parent);
    current = parent;
  }
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
  // 组级容量护栏读数（S1）：仅在 ctx 锚定该 session 时计算，否则保持 null（默认）。
  feasibility: PresenceFeasibility | null;
}

const MODE_RANK: Record<PresenceMode, number> = {
  present: 3,
  onCall: 2,
  free: 1,
};

/**
 * 组级整数 → 容量护栏读数（S1）。**仅在 ctx 锚定时调用**，无数据时根本不进这里（保持 null）。
 * 阈值（0 冲突 / 1 紧 / ≥2 充裕）是占位启发式，精确边界留 D-029 open，不当已定论。
 * 这里读的是"组级 headcount 整数"，绝不是"谁有空"——无任何成员维度。
 */
function capacityFeasibility(capacity: number): PresenceFeasibility {
  if (capacity <= 0) return 'conflict';
  if (capacity === 1) return 'tight';
  return 'ample';
}

function renderFact(
  acc: PresenceAcc,
  groupName: string,
  resourceName: string | null,
  statusReason: string | null,
): string {
  switch (acc.reason) {
    case 'holdsResource':
      return `${groupName}组这天在场：用「${resourceName ?? '机器人'}」做${acc.holderTaskLabel ?? '联调'}。`;
    case 'upstreamOnCall':
      return `${groupName}组这天待命：${acc.holderTaskLabel ?? '联调'}还在做，可能随时叫你们，别走远。`;
    case 'blockedFree':
      return `${groupName}组这天不加班：你们的活被上游卡住、推不动；有空看看别人写的代码。`;
    case 'resourceDown':
      return `${groupName}组这天不加班：「${resourceName ?? '机器人'}」${statusReason ?? '用不了'}，相关的活今天都停。`;
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
  ctx?: AvailabilityContext,
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

    // 组级容量护栏读数（S1，A2）：仅当 ctx 存在且精确锚定该 session.id 才计算；
    // 否则 capacityByGroup=null → 所有 feasibility 保持 null（三参路径逐行不变）。
    // 每 session 独立计算单窗组级整数，**绝不**跨窗累计、绝不缓存按人计数。
    const windowDef = ctx?.windowDefs.get(session.id);
    const capacityByGroup =
      ctx && windowDef
        ? deriveGroupAvailability(
            ctx.availabilities,
            windowDef,
            snapshot.members,
            groupsById,
          )
        : null;
    const feasibilityFor = (groupId: string): PresenceFeasibility | null => {
      if (!capacityByGroup) return null;
      return capacityFeasibility(capacityByGroup.get(groupId) ?? 0);
    };

    // 机器人不可上（down/upgrading/repair/retired/disassembling）：整片下游今晚作罢（接力释放，D-072 §3.3）。
    // 读「该状态能否上场」而非硬编码状态名——新增维修/退役/拆解态自动纳入，无需改本分支。
    if (resource && !canBoardResource(resource.status)) {
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
          feasibility: feasibilityFor(groupId),
        });
      }
      continue;
    }

    // 持有组 → present。收敛任务（总联调，convergenceScope='allLeafGroups'）分流：
    //   真 → 所有叶子组各 present（全组各一人）；哨兵组 grp-convergence 本身不 upgrade（仅总联调日走这里）。
    //   假 → 仅持有组 present（原逻辑不变；平日今晚走这里）。
    if (holderTask?.convergenceScope === CONVERGENCE_SCOPE_ALL_LEAF_GROUPS) {
      for (const gid of deriveLeafGroups(snapshot.groups)) {
        upgrade(gid, {
          mode: 'present',
          reason: 'holdsResource',
          resourceId: session.resourceId,
          holderTaskLabel,
          orderInWindow: session.orderInWindow,
          feasibility: feasibilityFor(gid),
        });
      }
    } else {
      upgrade(session.holderGroupId, {
        mode: 'present',
        reason: 'holdsResource',
        resourceId: session.resourceId,
        holderTaskLabel,
        orderInWindow: session.orderInWindow,
        feasibility: feasibilityFor(session.holderGroupId),
      });
    }

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
              feasibility: feasibilityFor(groupId),
            }
          : {
              mode: 'free',
              reason: 'blockedFree',
              resourceId: null,
              holderTaskLabel: null,
              orderInWindow: null,
              feasibility: feasibilityFor(groupId),
            },
      );
    }
  }

  const recs: PresenceRecommendation[] = [];
  for (const [groupId, acc] of byGroup) {
    // 哨兵组不出排班建议：down 分支会经 t-r1-integration.groupId（=grp-convergence）混入 affected，
    // render 跳过是唯一拦截点（收敛分支本身不 upgrade 哨兵，但 down 分支按任务 groupId 聚合会带入）。
    if (groupId === CONVERGENCE_SENTINEL_GROUP_ID) continue;
    const groupName = groupsById.get(groupId)?.name ?? groupId;
    const resource = acc.resourceId ? resourcesById.get(acc.resourceId) : undefined;

    // blockedFree 挂该组被卡任务的"可看的资料"（复用 DepGraph 已派生的 relatedKnowledge）。
    // 跨 task 累积时按 URI 去重（镜像 attribution.ts relatedKnowledgeFor 的 seen-set 模式）：
    // 同一份资料可能挂在该组多个被卡任务上，不去重会在面板里重复显示同一条。
    const relatedKnowledge: DepNodeKnowledge[] = [];
    if (acc.reason === 'blockedFree') {
      const seenUris = new Set<string>();
      for (const taskId of blockedIdleTaskIds) {
        const task = tasksById.get(taskId);
        if (task?.groupId !== groupId) continue;
        const node = nodeById.get(taskId);
        if (!node) continue;
        for (const k of node.relatedKnowledge) {
          // uri 可空（如 person 类无链接）：仅对非空 uri 去重，空 uri 条目原样保留。
          if (k.uri !== null) {
            if (seenUris.has(k.uri)) continue;
            seenUris.add(k.uri);
          }
          relatedKnowledge.push(k);
        }
      }
    }

    recs.push({
      id: `presc-${windowLabel}-${groupId}`,
      windowLabel,
      groupId,
      reportingGroupId: topLevelGroupId(groupId, groupsById),
      mode: acc.mode,
      resourceId: acc.resourceId,
      holderTaskLabel: acc.holderTaskLabel,
      orderInWindow: acc.orderInWindow,
      reason: acc.reason,
      factStatement: renderFact(
        acc,
        groupName,
        // 显示机器人编号（displayCode 如 26R1），无则回退 name，让事实更具体（R2 文案）。
        resource?.displayCode ?? resource?.name ?? null,
        resource?.statusReason ?? null,
      ),
      relatedKnowledge,
      // 三参路径 acc.feasibility 恒为 null（ctx 未传）→ 与 schema .default(null) 解析结果一致，
      // 现行 fixture 输出 byte-for-byte 不变；仅 ctx 锚定时才为 ample/tight/conflict。
      feasibility: acc.feasibility,
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

/**
 * 「使用预设」铺今日计划的草稿形状（D-082）：对齐 ResourceSession 创建入参
 * （镜像 `pm-requests.ts` 的 `CreateResourceSessionRequestSchema` = Omit id/source/createdAt），
 * 但**不含 `confirmedBy`**——这一层只产生"未确认草稿"，供表格页预览/微调；`confirmedBy` 由队长
 * 点【确认】时随批量落盘请求一并给出（下一阶段 server `POST /api/resource-sessions/batch` 消费）。
 * `source` 恒 `'human'`（队长一键铺即视为人工基线，同 buildCarryOverDraft 的定调）。
 */
export type TodayPlanSessionDraft = Omit<
  ResourceSession,
  'id' | 'createdAt' | 'confirmedBy'
>;

/**
 * 「使用预设」(D-082 daily-plan-presets §4.2/§6)：按每车 `defaultPreset.lineup` 一键铺出今天的
 * 占用窗口草稿（纯函数，零副作用，不落盘、不产生 id）。
 *
 * 规则：
 * - 只遍历**可上场**车（`canBoardResource`，非维修/退役/拆解）且带 `defaultPreset` 的车；
 *   跳过不可上场车与未设预设的车（沉默，同 derivePresenceSchedule 的"无关不产生建议"风格）。
 * - 每条 `lineup` entry → 一条 session 草稿：`resourceId`=该车 id、`holderGroupId`=entry.groupId、
 *   `holderTaskId`=entry.taskId ?? null（复用优先，D1 优化：挂常驻任务，不新建）、
 *   `orderInWindow`=该车 lineup 内下标（0,1,2…，同车多条 = 接力/并行序）、`windowLabel`=date。
 * - `invitedMemberIds` 恒 `[]`（I0 红线：预设/表格全程不进 memberId 维度）；`eta`/`note` 恒 `null`。
 */
export function deriveTodayPlanFromPresets(
  resources: SharedResource[],
  date: string,
): TodayPlanSessionDraft[] {
  const drafts: TodayPlanSessionDraft[] = [];
  for (const resource of resources) {
    if (!canBoardResource(resource.status)) continue;
    const preset: DefaultPreset | undefined = resource.defaultPreset;
    if (!preset) continue;
    preset.lineup.forEach((entry, index) => {
      drafts.push({
        projectId: resource.projectId,
        resourceId: resource.id,
        windowLabel: date,
        orderInWindow: index,
        holderGroupId: entry.groupId,
        holderTaskId: entry.taskId ?? null,
        invitedMemberIds: [],
        note: null,
        source: 'human',
        eta: null,
      });
    });
  }
  return drafts;
}

// ── 接力交接画布派生层（R1，原 relay.ts，CONTRACTS-MERGE 并入本域）─────────────────────────
// 「队长可编辑的接力画布」读侧真相：把某 windowLabel 已确认的占用窗口压成一排可拖排序的卡片
//（RelayStage），再叠上队长拉的接力交接线（RelayHandoff）。所有人看同一块。独立依赖图页不动——
// 接力交接 ≠ 任务依赖。反监视红线：RelayStage / 本层任何返回体绝不含 memberId / invitedMemberIds /
// 出勤计数，主键只 session / 资源 / 组 / 任务。

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
