import { describe, expect, test } from 'vitest';
import { wouldCreateCycle } from '../src/index.js';

// H1（AUDIT-FIXES 部署前必修）：依赖环防护纯函数。边 from→to = from 阻塞 to；
// 新边成环 iff 图里已存在 to→…→from 的路径（或自环）。POST /api/dependencies 落库前调它拒环。
const edge = (fromTaskId: string, toTaskId: string) => ({ fromTaskId, toTaskId });

describe('wouldCreateCycle', () => {
  test('自环 from===to → true', () => {
    expect(wouldCreateCycle([], 't-a', 't-a')).toBe(true);
  });

  test('空图加任意边 → false', () => {
    expect(wouldCreateCycle([], 't-a', 't-b')).toBe(false);
  });

  test('2 节点回边：A→B 已存在，再加 B→A → true', () => {
    expect(wouldCreateCycle([edge('t-a', 't-b')], 't-b', 't-a')).toBe(true);
  });

  test('传递环：A→B→C 已存在，再加 C→A → true', () => {
    const deps = [edge('t-a', 't-b'), edge('t-b', 't-c')];
    expect(wouldCreateCycle(deps, 't-c', 't-a')).toBe(true);
  });

  test('DAG 不成环：A→B、A→C 已存在，再加 B→C → false', () => {
    const deps = [edge('t-a', 't-b'), edge('t-a', 't-c')];
    expect(wouldCreateCycle(deps, 't-b', 't-c')).toBe(false);
  });

  test('图里已含环也不会让函数自身死循环（DoS 安全），无关边 → false', () => {
    const deps = [edge('t-a', 't-b'), edge('t-b', 't-a')]; // 已成环
    expect(wouldCreateCycle(deps, 't-x', 't-c')).toBe(false);
  });
});
