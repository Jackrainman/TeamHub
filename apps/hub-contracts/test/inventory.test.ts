import { describe, expect, test } from 'vitest';
import {
  IDLE_HOLDER,
  InvalidPartActionError,
  PartTypeSchema,
  applyPartAction,
  deriveInventoryLedger,
  deriveShortfalls,
  inventoryScenarioFixture,
} from '../src/index.js';
import type {
  InventoryResourceRef,
  PartType,
  TrackedPart,
} from '../src/index.js';

const NOW = '2026-06-11T02:00:00.000Z';

const RESOURCES: InventoryResourceRef[] = [
  { id: 'res-r1', name: 'R1 比赛车' },
  { id: 'res-r2', name: 'R2 比赛车', displayCode: '26R2' },
];

function gm6020(): PartType {
  return PartTypeSchema.parse(
    inventoryScenarioFixture.partTypes.find((p) => p.id === 'parttype-gm6020'),
  );
}

describe('deriveInventoryLedger', () => {
  test('idle = total − Σ(used+reserved)，perResource 按车列展开', () => {
    const rows = deriveInventoryLedger(inventoryScenarioFixture, RESOURCES);
    const gm = rows.find((r) => r.partType.id === 'parttype-gm6020');
    expect(gm).toBeDefined();
    // total 9 − (2 + 4) = 3
    expect(gm?.idle).toBe(3);
    const r1 = gm?.perResource.find((p) => p.resourceId === 'res-r1');
    const r2 = gm?.perResource.find((p) => p.resourceId === 'res-r2');
    expect(r1?.used).toBe(2);
    expect(r2?.used).toBe(4);
    // displayCode ?? name：res-r1 无 displayCode → name；res-r2 有 displayCode
    expect(r1?.displayCode).toBe('R1 比赛车');
    expect(r2?.displayCode).toBe('26R2');
  });

  test('无 allocation 的车列填 0/0', () => {
    const rows = deriveInventoryLedger(inventoryScenarioFixture, RESOURCES);
    const m4 = rows.find((r) => r.partType.id === 'parttype-m4screw');
    expect(m4?.idle).toBe(200);
    for (const p of m4?.perResource ?? []) {
      expect(p.used).toBe(0);
      expect(p.reserved).toBe(0);
    }
  });
});

describe('deriveShortfalls', () => {
  test('闲置 < lowStockThreshold 的件进缺料告警（主控板 idle 1 < threshold 2）', () => {
    const shortfalls = deriveShortfalls(inventoryScenarioFixture);
    const ids = shortfalls.map((p) => p.id);
    expect(ids).toContain('parttype-maincontroller');
    // GM6020 idle 3 ≥ threshold 2 → 不缺料
    expect(ids).not.toContain('parttype-gm6020');
  });
});

describe('applyPartAction 动作语义', () => {
  test('stocktake 设绝对总数 + lastCountedAt', () => {
    const { partType } = applyPartAction(
      gm6020(),
      null,
      { kind: 'stocktake', quantityDelta: 12, fromHolder: null, toHolder: null },
      NOW,
    );
    expect(partType.totalQuantity).toBe(12);
    expect(partType.lastCountedAt).toBe(NOW);
  });

  test('restock 累加总数', () => {
    const { partType } = applyPartAction(
      gm6020(),
      null,
      { kind: 'restock', quantityDelta: 3, fromHolder: null, toHolder: null },
      NOW,
    );
    expect(partType.totalQuantity).toBe(12);
  });

  test('mount 增 used；个体件移 currentHolder', () => {
    const tracked: TrackedPart = {
      id: 'part-gm-7',
      projectId: 'prj-robots',
      partTypeId: 'parttype-gm6020',
      serialLabel: 'GM-07',
      currentHolder: IDLE_HOLDER,
      reserved: false,
      status: 'ok',
      updatedAt: NOW,
    };
    const { partType, trackedPart } = applyPartAction(
      gm6020(),
      tracked,
      { kind: 'mount', quantityDelta: 1, fromHolder: 'idle', toHolder: 'res-r1' },
      NOW,
    );
    const r1 = partType.allocations.find((a) => a.resourceId === 'res-r1');
    expect(r1?.used).toBe(3); // 2 → 3
    expect(trackedPart?.currentHolder).toBe('res-r1');
    expect(trackedPart?.reserved).toBe(false);
  });

  test('damage 减总数；个体件 status=damaged', () => {
    const tracked: TrackedPart = {
      id: 'part-gm-9',
      projectId: 'prj-robots',
      partTypeId: 'parttype-gm6020',
      serialLabel: 'GM-09',
      currentHolder: IDLE_HOLDER,
      reserved: false,
      status: 'ok',
      updatedAt: NOW,
    };
    const { partType, trackedPart } = applyPartAction(
      gm6020(),
      tracked,
      { kind: 'damage', quantityDelta: 1, fromHolder: null, toHolder: null },
      NOW,
    );
    expect(partType.totalQuantity).toBe(8); // 9 → 8
    expect(trackedPart?.status).toBe('damaged');
  });

  test('reserve 从闲置池扣减、记在该车（reserved 列）', () => {
    const { partType } = applyPartAction(
      gm6020(),
      null,
      { kind: 'reserve', quantityDelta: 1, fromHolder: null, toHolder: 'res-r1' },
      NOW,
    );
    const r1 = partType.allocations.find((a) => a.resourceId === 'res-r1');
    expect(r1?.reserved).toBe(1);
    // 占用合计 7 ≤ total 9 → idle 派生 2
  });

  test('非法：damage 超总数 → InvalidPartActionError（负库存）', () => {
    expect(() =>
      applyPartAction(
        gm6020(),
        null,
        { kind: 'damage', quantityDelta: 100, fromHolder: null, toHolder: null },
        NOW,
      ),
    ).toThrow(InvalidPartActionError);
  });

  test('非法：mount 使占用超总数 → InvalidPartActionError（used 超 total）', () => {
    expect(() =>
      applyPartAction(
        gm6020(),
        null,
        { kind: 'mount', quantityDelta: 100, fromHolder: null, toHolder: 'res-r1' },
        NOW,
      ),
    ).toThrow(InvalidPartActionError);
  });

  test('非法：mount 缺 toHolder → InvalidPartActionError', () => {
    expect(() =>
      applyPartAction(
        gm6020(),
        null,
        { kind: 'mount', quantityDelta: 1, fromHolder: null, toHolder: null },
        NOW,
      ),
    ).toThrow(InvalidPartActionError);
  });

  test('非法：dismount 拆超已装数 → InvalidPartActionError', () => {
    expect(() =>
      applyPartAction(
        gm6020(),
        null,
        { kind: 'dismount', quantityDelta: 100, fromHolder: 'res-r1', toHolder: null },
        NOW,
      ),
    ).toThrow(InvalidPartActionError);
  });

  test('I0：PartAction.recordedBy 形状无 memberId（只 source + at）', () => {
    for (const a of inventoryScenarioFixture.actions) {
      expect(Object.keys(a.recordedBy).sort()).toEqual(['at', 'source']);
    }
  });
});
