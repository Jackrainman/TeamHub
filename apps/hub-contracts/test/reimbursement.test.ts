import { describe, expect, test } from 'vitest';

import {
  PartActionSchema,
  ReimburseEntrySchema,
  cleanInvoiceItemName,
  deriveBatchSummary,
  derivePartAcquisition,
  deriveReimburseStatus,
  parseInvoicePdfText,
  parseInvoiceXmlText,
} from '../src/index.js';
import type { PartAction, ReimburseEntry } from '../src/index.js';

const NOW = '2026-08-01T02:00:00.000Z';

// ---------------------------------------------------------------------------
// parseInvoiceXmlText（数电电子发票 XML）
// ---------------------------------------------------------------------------

/** 数电票 XML 主流版式（字段标签照 EIid/IssueTime/SellerName/TotalTax-includedAmount/Item 块）。 */
const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="http://www.chinatax.gov.cn/tirip/dsw/1.0">
  <Header>
    <EIid>26337000000651169782</EIid>
    <InSu>2</InSu>
    <InvoiceType>82</InvoiceType>
    <IssueTime>2026-07-06</IssueTime>
    <SellerInfo>
      <SellerIdNum>91330110MA7LQLWL32</SellerIdNum>
      <SellerName>杭州洋橙电子商务有限公司</SellerName>
    </SellerInfo>
    <BuyerInfo>
      <BuyerIdNum>12140000405700021K</BuyerIdNum>
      <BuyerName>太原理工大学</BuyerName>
    </BuyerInfo>
  </Header>
  <Body>
    <IssueOrdinaryInfo>
      <TotalTax-includedAmount>120.62</TotalTax-includedAmount>
    </IssueOrdinaryInfo>
    <ItemDetails>
      <Item>
        <ItemName>*计算机外部设备*绿联typec拓展坞</ItemName>
        <SpecMod>CM639</SpecMod>
        <MeaUnits>件</MeaUnits>
        <Quantity>1</Quantity>
        <UnPrice>106.74</UnPrice>
        <Amount>106.74</Amount>
        <TaxRate>0.13</TaxRate>
        <ComTaxAm>13.88</ComTaxAm>
      </Item>
      <Item>
        <ItemName>*电子元件*电阻器</ItemName>
        <SpecMod>200W 铝壳</SpecMod>
        <MeaUnits>个</MeaUnits>
        <Quantity>2</Quantity>
        <UnPrice>10.9950495049505</UnPrice>
        <Amount>21.99</Amount>
        <TaxRate>0.13</TaxRate>
        <ComTaxAm>2.86</ComTaxAm>
      </Item>
    </ItemDetails>
  </Body>
