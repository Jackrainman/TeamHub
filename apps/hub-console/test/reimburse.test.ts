import { describe, expect, test } from 'vitest';
import {
  buildCreateEntryRequest,
  deriveStockedQuantities,
  emptyItemDraft,
  formatAmountFen,
  yuanTextToFen,
  type EntryDraft,
} from '../src/features/reimburse/reimburse-utils';
import type { PartAction } from '../src/api/schemas/inv';

// 报账域纯函数单测（REIMBURSE-PROC 阶段 3）——不测 DOM/RTL（本仓「测逻辑不测 DOM」
// 风格同 myview.test.ts / identity.test.ts）。

function draft(overrides: Partial<EntryDraft>): EntryDraft {
  return {
    kind: 'expense',
    invoiceNo: '',
    invoiceDate: '',
    seller: '',
    totalYuan: '',
    actualItemName: '',
    note: '',
    items: [],
    ...overrides,
  };
}

describe('formatAmountFen：分 → ¥ 展示文本', () => {
  test('常规金额两位小数', () => {
    expect(formatAmountFen(123456)).toBe('¥1,234.56');
    expect(formatAmountFen(5)).toBe('¥0.05');
    expect(formatAmountFen(0)).toBe('¥0.00');
  });

  test('负数带负号（折扣并入后行金额可为负）', () => {
    expect(formatAmountFen(-88)).toBe('-¥0.88');
  });
});

describe('yuanTextToFen：用户输入元文本 → 分', () => {
  test('常规与容忍格式', () => {
    expect(yuanTextToFen('1234.56')).toBe(123456);
    expect(yuanTextToFen('¥ 1,234.56')).toBe(123456);
    expect(yuanTextToFen('0.5')).toBe(50);
    expect(yuanTextToFen('12')).toBe(1200);
  });

  test('超两位小数 / 非数字 / 空串 → null（不硬凑）', () => {
    expect(yuanTextToFen('20.099')).toBeNull();
    expect(yuanTextToFen('abc')).toBeNull();
    expect(yuanTextToFen('')).toBeNull();
  });
});

describe('buildCreateEntryRequest：草稿校验与装配', () => {
  test('金额缺失或非法 → null', () => {
    expect(buildCreateEntryRequest(draft({ totalYuan: '' }), 'prj-robots')).toBeNull();
    expect(buildCreateEntryRequest(draft({ totalYuan: 'abc' }), 'prj-robots')).toBeNull();
    expect(buildCreateEntryRequest(draft({ totalYuan: '-5' }), 'prj-robots')).toBeNull();
  });

  test('纯费用：可选字段空串 → null，材料恒未备', () => {
    const req = buildCreateEntryRequest(draft({ totalYuan: '88.00' }), 'prj-robots');
    expect(req).not.toBeNull();
    expect(req).toMatchObject({
      projectId: 'prj-robots',
      kind: 'expense',
      invoiceNo: null,
      invoiceDate: null,
      seller: null,
      totalAmountFen: 8800,
      items: [],
      actualItemName: null,
      materials: { paymentShot: false, inspection: false },
      note: null,
    });
  });

  test('物资：全空明细行丢弃，非空行转分', () => {
    const req = buildCreateEntryRequest(
      draft({
        kind: 'goods',
        totalYuan: '100',
        items: [
          emptyItemDraft(),
          {
            name: ' 6020 云台电机 ',
            unit: '个',
            quantity: '2',
            unitPriceYuan: '40.00',
            amountYuan: '80.00',
          },
        ],
      }),
      'prj-robots',
    );
    expect(req).not.toBeNull();
    expect(req!.items).toEqual([
      { name: '6020 云台电机', unit: '个', quantity: 2, unitPriceFen: 4000, amountFen: 8000 },
    ]);
  });

  test('物资：单价留空 → unitPriceFen=null；非空行缺名称/数量/金额 → 整体 null', () => {
    const noUnitPrice = buildCreateEntryRequest(
      draft({
        kind: 'goods',
        totalYuan: '10',
        items: [{ ...emptyItemDraft(), name: '快递纸箱', quantity: '1', amountYuan: '10' }],
      }),
      'prj-robots',
    );
    expect(noUnitPrice!.items[0].unitPriceFen).toBeNull();
    expect(noUnitPrice!.items[0].unit).toBeNull();

    expect(
      buildCreateEntryRequest(
        draft({
          kind: 'goods',
          totalYuan: '10',
          items: [{ ...emptyItemDraft(), quantity: '1', amountYuan: '10' }],
        }),
        'prj-robots',
      ),
    ).toBeNull();
    expect(
      buildCreateEntryRequest(
        draft({
          kind: 'goods',
          totalYuan: '10',
          items: [{ ...emptyItemDraft(), name: '电机', quantity: '0', amountYuan: '10' }],
        }),
        'prj-robots',
      ),
    ).toBeNull();
    expect(
      buildCreateEntryRequest(
        draft({
          kind: 'goods',
          totalYuan: '10',
          items: [{ ...emptyItemDraft(), name: '电机', quantity: '1', amountYuan: '1.234' }],
        }),
        'prj-robots',
      ),
    ).toBeNull();
  });

  test('expense 忽略明细行（契约：expense 恒空数组）', () => {
    const req = buildCreateEntryRequest(
      draft({
        kind: 'expense',
        totalYuan: '10',
        items: [{ ...emptyItemDraft(), name: '不会被带上' }],
      }),
      'prj-robots',
    );
    expect(req!.items).toEqual([]);
  });
});

// ── 入库确认（阶段 5）：已入量从动作日志派生（note 前缀钉行号，与 server 约定同源）────

function restockAction(overrides: Partial<PartAction>): PartAction {
  return {
    id: 'act-1',
    projectId: 'prj-robots',
    partTypeId: 'parttype-1',
    trackedPartId: null,
    kind: 'restock',
    quantityDelta: 2,
    fromHolder: null,
    toHolder: null,
    note: 'reimb-stock-in:0 报账入库·电机',
    recordedBy: { source: 'human', at: '2026-08-01T00:00:00.000Z' },
    recordedAt: '2026-08-01T00:00:00.000Z',
    acquisition: 'selfPurchase',
    reimburseEntryId: 'entry-1',
    ...overrides,
  };
}

describe('deriveStockedQuantities：动作日志 → 各明细行已入量', () => {
  test('按 note 前缀行号累计；同条目多行分开计', () => {
    const stocked = deriveStockedQuantities('entry-1', [
      restockAction({ id: 'a1', note: 'reimb-stock-in:0 报账入库·电机', quantityDelta: 2 }),
      restockAction({ id: 'a2', note: 'reimb-stock-in:0 报账入库·电机', quantityDelta: 1 }),
      restockAction({ id: 'a3', note: 'reimb-stock-in:2 报账入库·螺丝', quantityDelta: 50 }),
    ]);
    expect(stocked.get(0)).toBe(3);
    expect(stocked.get(2)).toBe(50);
    expect(stocked.has(1)).toBe(false);
  });

  test('非本条目 / 非 restock / 无前缀 note 一律不计入（保守放行，库存账不受影响）', () => {
    const stocked = deriveStockedQuantities('entry-1', [
      restockAction({ id: 'a1', reimburseEntryId: 'entry-2' }), // 别的条目
      restockAction({ id: 'a2', kind: 'damage' }), // 非 restock
      restockAction({ id: 'a3', note: '随手补料' }), // 无前缀
      restockAction({ id: 'a4', note: null }),
      restockAction({ id: 'a5', reimburseEntryId: undefined }), // 无关联条目
    ]);
    expect(stocked.size).toBe(0);
  });
});
