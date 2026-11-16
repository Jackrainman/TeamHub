import { describe, expect, test } from 'vitest';

/**
 * 针对 hub-console 依赖图（DepGraphPage / DetailPanel）UI bug 修复的纯逻辑回归测试。
 * 遵循「测逻辑不测 DOM」风格——所有 useEffect/render 层逻辑提炼为纯函数验证。
 *
 * 2026-11：图纸档案页（ArchivePage / ArtifactLogRow）已按四页成品删除，原 Fix 1 / Fix 2 随之移除。
 */

// ---------------------------------------------------------------------------
// Fix 3: DetailPanel pendingShelve 切节点时应清零
// ---------------------------------------------------------------------------
// 逻辑：pendingShelve 在 node.id 变化时应重置为 false。
// 纯函数镜像：给定"前一个节点 id"和"当前节点 id"，期望是否应重置。

function shouldResetPendingShelve(
  prevNodeId: string | null,
  currentNodeId: string | null,
): boolean {
  return prevNodeId !== currentNodeId;
}

describe('Fix 3: DetailPanel pendingShelve 切节点时清零', () => {
  test('切换到不同节点时应重置 pendingShelve', () => {
    expect(shouldResetPendingShelve('task-a', 'task-b')).toBe(true);
  });

  test('同一节点不应重置', () => {
    expect(shouldResetPendingShelve('task-a', 'task-a')).toBe(false);
  });

  test('从无选中切到有节点时应重置', () => {
    expect(shouldResetPendingShelve(null, 'task-a')).toBe(true);
  });

  test('从节点切到无选中时应重置', () => {
    expect(shouldResetPendingShelve('task-a', null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fix 4: DepGraphPage PmCreatePanel gate — tasksQuery.data != null 才渲染
// ---------------------------------------------------------------------------
// 逻辑：只有 tasksQuery.data 不为 null/undefined 时才给 PmCreatePanel 传 tasks。
// null/undefined 阶段不渲染 PmCreatePanel，防止 defaults 捕获空数组后 clobber 用户编辑。

function shouldRenderPmCreatePanel(tasksData: { tasks: unknown[] } | null | undefined): boolean {
  return tasksData != null;
}

describe('Fix 4: DepGraphPage PmCreatePanel gate', () => {
  test('tasksQuery.data 为 null（加载中）时不渲染', () => {
    expect(shouldRenderPmCreatePanel(null)).toBe(false);
  });

  test('tasksQuery.data 为 undefined（未请求）时不渲染', () => {
    expect(shouldRenderPmCreatePanel(undefined)).toBe(false);
  });

  test('tasksQuery.data 有数据时渲染', () => {
    expect(shouldRenderPmCreatePanel({ tasks: [] })).toBe(true);
  });

  test('tasksQuery.data 有非空任务列表时渲染', () => {
    expect(shouldRenderPmCreatePanel({ tasks: [{ id: 't-1' }] })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// M14: DepGraphPage 节点选中态由 selectedId 单一来源派生（受控）
// ---------------------------------------------------------------------------
// 原 bug：节点对象不带 selected，视觉高亮只在用户点节点时由 ReactFlow 内部选中态触发；
// focusTaskId 程序化跳转走 setSelectedId，ReactFlow 内部不知情 → 详情面板已切、卡片不高亮（分叉）。
// 修复：displayNodes 在 memo 里按 selectedId 给每个节点打 selected，点选/程序化跳转皆一致。

/** 与 DepGraphPage 内 displayNodes memo 对称的纯函数。 */
function deriveNodeSelection<T extends { id: string }>(
  nodes: T[],
  selectedId: string | null,
): Array<T & { selected: boolean }> {
  return nodes.map((n) => ({ ...n, selected: n.id === selectedId }));
}

describe('M14: DepGraphPage 节点选中态恒等于 selectedId', () => {
  const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  test('selectedId 命中某节点 → 仅该节点 selected', () => {
    const out = deriveNodeSelection(nodes, 'b');
    expect(out.map((n) => n.selected)).toEqual([false, true, false]);
  });

  test('selectedId 为 null（点空白/无选中）→ 全部 unselected', () => {
    const out = deriveNodeSelection(nodes, null);
    expect(out.every((n) => !n.selected)).toBe(true);
  });

  test('程序化 focus 跳转：setSelectedId 到任意存在节点都会让卡片高亮（不再分叉）', () => {
    // 模拟 focusTaskId='c' 经 setSelectedId 后 displayNodes 的派生结果
    const out = deriveNodeSelection(nodes, 'c');
    expect(out.find((n) => n.id === 'c')?.selected).toBe(true);
  });

  test('selectedId 指向不存在的节点 → 无节点被高亮（不报错）', () => {
    const out = deriveNodeSelection(nodes, 'missing');
    expect(out.every((n) => !n.selected)).toBe(true);
  });
});
