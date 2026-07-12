import { describe, expect, test } from 'vitest';
import type { DepNode } from '@teamhub/hub-contracts';
import { myViewBlockReasonSource, splitMyTasks } from '../src/features/myview/myview-utils';

// 我的视图（MY-VIEW，product-redefine §4.3）纯函数单测——不测 DOM/RTL（本仓「测逻辑不测 DOM」
// 风格同 identity.test.ts / console-pages.test.ts）。

function node(overrides: Partial<DepNode>): DepNode {
  return {
    id: 't-1',
    label: '任务',
    groupId: 'grp-ec',
    groupName: '电控',
    robotTarget: null,
    ownerLabel: null,
    ownerId: null,
    status: 'working',
    blockedByTaskId: null,
    blockedByLabel: null,
    isCritical: false,
    isConvergenceTask: false,
    intrinsicComplexity: 'normal',
    unmetNeedLabels: [],
    relatedKnowledge: [],
    ...overrides,
  };
}

describe('splitMyTasks：按 memberId 过滤 + 按 status 二分', () => {
  const nodes: DepNode[] = [
    node({ id: 't-working', ownerId: 'm-1', status: 'working' }),
    node({ id: 't-freeIdle', ownerId: 'm-1', status: 'freeIdle' }),
    node({
      id: 't-blockedIdle',
      ownerId: 'm-1',
      status: 'blockedIdle',
      blockedByTaskId: 't-upstream',
      blockedByLabel: 'R1 底盘调试',
    }),
    node({
      id: 't-gap',
      ownerId: 'm-1',
      status: 'gap',
      unmetNeedLabels: ['RTOS 驱动'],
    }),
    node({ id: 't-done', ownerId: 'm-1', status: 'done' }),
    node({ id: 't-other', ownerId: 'm-2', status: 'blockedIdle' }),
    node({ id: 't-unowned', ownerId: null, status: 'working' }),
  ];

  test('只保留 ownerId === memberId 的节点（红线5：不接受查看他人）', () => {
    const { doable, blocked } = splitMyTasks(nodes, 'm-1');
    const ids = [...doable, ...blocked].map((n) => n.id);
    expect(ids).not.toContain('t-other');
    expect(ids).not.toContain('t-unowned');
  });

  test('done 任务排除在两组之外', () => {
    const { doable, blocked } = splitMyTasks(nodes, 'm-1');
    const ids = [...doable, ...blocked].map((n) => n.id);
    expect(ids).not.toContain('t-done');
  });

  test('working / freeIdle 归可动手；blockedIdle / gap 归被卡住', () => {
    const { doable, blocked } = splitMyTasks(nodes, 'm-1');
    expect(doable.map((n) => n.id).sort()).toEqual(['t-freeIdle', 't-working']);
    expect(blocked.map((n) => n.id).sort()).toEqual(['t-blockedIdle', 't-gap']);
  });

  test('无匹配 memberId → 两组皆空（不炸）', () => {
    const { doable, blocked } = splitMyTasks(nodes, 'm-nonexistent');
    expect(doable).toEqual([]);
    expect(blocked).toEqual([]);
  });
});

describe('myViewBlockReasonSource：卡因来源选择', () => {
  test('blockedByLabel 优先', () => {
    const n = node({ blockedByLabel: 'R1 底盘调试', unmetNeedLabels: ['也不该显示的'] });
    expect(myViewBlockReasonSource(n)).toEqual({ kind: 'blockedBy', label: 'R1 底盘调试' });
  });

  test('无 blockedByLabel 时回退 unmetNeedLabels', () => {
    const n = node({ blockedByLabel: null, unmetNeedLabels: ['RTOS 驱动', '标定工装'] });
    expect(myViewBlockReasonSource(n)).toEqual({
      kind: 'unmetNeed',
      labels: ['RTOS 驱动', '标定工装'],
    });
  });

  test('两者皆无 → null（working/freeIdle 节点走这条）', () => {
    const n = node({ blockedByLabel: null, unmetNeedLabels: [] });
    expect(myViewBlockReasonSource(n)).toBeNull();
  });
});
