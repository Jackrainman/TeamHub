import { describe, expect, test } from 'vitest';
import { wouldCreateCycle, type DepEdge } from '@teamhub/hub-contracts';

/**
 * DepGraphPage 的 onConnect 环校验回归测试。
 *
 * 背景：DepGraphPage 原本有一份本地 wouldCreateCycle(edges: DepEdge[], from, to)，
 * 现已删除、改为复用 hub-contracts 导出的 wouldCreateCycle(deps, from, to)。复用要求
 * 把图边 {source,target} 映射成 {fromTaskId,toTaskId} 再传入。本测试镜像 onConnect 里
 * 的守卫序列（自环 → 重边 → 成环），用真实的 contracts 函数证明「映射 + 复用」后行为
 * 与改前的本地实现一致：会成环的连线被挡、不成环的放行。
 */

// 与 DepGraphPage 内 toCycleDeps 完全一致的映射（边方向 = source 阻塞 target）。
function toCycleDeps(
  edges: ReadonlyArray<Pick<DepEdge, 'source' | 'target'>>,
): { fromTaskId: string; toTaskId: string }[] {
  return edges.map((e) => ({ fromTaskId: e.source, toTaskId: e.target }));
}

type GuardResult = 'self' | 'duplicate' | 'cycle' | 'ok';

// 纯函数镜像 onConnect 的守卫序列（顺序与组件一致：自环 → 重边 → 成环 → 放行）。
function onConnectGuard(
  edges: ReadonlyArray<Pick<DepEdge, 'source' | 'target'>>,
  from: string,
  to: string,
): GuardResult {
  if (from === to) return 'self';
  if (edges.some((e) => e.source === from && e.target === to)) return 'duplicate';
  if (wouldCreateCycle(toCycleDeps(edges), from, to)) return 'cycle';
  return 'ok';
}

const edge = (source: string, target: string): Pick<DepEdge, 'source' | 'target'> => ({
  source,
  target,
});

describe('DepGraphPage onConnect 环校验（复用 hub-contracts.wouldCreateCycle）', () => {
  test('会成环的连线被挡：a→b→c 上加 c→a 形成回路', () => {
    const edges = [edge('a', 'b'), edge('b', 'c')];
    // 新边 c→a：从 to=a 出发经 a→b→c 能回到 from=c → 成环。
    expect(onConnectGuard(edges, 'c', 'a')).toBe('cycle');
  });

  test('直接反向边成环：已有 a→b，加 b→a 被挡', () => {
    const edges = [edge('a', 'b')];
    expect(onConnectGuard(edges, 'b', 'a')).toBe('cycle');
  });

  test('不成环的连线放行：a→b、a→c 上加 b→c（DAG 仍无环）', () => {
    const edges = [edge('a', 'b'), edge('a', 'c')];
    expect(onConnectGuard(edges, 'b', 'c')).toBe('ok');
  });

  test('不成环的连线放行：在末端继续延长链 c→d', () => {
    const edges = [edge('a', 'b'), edge('b', 'c')];
    expect(onConnectGuard(edges, 'c', 'd')).toBe('ok');
  });

  test('自环优先被自环守卫拦下（不进入成环分支）', () => {
    expect(onConnectGuard([edge('a', 'b')], 'a', 'a')).toBe('self');
  });

  test('重边在成环判定之前被拦（守卫顺序保持）', () => {
    const edges = [edge('a', 'b')];
    expect(onConnectGuard(edges, 'a', 'b')).toBe('duplicate');
  });

  test('映射方向正确：source=阻塞方=fromTaskId（方向反了则误判）', () => {
    // a→b→c，加 a→c 不成环（顺向捷径）；若映射把方向搞反会误报 cycle。
    const edges = [edge('a', 'b'), edge('b', 'c')];
    expect(onConnectGuard(edges, 'a', 'c')).toBe('ok');
  });
});