</Invoice>`;

describe('parseInvoiceXmlText', () => {
  test('数电票 XML → 发票号/日期/销售方/价税合计（分）/明细行', () => {
    const inv = parseInvoiceXmlText(SAMPLE_XML);
    expect(inv).not.toBeNull();
    expect(inv?.invoiceNo).toBe('26337000000651169782');
    expect(inv?.invoiceDate).toBe('2026-07-06');
    expect(inv?.seller).toBe('杭州洋橙电子商务有限公司');
    expect(inv?.totalAmountFen).toBe(12062);
    expect(inv?.items).toHaveLength(2);
    // 品名剥掉 *分类* 星号段；金额=Amount+ComTaxAm 转分。
    expect(inv?.items[0]).toEqual({
      name: '绿联typec拓展坞',
      unit: '件',
      quantity: 1,
      unitPriceFen: 10674,
      amountFen: 12062,
    });
    // 超分精度单价（10.9950495…）→ unitPriceFen=null，不硬凑。
    expect(inv?.items[1]?.unitPriceFen).toBeNull();
    expect(inv?.items[1]?.quantity).toBe(2);
    expect(inv?.items[1]?.amountFen).toBe(2199 + 286);
  });

  test('非数电票 XML（无 EIid）→ null', () => {
    expect(parseInvoiceXmlText('<root><foo>bar</foo></root>')).toBeNull();
    expect(parseInvoiceXmlText('根本不是 XML')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseInvoicePdfText（PDF 文本行）
// ---------------------------------------------------------------------------

describe('parseInvoicePdfText', () => {
  test('单行明细：号码/日期/价税合计/明细（超分单价→null）', () => {
    // 样本贴近 tidoc test_engine.py 的真实数电票文本流。
    const inv = parseInvoicePdfText([
      '电子发票（普通发票） 发票号码：26952000002955521026',
      '开票日期：2026年07月13日',
      '*电线电缆*测试线 双头注塑4mm香蕉插头线 条 1 20.0990099009901 20.10 1% 0.20',
      '价税合计（小写） ¥20.30',
      '20.10¥ 0.20¥',
    ]);
    expect(inv).not.toBeNull();
    expect(inv?.invoiceNo).toBe('26952000002955521026');
    expect(inv?.invoiceDate).toBe('2026-07-13');
    expect(inv?.totalAmountFen).toBe(2030);
    expect(inv?.items).toHaveLength(1);
    expect(inv?.items[0]?.name).toBe('测试线');
    expect(inv?.items[0]?.unit).toBe('条');
    expect(inv?.items[0]?.quantity).toBe(1);
    expect(inv?.items[0]?.unitPriceFen).toBeNull(); // 20.0990099… 超分
    expect(inv?.items[0]?.amountFen).toBe(2030);
  });

  test('折行续名明细 + 购销布局行销售方', () => {
    const inv = parseInvoicePdfText([
      '发票号码：26442000003444434596',
      '开票日期：2026年03月30日',
      '购  名称：太原理工大学                 销  名称：中山大简科技有限公司',
      '*计算机外部设备*绿联',
      'typec拓展坞转USB3.2集线',
      '器扩展10Gbps转换',
      'CM639 件 1 106.74 106.74 13% 13.88',
      '价税合计（小写） ¥ 120.62',
    ]);
    expect(inv).not.toBeNull();
    expect(inv?.invoiceNo).toBe('26442000003444434596');
    expect(inv?.invoiceDate).toBe('2026-03-30');
    expect(inv?.seller).toBe('中山大简科技有限公司');
    expect(inv?.totalAmountFen).toBe(12062);
    expect(inv?.items).toHaveLength(1);
    expect(inv?.items[0]?.name).toBe('绿联typec拓展坞转USB3.2集线器扩展10Gbps转换');
    expect(inv?.items[0]?.unit).toBe('件');
    expect(inv?.items[0]?.amountFen).toBe(12062);
  });

  test('折扣行并入上一条明细', () => {
    const inv = parseInvoicePdfText([
      '电子发票（普通发票） 发票号码：26332000002742642046',
      '开票日期：2026年04月03日',
      '*衡器*电子秤 个 1 14.53 14.53 13% 1.89',
      '*衡器*电子秤 13% -0.88 -0.12',
      '价税合计（小写） ¥15.42',
    ]);
    expect(inv).not.toBeNull();
    expect(inv?.items).toHaveLength(1);
    expect(inv?.items[0]?.name).toBe('电子秤');
    // 14.53+1.89 − 0.88 − 0.12 = 15.42（与价税合计闭合）。
    expect(inv?.items[0]?.amountFen).toBe(1542);
    expect(inv?.totalAmountFen).toBe(1542);
  });

  test('识别不出（无号码无金额无明细）→ null', () => {
    expect(
      parseInvoicePdfText(['这是一份随手记', '买了很多东西', '回头再整理']),
    ).toBeNull();
    expect(parseInvoicePdfText([])).toBeNull();
  });
});

describe('cleanInvoiceItemName', () => {
  test('剥 *分类* 星号段 + 去空白', () => {
    expect(cleanInvoiceItemName('*电子元件*电阻')).toBe('电阻');
    expect(cleanInvoiceItemName('无星号名称')).toBe('无星号名称');
  });
});

// ---------------------------------------------------------------------------
// deriveReimburseStatus（三档派生）
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<ReimburseEntry> = {}): ReimburseEntry {
  return ReimburseEntrySchema.parse({
    id: 'reimb-1',
    projectId: 'proj-1',
    memberId: 'member-1',
    batchId: null,
    kind: 'goods',
    invoiceNo: null,
    invoiceDate: null,
    seller: null,
    totalAmountFen: 0,
    items: [],
    actualItemName: null,
    materials: { paymentShot: false, inspection: false },
    note: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

describe('deriveReimburseStatus', () => {
  test('draft：全空条目', () => {
    expect(deriveReimburseStatus(makeEntry())).toBe('draft');
  });

  test('partial：发票字段齐但材料未勾 / 部分填写', () => {
    // 只填了发票号 → partial
    expect(
      deriveReimburseStatus(makeEntry({ invoiceNo: '26337000000651169782' })),
    ).toBe('partial');
    // 核心字段齐 + 明细齐，但材料 checklist 未勾 → 仍 partial
    expect(
      deriveReimburseStatus(
        makeEntry({
          invoiceNo: '26337000000651169782',
          invoiceDate: '2026-07-06',
          seller: '杭州洋橙电子商务有限公司',
          totalAmountFen: 12062,
          items: [
            {
              name: '绿联typec拓展坞',
              unit: '件',
              quantity: 1,
              unitPriceFen: 10674,
              amountFen: 12062,
            },
          ],
        }),
      ),
    ).toBe('partial');
  });

  test('complete：核心字段齐 + 明细齐（goods）+ 材料全勾', () => {
    expect(
      deriveReimburseStatus(
        makeEntry({
          invoiceNo: '26337000000651169782',
          invoiceDate: '2026-07-06',
          seller: '杭州洋橙电子商务有限公司',
          totalAmountFen: 12062,
          items: [
            {
              name: '绿联typec拓展坞',
              unit: '件',
              quantity: 1,
              unitPriceFen: 10674,
              amountFen: 12062,
            },
          ],
          materials: { paymentShot: true, inspection: true },
        }),
      ),
    ).toBe('complete');
    // expense 无需明细即可 complete
    expect(
      deriveReimburseStatus(
        makeEntry({
          kind: 'expense',
          invoiceNo: '26332000002742642046',
          invoiceDate: '2026-04-03',
          seller: '某快递公司',
          totalAmountFen: 6900,
          materials: { paymentShot: true, inspection: true },
        }),
      ),
    ).toBe('complete');
    // goods 明细为空 → 不齐
    expect(
      deriveReimburseStatus(
        makeEntry({
          invoiceNo: '26337000000651169782',
          invoiceDate: '2026-07-06',
          seller: '杭州洋橙电子商务有限公司',
          totalAmountFen: 12062,
          materials: { paymentShot: true, inspection: true },
        }),
      ),
    ).toBe('partial');
  });
});

// ---------------------------------------------------------------------------
// deriveBatchSummary（批次聚合，I0：只有 count/总额/未齐计数）
// ---------------------------------------------------------------------------

describe('deriveBatchSummary', () => {
  test('按 batchId 过滤聚合 count/totalAmountFen/incompleteCount', () => {
    const complete = makeEntry({
      id: 'reimb-a',
      batchId: 'batch-1',
      invoiceNo: '26337000000651169782',
      invoiceDate: '2026-07-06',
      seller: '杭州洋橙电子商务有限公司',
      totalAmountFen: 12062,
      items: [
        {
          name: '绿联typec拓展坞',
          unit: '件',
          quantity: 1,
          unitPriceFen: 10674,
          amountFen: 12062,
        },
      ],
      materials: { paymentShot: true, inspection: true },
    });
    const partial = makeEntry({
      id: 'reimb-b',
      batchId: 'batch-1',
      invoiceNo: '26332000002742642046',
      totalAmountFen: 6900,
    });
    const otherBatch = makeEntry({
      id: 'reimb-c',
      batchId: 'batch-2',
      totalAmountFen: 100,
    });
    const summary = deriveBatchSummary(
      [complete, partial, otherBatch],
      'batch-1',
    );
    expect(summary).toEqual({
      count: 2,
      totalAmountFen: 12062 + 6900,
      incompleteCount: 1,
    });
    // 空批次
    expect(deriveBatchSummary([], 'batch-x')).toEqual({
      count: 0,
      totalAmountFen: 0,
      incompleteCount: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// derivePartAcquisition（来源构成三桶：自购/赞助/老动作无来源）
// ---------------------------------------------------------------------------

function makeAction(overrides: Partial<PartAction> = {}): PartAction {
  return PartActionSchema.parse({
    id: 'act-1',
    projectId: 'proj-1',
    partTypeId: 'parttype-1',
    trackedPartId: null,
    kind: 'restock',
    quantityDelta: 1,
    fromHolder: null,
    toHolder: null,
    note: null,
    recordedBy: { source: 'human', at: NOW },
    recordedAt: NOW,
    ...overrides,
  });
}

describe('derivePartAcquisition', () => {
  test('自购/赞助入桶；无 acquisition 老动作与非 restock 动作不计入', () => {
    const actions = [
      makeAction({ id: 'a1', quantityDelta: 6, acquisition: 'selfPurchase' }),
      makeAction({ id: 'a2', quantityDelta: 2, acquisition: 'sponsored' }),
      makeAction({ id: 'a3', quantityDelta: 10 }), // 老动作无来源 → 不计入
      makeAction({ id: 'a4', kind: 'damage', quantityDelta: -3, acquisition: 'selfPurchase' }),
      makeAction({ id: 'a5', partTypeId: 'parttype-2', quantityDelta: 7, acquisition: 'sponsored' }),
    ];
    expect(derivePartAcquisition('parttype-1', actions)).toEqual({
      selfPurchased: 6,
      sponsored: 2,
    });
  });
});

// ---------------------------------------------------------------------------
// 向后兼容：旧 PartAction（无 acquisition/reimburseEntryId）parse 通过
// ---------------------------------------------------------------------------

describe('PartActionSchema 向后兼容', () => {
  test('旧动作行（无新字段）parse 通过，新字段为 undefined', () => {
    const legacy = {
      id: 'act-old',
      projectId: 'proj-1',
      partTypeId: 'parttype-1',
      trackedPartId: null,
      kind: 'restock',
      quantityDelta: 5,
      fromHolder: null,
      toHolder: null,
      note: '囤了一批 3508',
      recordedBy: { source: 'human', at: NOW },
      recordedAt: NOW,
    };
    const parsed = PartActionSchema.parse(legacy);
    expect(parsed.acquisition).toBeUndefined();
    expect(parsed.reimburseEntryId).toBeUndefined();
    // 带新字段的动作 parse 通过且字段保留
    const withNew = PartActionSchema.parse({
      ...legacy,
      acquisition: 'selfPurchase',
      reimburseEntryId: 'reimb-1',
    });
    expect(withNew.acquisition).toBe('selfPurchase');
    expect(withNew.reimburseEntryId).toBe('reimb-1');
  });
});
