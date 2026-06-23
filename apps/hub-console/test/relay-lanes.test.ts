import { describe, expect, test } from 'vitest';
import { buildLanes } from '../src/features/schedule/relay-lanes';
import type { RelayStage } from '../src/api/schemas/schedule';

// RelayStage 来自后端、结构上无人维度（sessionId/resourceId/groupId/orderInWindow）——测之不触人键信号。
function stage(
  over: Partial<RelayStage> &
    Pick<RelayStage, 'sessionId' | 'resourceId' | 'orderInWindow'>,
): RelayStage {
  return {
    displayCode: over.resourceId,
    groupId: 'g-1',
    groupName: '组一',
    taskLabel: null,
    eta: null,
    boardable: true,
    statusReason: null,
    ...over,
  };
}

describe('接力泳道 buildLanes（按 resourceId 分组、首现序、组内 orderInWindow 升序）', () => {
  test('空输入 → 空泳道', () => {
    expect(buildLanes([])).toEqual([]);
  });

  test('单资源多 stage → 一条泳道、组内按 orderInWindow 升序', () => {
    const lanes = buildLanes([
      stage({ sessionId: 's2', resourceId: 'res-r1', orderInWindow: 2 }),
      stage({ sessionId: 's0', resourceId: 'res-r1', orderInWindow: 0 }),
      stage({ sessionId: 's1', resourceId: 'res-r1', orderInWindow: 1 }),
    ]);
    expect(lanes).toHaveLength(1);
    expect(lanes[0].resourceId).toBe('res-r1');
    expect(lanes[0].stages.map((s) => s.orderInWindow)).toEqual([0, 1, 2]);
  });

  test('两资源交错(B,A,B) → 恰两泳道、按首现序（非 resourceId 字典序）', () => {
    const lanes = buildLanes([
      stage({ sessionId: 'b1', resourceId: 'res-b', orderInWindow: 0 }),
      stage({ sessionId: 'a1', resourceId: 'res-a', orderInWindow: 0 }),
      stage({ sessionId: 'b2', resourceId: 'res-b', orderInWindow: 1 }),
    ]);
    // res-b 先出现 → 排第一条；若误按 resourceId 排序会变 [res-a, res-b]。
    expect(lanes.map((l) => l.resourceId)).toEqual(['res-b', 'res-a']);
    expect(lanes[0].stages).toHaveLength(2);
    expect(lanes[1].stages).toHaveLength(1);
  });

  test('displayCode 取自 stage（每泳道挂机器人编号）', () => {
    const lanes = buildLanes([
      stage({ sessionId: 's1', resourceId: 'res-r1', orderInWindow: 0, displayCode: '26R1' }),
    ]);
    expect(lanes[0].displayCode).toBe('26R1');
  });
});
