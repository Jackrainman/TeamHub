import { describe, expect, test } from 'vitest';
import { type DepEdge } from '@teamhub/hub-contracts';
import { connectGuard } from '../src/features/dep-graph/lib';

/**
 * DepGraphPage.onConnect 消费的 connectGuard 真实导出回归测试。
 * 守卫序列（自环 → 重边 → 成环 → 放行）与边方向映射都在 lib.ts，
 * 组件与本测试消费同一份实现——改组件映射或守卫顺序会直接红。
 */

const edge = (source: string, target: string): Pick<DepEdge, 'source' | 'target'> => ({
  source,
  target,
});

describe('dep-graph connectGuard（DepGraphPage.onConnect 的真实守卫）', () => {
  test('会成环的连线被挡：a→b→c 上加 c→a 形成回路', () => {
    const edges = [edge('a', 'b'), edge('b', 'c')];
    // 新边 c→a：从 to=a 出发经 a→b→c 能回到 from=c → 成环。
    expect(connectGuard(edges, 'c', 'a')).toBe('cycle');
  });

  test('直接反向边成环：已有 a→b，加 b→a 被挡', () => {
    const edges = [edge('a', 'b')];
    expect(connectGuard(edges, 'b', 'a')).toBe('cycle');
  });

  test('不成环的连线放行：a→b、a→c 上加 b→c（DAG 仍无环）', () => {
    const edges = [edge('a', 'b'), edge('a', 'c')];
    expect(connectGuard(edges, 'b', 'c')).toBe('ok');
  });

  test('不成环的连线放行：在末端继续延长链 c→d', () => {
    const edges = [edge('a', 'b'), edge('b', 'c')];
    expect(connectGuard(edges, 'c', 'd')).toBe('ok');
  });

  test('自环优先被自环守卫拦下（不进入成环分支）', () => {
    expect(connectGuard([edge('a', 'b')], 'a', 'a')).toBe('self');
  });

  test('重边在成环判定之前被拦（守卫顺序保持）', () => {
    const edges = [edge('a', 'b')];
    expect(connectGuard(edges, 'a', 'b')).toBe('duplicate');
  });

  test('映射方向正确：source=阻塞方=fromTaskId（方向反了则误判）', () => {
    // a→b→c，加 a→c 不成环（顺向捷径）；若映射把方向搞反会误报 cycle。
    const edges = [edge('a', 'b'), edge('b', 'c')];
    expect(connectGuard(edges, 'a', 'c')).toBe('ok');
  });
});