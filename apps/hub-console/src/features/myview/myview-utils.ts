import type { DepNode } from '@teamhub/hub-contracts';

/**
 * 我的视图（MY-VIEW，product-redefine §4.3）纯派生——不重造 dep-graph 的阻塞判定，只在其输出上
 * 按 memberId 过滤 + 按既有 `status` 二分。抽成纯函数便于单测（本仓「测逻辑不测 DOM」风格，
 * 同 identity-utils.ts）；MyViewPage.tsx 只消费本函数的结果。
 */

/** "被卡住"桶：blockedIdle（有 active 上游卡住）与 gap（自身挂未满足 Need）都算被卡（含卡因可展示）。 */
const BLOCKED_STATUSES = new Set<DepNode['status']>(['blockedIdle', 'gap']);

export interface MyViewSplit {
  /** 可动手：working / freeIdle，未被结构性卡住。 */
  doable: DepNode[];
  /** 被卡住：blockedIdle / gap，卡因走既有 blockedByLabel / unmetNeedLabels。 */
  blocked: DepNode[];
}

/**
 * 我负责的任务 ∩ 未被依赖卡住的（拆两组）。
 * 红线5：只接受当前 session 的 memberId，调用方不得传入他人 id 做"查看他人视图"的入口。
 * done 任务不算"待动手"，排除在两组之外。
 */
export function splitMyTasks(nodes: readonly DepNode[], memberId: string): MyViewSplit {
  const mine = nodes.filter((n) => n.ownerId === memberId && n.status !== 'done');
  return {
    doable: mine.filter((n) => !BLOCKED_STATUSES.has(n.status)),
    blocked: mine.filter((n) => BLOCKED_STATUSES.has(n.status)),
  };
}

/** 卡因文案键位选择：优先 blockedByLabel（既有 depgraph.node.blockedBy 文案先例），否则 unmetNeedLabels。 */
export function myViewBlockReasonSource(
  node: Pick<DepNode, 'blockedByLabel' | 'unmetNeedLabels'>,
): { kind: 'blockedBy'; label: string } | { kind: 'unmetNeed'; labels: string[] } | null {
  if (node.blockedByLabel) return { kind: 'blockedBy', label: node.blockedByLabel };
  if (node.unmetNeedLabels.length > 0) return { kind: 'unmetNeed', labels: node.unmetNeedLabels };
  return null;
}
