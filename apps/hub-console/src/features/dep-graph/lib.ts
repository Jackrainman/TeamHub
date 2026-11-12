import { wouldCreateCycle, type DepEdge } from '@teamhub/hub-contracts';

function toCycleDeps(
  edges: ReadonlyArray<Pick<DepEdge, 'source' | 'target'>>,
): { fromTaskId: string; toTaskId: string }[] {
  return edges.map((e) => ({ fromTaskId: e.source, toTaskId: e.target }));
}

export type ConnectGuardResult = 'self' | 'duplicate' | 'cycle' | 'ok';

// DepGraphPage.onConnect 的守卫序列：自环 → 重边 → 成环 → 放行。
export function connectGuard(
  edges: ReadonlyArray<Pick<DepEdge, 'source' | 'target'>>,
  from: string,
  to: string,
): ConnectGuardResult {
  if (from === to) return 'self';
  if (edges.some((e) => e.source === from && e.target === to)) return 'duplicate';
  if (wouldCreateCycle(toCycleDeps(edges), from, to)) return 'cycle';
  return 'ok';
}