import type { MemberPublic, Task, TaskWithMeta } from '@teamhub/hub-contracts';
import { isPostedTask } from '@teamhub/hub-contracts';

/**
 * 挂单池（TASK-POST-CLAIM，D-088 / `docs/design/task-post-claim.md` §3/§6）界面层纯函数集。
 * 被 PoolPage.tsx / PmBoardPage.tsx / TaskDetailDrawer.tsx / MyViewPage.tsx 共用，抽出来单测
 * （不测 DOM/RTL，符合本仓「测逻辑不测 DOM」风格，同 checklist-utils.ts / myview-utils.ts）。
 * 本文件不含任何 React / fetch，零副作用。
 *
 * 红线（D-085 名字三层）：本文件只做**对事**的派生（滞留时长 / 结构缺口判定），**永不**按人聚合、
 * 排行、频次或按人筛选——挂单池是"滞留的单"的视图（公开对事），不是"谁闲着"的视图。
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 挂单滞留天数分档阈值（可调常量，task-post-claim.md §6"这单挂两周没人领"）：滞留 ≥ 本值天数的挂单
 * 徽章转 red tone（对事告警：这单挂太久没人领，学长可以问）。导出可调——赛季后期若挂单普遍偏久，
 * 调高本值即可，无须改判定逻辑。
 */
export const POOL_STALE_DAYS = 14;

/**
 * 挂单滞留天数：`now - createdAt` 向下取整到天，最小 0（未来 createdAt 的异常数据夹到 0，不出负值）。
 * "挂了 N 天" 文案用。滞留 = 对事可见（这单挂了多久），非任何人的维度。
 */
export function stalenessDays(createdAtIso: string, now: Date): number {
  const diff = now.getTime() - new Date(createdAtIso).getTime();
  return Math.max(0, Math.floor(diff / MS_PER_DAY));
}

/** 是否滞留过久（≥ POOL_STALE_DAYS）——决定挂单徽章是否转 red tone。 */
export function isStalePosted(days: number): boolean {
  return days >= POOL_STALE_DAYS;
}

/**
 * 挂单池列表：`isPostedTask`（ownerId 为空且非 done/shelved）过滤 + 按滞留时长降序（createdAt 最早
 * = 挂最久 = 排最前，"这单挂两周没人领"最先被看到）。纯派生、不改传入数组（复制后排序）。
 */
export function sortedPostedTasks(tasks: readonly TaskWithMeta[]): TaskWithMeta[] {
  return tasks
    .filter((t) => isPostedTask(t))
    .slice()
    .sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
    );
}

/** 成员的组归属（id → groupId）；候选未加载 / id 失效 → null（不炸）。 */
export function ownerGroupOf(
  members: readonly MemberPublic[],
  ownerId: string | null,
): string | null {
  if (ownerId == null) return null;
  return members.find((m) => m.id === ownerId)?.groupId ?? null;
}

/**
 * 负责人是否为外组（跨组认领，task-post-claim.md §4"鼓励跨组认领简单任务"）：owner 的 groupId 与
 * task.groupId 不同。owner 为空 / 组未知 → false（无主或数据竞态不判跨组）。
 */
export function isCrossOrgOwner(
  task: Pick<Task, 'ownerId' | 'groupId'>,
  members: readonly MemberPublic[],
): boolean {
  const og = ownerGroupOf(members, task.ownerId);
  return og != null && og !== task.groupId;
}

/**
 * 是否缺"本组搭档"（§4 本组搭档规则："本组必须也有人领"）：外组认领后且尚无 partnerMemberId → 显式
 * 缺口黄标"待本组搭档"。**不硬阻塞干活**（A1 先例：暴露缺口不拦人），只是徽章 + 补位入口。
 */
export function needsPartner(
  task: Pick<Task, 'ownerId' | 'groupId' | 'partnerMemberId'>,
  members: readonly MemberPublic[],
): boolean {
  return isCrossOrgOwner(task, members) && !task.partnerMemberId;
}

/**
 * 是否待跨组组长确认（§4 跨组"大任务"组长事后确认）：`isBig` 且负责人为外组且尚无 crossClaimConfirmedBy
 * → 中性徽章"待组长确认"。**非启动闸**（认领已即生效；A1 先例：暴露缺口不拦人），只是徽章 + 留名入口。
 * `isBig` 由调用方传入（TaskWithMeta.isBig，后端算好——单一真相，前端不重算）。
 */
export function needsCrossClaimConfirm(
  task: Pick<Task, 'ownerId' | 'groupId' | 'crossClaimConfirmedBy'>,
  isBig: boolean,
  members: readonly MemberPublic[],
): boolean {
  return isBig && isCrossOrgOwner(task, members) && !task.crossClaimConfirmedBy;
}

/**
 * 挂单空态计数（task-post-claim.md §6 / 体检 D4-刀B 最干净挂点）：DepNode 里 ownerId===null 的条数
 * ——「我的视图」空态私推本人"挂单池里有 N 个活"的 N。**只在本人视图私显**（A2：永不向学长报"谁闲着"）；
 * 计数只对事（有多少无主的活），无任何人的维度。
 */
export function countPostedNodes(
  nodes: readonly { ownerId: string | null }[],
): number {
  return nodes.filter((n) => n.ownerId === null).length;
}
