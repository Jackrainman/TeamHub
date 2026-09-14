import { describe, expect, test } from 'vitest';
import {
  buildCreateEntryRequest,
  emptyItemDraft,
  evidenceRejectReasonFor,
  formatAmountFen,
  formatEvidenceSize,
  groupEvidenceByKind,
  yuanTextToFen,
  type EntryDraft,
} from '../src/features/reimburse/reimburse-utils';
import { REIMBURSE_EVIDENCE_MAX_BYTES, type ReimburseEvidence } from '@teamhub/hub-contracts';

// 报销域纯函数单测（REIMBURSE-PROC 阶段 3）——不测 DOM/RTL（本仓「测逻辑不测 DOM」
// 风格同 myview.test.ts / identity.test.ts）。

function draft(overrides: Partial<EntryDraft>): EntryDraft {
  return {
    kind: 'expense',
    invoiceNo: '',
    invoiceDate: '',
    seller: '',
    purchaserName: '',
    purchaserTaxNo: '',
    recognitionSource: 'manual',
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
  test('项目上下文缺失 → null（不猜默认项目）', () => {
    expect(buildCreateEntryRequest(draft({ totalYuan: '88.00' }), '')).toBeNull();
    expect(buildCreateEntryRequest(draft({ totalYuan: '88.00' }), '   ')).toBeNull();
  });

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
      purchaserName: null,
      purchaserTaxNo: null,
      recognitionSource: 'manual',
      totalAmountFen: 8800,
      items: [],
      actualItemName: null,
      materials: { paymentShot: false, inspection: false },
      note: null,
    });
  });

  test('购买方字段与识别来源原样进入结构化请求', () => {
    const req = buildCreateEntryRequest(
      draft({
        totalYuan: '88.00',
        purchaserName: ' 哈尔滨工业大学 ',
        purchaserTaxNo: ' 12100000400000456B ',
        recognitionSource: 'pdf',
      }),
      'prj-robots',
    );
    expect(req).toMatchObject({
      purchaserName: '哈尔滨工业大学',
      purchaserTaxNo: '12100000400000456B',
      recognitionSource: 'pdf',
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

function evidenceFile(name: string, size: number): File {
  return { name, size } as File;
}

describe('evidenceRejectReasonFor：上传前本地预检（口径取自 contracts）', () => {
  test('四类允许后缀放行，边界值不拒', () => {
    expect(evidenceRejectReasonFor(evidenceFile('发票.pdf', 1024))).toBeNull();
    expect(evidenceRejectReasonFor(evidenceFile('shot.PNG', 1024))).toBeNull();
    expect(evidenceRejectReasonFor(evidenceFile('a.jpg', 1024))).toBeNull();
    expect(evidenceRejectReasonFor(evidenceFile('a.jpeg', 1024))).toBeNull();
    expect(
      evidenceRejectReasonFor(evidenceFile('a.pdf', REIMBURSE_EVIDENCE_MAX_BYTES)),
    ).toBeNull();
  });

  test('超限先于后缀判定（大文件报"过大"而不是"格式不支持"）', () => {
    expect(
      evidenceRejectReasonFor(evidenceFile('a.pdf', REIMBURSE_EVIDENCE_MAX_BYTES + 1)),
    ).toBe('too-large');
    expect(evidenceRejectReasonFor(evidenceFile('a.exe', 1024))).toBe('ext-unsupported');
    expect(evidenceRejectReasonFor(evidenceFile('no-extension', 1024))).toBe('ext-unsupported');
  });
});

describe('formatEvidenceSize：字节数 → 展示文本', () => {
  test('<1KB 用 B，<1MB 取整 KB，其余一位小数 MB', () => {
    expect(formatEvidenceSize(0)).toBe('0 B');
    expect(formatEvidenceSize(69)).toBe('69 B');
    expect(formatEvidenceSize(1023)).toBe('1023 B');
    expect(formatEvidenceSize(100 * 1024)).toBe('100 KB');
    expect(formatEvidenceSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatEvidenceSize(3.5 * 1024 * 1024)).toBe('3.5 MB');
  });
});

describe('groupEvidenceByKind：清单 → 三档分组', () => {
  test('缺项回空数组，未知顺序不影响分桶', () => {
    const item = (id: string, kind: ReimburseEvidence['kind']): ReimburseEvidence => ({
      id,
      kind,
      originalName: `${id}.${kind === 'invoice' ? 'pdf' : 'png'}`,
      ext: kind === 'invoice' ? '.pdf' : '.png',
      sizeBytes: 1,
      sha256: 'x',
      uploadedBy: 'mem-1',
      uploadedAt: '2026-09-14T10:00:00.000Z',
    });
    const grouped = groupEvidenceByKind([
      item('revd-2', 'inspection'),
      item('revd-1', 'invoice'),
    ]);
    expect(grouped.invoice.map((e) => e.id)).toEqual(['revd-1']);
    expect(grouped.inspection.map((e) => e.id)).toEqual(['revd-2']);
    expect(grouped.paymentShot).toEqual([]);
    expect(groupEvidenceByKind([]).invoice).toEqual([]);
  });
});
