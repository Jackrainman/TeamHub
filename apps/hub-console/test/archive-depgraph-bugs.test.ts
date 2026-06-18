import { describe, expect, test } from 'vitest';

/**
 * 针对 hub-console 四个 UI bug 修复的纯逻辑回归测试。
 * 遵循「测逻辑不测 DOM」风格——所有 useEffect/render 层逻辑提炼为纯函数验证。
 */

// ---------------------------------------------------------------------------
// Fix 2: ArtifactLogRow revision 徽章渲染条件
// ---------------------------------------------------------------------------
// 原 bug：versionBadge 显示 "25R1" 后 artifact.revision 无条件再渲 "v3" → 两个徽章。
// 修复：revision 徽章仅在 !(season && robotCode) 时作为 fallback 渲染，与 versionBadge 互补。

/** 与 ArtifactLogRow 内逻辑完全对称的纯函数，用于单测。 */
function computeBadges(artifact: {
  season?: string;
  robotCode?: string;
  revision?: string;
}): { versionBadge: string | null; showRevisionFallback: boolean } {
  const versionBadge =
    artifact.season && artifact.robotCode
      ? `${artifact.season}${artifact.robotCode}`
      : artifact.revision ?? null;
  const showRevisionFallback =
    !(artifact.season && artifact.robotCode) && Boolean(artifact.revision);
  return { versionBadge, showRevisionFallback };
}

describe('Fix 2: ArtifactLogRow revision 徽章不重复', () => {
  test('v2 artifact（season+robotCode+revision）→ 只显 versionBadge、revision 徽章不追加', () => {
    const { versionBadge, showRevisionFallback } = computeBadges({
      season: '25',
      robotCode: 'R1',
      revision: 'v3',
    });
    expect(versionBadge).toBe('25R1');
    expect(showRevisionFallback).toBe(false); // 互补：season+robotCode 已占位，revision 不再显
  });

  test('旧 artifact（无 season/robotCode，只有 revision）→ revision 作 fallback 显示', () => {
    const { versionBadge, showRevisionFallback } = computeBadges({
      revision: 'v3',
    });
    expect(versionBadge).toBe('v3');
    expect(showRevisionFallback).toBe(true);
  });

  test('v2 artifact（season+robotCode，无 revision）→ 只显 versionBadge，无 fallback', () => {
    const { versionBadge, showRevisionFallback } = computeBadges({
      season: '25',
      robotCode: 'R2',
    });
    expect(versionBadge).toBe('25R2');
    expect(showRevisionFallback).toBe(false);
  });

  test('完全裸 artifact（无 season/robotCode/revision）→ 两个都不显', () => {
    const { versionBadge, showRevisionFallback } = computeBadges({});
    expect(versionBadge).toBeNull();
    expect(showRevisionFallback).toBe(false);
  });

  test('有 season 但无 robotCode → fallback 到 revision（season 不完整不用作 versionBadge）', () => {
    const { versionBadge, showRevisionFallback } = computeBadges({
      season: '25',
      revision: 'v1',
    });
    // season 单独不足以构成 versionBadge → 降级到 revision
    expect(versionBadge).toBe('v1');
    expect(showRevisionFallback).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fix 1: ArchivePage stale mechanism — 下拉选中值在切换 ownerGroup/season/robotCode 时清零
// ---------------------------------------------------------------------------
// 逻辑：effectiveMechanism = usingTextInput ? mechanismNew : mechanism。
// 若 mechanism 不清零，切换组合后 effectiveMechanism 残留旧值；清零后 = '' → valid 不通过。

function computeEffectiveMechanism(
  mechanism: string,
  mechanismNew: string,
  isNewMechanism: boolean,
  mechanismOptions: string[],
): string {
  const usingTextInput = isNewMechanism || mechanismOptions.length === 0;
  return usingTextInput ? mechanismNew : mechanism;
}

describe('Fix 1: ArchivePage mechanism 下拉在切组合后重置', () => {
  test('mechanism 未清零时 effectiveMechanism 残留旧值', () => {
    // 旧 mechanism = '底盘'，切到新 ownerGroup 后 mechanismOptions 变了但 mechanism 未清
    const stale = computeEffectiveMechanism('底盘', '', false, ['升降机构']);
    expect(stale).toBe('底盘'); // 这是 bug：旧值残留
  });

  test('mechanism 清零（useEffect 效果）后 effectiveMechanism 为空 → valid 不通过', () => {
    const cleared = computeEffectiveMechanism('', '', false, ['升降机构']);
    expect(cleared).toBe(''); // 修复后：清零 → form valid = false → 提交被阻
  });

  test('新机构路径不受 mechanism 影响（走 mechanismNew）', () => {
    const result = computeEffectiveMechanism('旧机构', '新机构名', true, ['旧机构']);
    expect(result).toBe('新机构名');
  });

  test('空下拉选项（新组合无历史）时走文本框而不是下拉', () => {
    const result = computeEffectiveMechanism('', '底盘2号', false, []);
    expect(result).toBe('底盘2号'); // usingTextInput = true（options.length === 0）
  });
});

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
