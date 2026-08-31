import { describe, expect, test } from 'vitest';

import {
  CreateReimburseEntryRequestSchema,
  DEFAULT_REIMBURSE_PROFILE,
  GetReimburseProfileResponseSchema,
  PartActionSchema,
  ReimburseBatchesResponseSchema,
  ReimburseEntrySchema,
  StockInContextResponseSchema,
  UpdateReimburseProfileRequestSchema,
  cleanInvoiceItemName,
  deriveBatchSummary,
  derivePartAcquisition,
  derivePurchaserCheckStatus,
  deriveReimburseFinancialSummary,
  deriveReimburseReviewReasons,
  deriveReimburseStatus,
  parseInvoicePdfText,
  parseInvoiceXmlText,
  suggestReimburseFilename,
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
    expect(inv?.purchaserName).toBe('太原理工大学');
    expect(inv?.purchaserTaxNo).toBe('12140000405700021K');
    expect(inv?.recognitionSource).toBe('xml');
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
    expect(inv?.purchaserName).toBe('太原理工大学');
    expect(inv?.recognitionSource).toBe('pdf');
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

  test('OCR 文本兜底可显式保留识别来源', () => {
    const inv = parseInvoicePdfText(
      ['发票号码：26952000002955521026', '价税合计（小写） ¥20.30'],
      'ocr',
    );
    expect(inv?.recognitionSource).toBe('ocr');
  });

  test('滴滴电子发票（真实票文本流）：同行双名称取销售方 + 品名折行续名 + 金额在前的折扣行并入', () => {
    // 文本行为 2026-07-21 滴滴电子发票（客运服务费）pdf.js 实测抽取。
    const inv = parseInvoicePdfText([
      '电子发票（普通发票） 发票号码: 26127000000363050731',
      '旅客运输服务',
      '开票日期: 2026年07月21日',
      '购 销',
      '名称：新疆大学 名称：滴滴出行科技有限公司',
      '买 售',
      '方 方',
      '信 统一社会信用代码/纳税人识别号：12650000457601471G 信 统一社会信用代码/纳税人识别号：911201163409833307',
      '息 息',
      '项目名称 单 价 数 量 金 额 税率/征收率 税 额',
      '*交通运输服务*客运服 83.50 1 83.50 3% 2.50',
      '务费',
      '*交通运输服务*客运服 -16.70 3% -0.50',
      '务费',
      '合 计 ¥66.80 ¥2.00',
      '出行人 有效身份证件号 出行日期 出发地 到达地 等级 交通工具类型',
      '价 税 合 计 （ 大 写 ） 陆拾捌圆捌角整 （ 小 写 ） ¥68.80',
      '购方开户银行:中国农业银行 银行账号:30704301040002348',
      '备 购方地址:新疆乌鲁木齐天山区胜利路街道胜利路666号新疆大学 电话:0991-8582939',
      '注',
      '开票人： 赵笑林',
    ]);
    expect(inv).not.toBeNull();
    expect(inv?.invoiceNo).toBe('26127000000363050731');
    expect(inv?.invoiceDate).toBe('2026-07-21');
    // 购买方/销售方同一行连写（左购右销），销售方取第二个名称。
    expect(inv?.seller).toBe('滴滴出行科技有限公司');
    expect(inv?.purchaserName).toBe('新疆大学');
    expect(inv?.purchaserTaxNo).toBe('12650000457601471G');
    expect(inv?.totalAmountFen).toBe(6880);
    // 品名列折行：「客运服」+次行「务费」续接成完整品名；折扣行（金额在税率前）
    // 截断名与上一条互为前缀也并入——83.50+2.50−16.70−0.50=68.80 与价税合计闭合。
    expect(inv?.items).toHaveLength(1);
    expect(inv?.items[0]?.name).toBe('客运服务费');
    expect(inv?.items[0]?.amountFen).toBe(6880);
  });

  test('铁路电子客票（真实票文本流）：无 *分类* 明细段 → 按票种合成明细', () => {
    // 文本行为 2026-07 12306 电子客票（常州→上海虹桥）补 CMap 后 pdf.js 实测抽取。
    const inv = parseInvoicePdfText([
      '电子发票（铁路电子客票）',
      '发票号码:26329130452000986260 江 开票日期:2026年07月21日',
      'G1985',
      '常州站 上海虹桥站',
      'Changzhou Shanghaihongqiao',
      '2026年07月16日 20:25开 02车01A号 二等座',
      '票价:￥77.00',
      '3101132006****0012 黄若麟',
      '电子客票号:3045275086071791740572026',
      '购买方名称:新疆大学 统一社会信用代码:12650000457601471G',
      '买票请到12306 发货请到95306',
      '中国铁路祝您旅途愉快',
    ]);
    expect(inv).not.toBeNull();
    expect(inv?.invoiceNo).toBe('26329130452000986260');
    expect(inv?.invoiceDate).toBe('2026-07-21');
    expect(inv?.totalAmountFen).toBe(7700);
    expect(inv?.items).toHaveLength(1);
    expect(inv?.items[0]?.name).toBe('铁路客运（G1985 常州站-上海虹桥站）');
    expect(inv?.items[0]?.amountFen).toBe(7700);
    // 票面无销售方抬头（只有购买方）——不强猜，留 null 转手填。
    expect(inv?.seller).toBeNull();
    expect(inv?.purchaserName).toBe('新疆大学');
    expect(inv?.purchaserTaxNo).toBe('12650000457601471G');
  });

  test('铁路电子客票：车次夹在站名之间（同列一行）也能抓出区间（REIMBURSE-DEFECTS #1）', () => {
    // 真实样本「上海-常州 26319130671006495711」抽取行：上海站 G8274 常州站（车次不独占一行）。
    const inv = parseInvoicePdfText([
      '电子发票（铁路电子客票）',
      '发票号码:26319130671006495711 江 开票日期:2026年07月17日',
      '上海站 G8274 常州站',
      'Shanghai Changzhou',
      '票价:￥91.00',
      '电子客票号:3045275086071791740572027',
    ]);
    expect(inv).not.toBeNull();
    expect(inv?.items[0]?.name).toBe('铁路客运（G8274 上海站-常州站）');
    expect(inv?.items[0]?.amountFen).toBe(9100);
  });
});

describe('CreateReimburseEntryRequestSchema 可空键宽容（REIMBURSE-DEFECTS #5）', () => {
  const base = {
    projectId: 'robotics',
    kind: 'expense' as const,
    recognitionSource: 'manual' as const,
    totalAmountFen: 3200,
    items: [{ name: '打车', unit: null, quantity: 1, unitPriceFen: null, amountFen: 3200 }],
    materials: { paymentShot: false, inspection: false },
  };

  test('省略 nullable 键（purchaserName/seller/note/invoiceNo 等）也能过', () => {
    const parsed = CreateReimburseEntryRequestSchema.parse(base);
    expect(parsed.totalAmountFen).toBe(3200);
    expect(parsed.invoiceNo).toBeUndefined();
  });

  test('显式 null 仍然兼容（console 全键发送路径不变）', () => {
    const parsed = CreateReimburseEntryRequestSchema.parse({
      ...base,
      invoiceNo: null,
      seller: null,
      purchaserName: null,
      purchaserTaxNo: null,
      invoiceDate: null,
      actualItemName: null,
      note: null,
    });
    expect(parsed.invoiceNo).toBeNull();
  });

  test('必填键缺失仍拒（totalAmountFen/items 不放宽）', () => {
    expect(() => CreateReimburseEntryRequestSchema.parse({ kind: 'expense' })).toThrow();
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
    purchaserName: null,
    purchaserTaxNo: null,
    recognitionSource: 'manual',
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
      purchaserName: '哈尔滨工业大学',
      purchaserTaxNo: '12100000400000456B',
      recognitionSource: 'xml',
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
      DEFAULT_REIMBURSE_PROFILE,
    );
    expect(summary).toEqual({
      count: 2,
      totalAmountFen: 12062 + 6900,
      incompleteCount: 1,
      financial: {
        gross: { count: 2, amountFen: 12062 + 6900 },
        eligible: { count: 1, amountFen: 12062 },
        blocked: { count: 1, amountFen: 6900 },
        review: { count: 1, amountFen: 6900 },
      },
    });
    // 空批次
    expect(deriveBatchSummary([], 'batch-x', DEFAULT_REIMBURSE_PROFILE)).toEqual({
      count: 0,
      totalAmountFen: 0,
      incompleteCount: 0,
      financial: {
        gross: { count: 0, amountFen: 0 },
        eligible: { count: 0, amountFen: 0 },
        blocked: { count: 0, amountFen: 0 },
        review: { count: 0, amountFen: 0 },
      },
    });
  });
});

describe('窄入库上下文与批次响应', () => {
  test('StockInContextResponse 只收候选最小投影和按 entry 分组的 stockedLines', () => {
    const context = StockInContextResponseSchema.parse({
      partTypes: [{
        id: 'part-1',
        partNumber: 'R-001',
        name: '电阻',
        category: 'electronic',
        unit: '个',
      }],
      entries: [{
        entryId: 'reimb-1',
        stockedLines: [{ itemIndex: 0, quantity: 2 }],
      }],
    });
    expect(context.entries[0].stockedLines).toEqual([{ itemIndex: 0, quantity: 2 }]);
    expect(() => StockInContextResponseSchema.parse({
      ...context,
      partTypes: [{ ...context.partTypes[0], totalQuantity: 99 }],
    })).toThrow();
  });

  test('批次响应携带同源 profile 与 financial summary', () => {
    const summary = {
      batchId: 'batch-1',
      count: 0,
      totalAmountFen: 0,
      incompleteCount: 0,
      financial: {
        gross: { count: 0, amountFen: 0 },
        eligible: { count: 0, amountFen: 0 },
        blocked: { count: 0, amountFen: 0 },
        review: { count: 0, amountFen: 0 },
      },
    };
    expect(ReimburseBatchesResponseSchema.parse({
      batches: [],
      summaries: [summary],
      profile: DEFAULT_REIMBURSE_PROFILE,
    })).toEqual({
      batches: [],
      summaries: [summary],
      profile: DEFAULT_REIMBURSE_PROFILE,
    });
  });
});

// ---------------------------------------------------------------------------
// 购买方质量门、核对原因、财务双口径与文件名
// ---------------------------------------------------------------------------

describe('购买方质量策略', () => {
  test('match/mismatch/missing/skipped 四态完整', () => {
    const hit = {
      purchaserName: '哈尔滨工业大学',
      purchaserTaxNo: '12100000400000456b',
    };
    expect(derivePurchaserCheckStatus(hit, DEFAULT_REIMBURSE_PROFILE)).toBe('match');
    expect(
      derivePurchaserCheckStatus(
        { ...hit, purchaserName: '哈尔滨工业大学（威海）' },
        DEFAULT_REIMBURSE_PROFILE,
      ),
    ).toBe('mismatch');
    expect(
      derivePurchaserCheckStatus(
        { purchaserName: '哈尔滨工业大学', purchaserTaxNo: null },
        DEFAULT_REIMBURSE_PROFILE,
      ),
    ).toBe('missing');
    expect(
      derivePurchaserCheckStatus(
        { purchaserName: null, purchaserTaxNo: null },
        { expectedPurchaserName: '', expectedPurchaserTaxNo: '' },
      ),
    ).toBe('skipped');
  });

  test('profile 默认值、空字符串跳过与严格 GET/PUT 契约', () => {
    expect(DEFAULT_REIMBURSE_PROFILE).toEqual({
      expectedPurchaserName: '哈尔滨工业大学',
      expectedPurchaserTaxNo: '12100000400000456B',
    });
    expect(UpdateReimburseProfileRequestSchema.parse({
      expectedPurchaserName: '',
      expectedPurchaserTaxNo: '',
    })).toEqual({ expectedPurchaserName: '', expectedPurchaserTaxNo: '' });
    expect(GetReimburseProfileResponseSchema.parse({
      profile: DEFAULT_REIMBURSE_PROFILE,
    }).profile).toEqual(DEFAULT_REIMBURSE_PROFILE);
    expect(() => UpdateReimburseProfileRequestSchema.parse({
      ...DEFAULT_REIMBURSE_PROFILE,
      extra: true,
    })).toThrow();
  });
});

describe('核对原因与财务口径', () => {
  const completeBase = {
    invoiceNo: '26337000000651169782',
    invoiceDate: '2026-07-06',
    seller: '杭州洋橙电子商务有限公司',
    purchaserName: '哈尔滨工业大学',
    purchaserTaxNo: '12100000400000456B',
    totalAmountFen: 1000,
    items: [{ name: '电阻', unit: '个', quantity: 1, unitPriceFen: 1000, amountFen: 1000 }],
    materials: { paymentShot: true, inspection: true },
    recognitionSource: 'xml' as const,
  };

  test('人工/OCR、超分单价、抬头错误和信息缺失均给结构化原因', () => {
    const entry = makeEntry({
      ...completeBase,
      purchaserName: '错误抬头',
      recognitionSource: 'ocr',
      items: [{ ...completeBase.items[0], unitPriceFen: null }],
    });
    expect(deriveReimburseReviewReasons(entry, DEFAULT_REIMBURSE_PROFILE)).toEqual([
      'purchaser-mismatch',
      'unit-price-imprecise',
      'ocr-recognition',
    ]);
    expect(deriveReimburseReviewReasons(makeEntry(), DEFAULT_REIMBURSE_PROFILE)).toEqual([
      'invoice-no-missing',
      'invoice-date-missing',
      'seller-missing',
      'amount-missing',
      'items-missing',
      'purchaser-missing',
      'manual-entry',
    ]);
  });

  test('gross=eligible+blocked；review 独立且允许与 blocked 重叠', () => {
    const clean = makeEntry({ id: 'clean', ...completeBase });
    const review = makeEntry({
      id: 'review',
      ...completeBase,
      totalAmountFen: 2000,
      recognitionSource: 'pdf',
      items: [{ ...completeBase.items[0], unitPriceFen: null, amountFen: 2000 }],
    });
    const blocked = makeEntry({
      id: 'blocked',
      ...completeBase,
      totalAmountFen: 3000,
      purchaserName: '错误抬头',
    });
    expect(
      deriveReimburseFinancialSummary([clean, review, blocked], DEFAULT_REIMBURSE_PROFILE),
    ).toEqual({
      gross: { count: 3, amountFen: 6000 },
      eligible: { count: 2, amountFen: 3000 },
      blocked: { count: 1, amountFen: 3000 },
      review: { count: 2, amountFen: 5000 },
    });
  });
});

describe('suggestReimburseFilename', () => {
  test('生成跨平台安全的 YYYYMMDD-销方-金额 文件名', () => {
    expect(
      suggestReimburseFilename({
        invoiceDate: '2026-07-06',
        seller: '杭州/洋橙:电子商务有限公司',
        totalAmountFen: 12062,
      }),
    ).toBe('20260706-杭州-洋橙-电子商务有限公司-120.62.pdf');
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
    expect(parsed.reimburseItemIndex).toBeUndefined();
    // 带新字段的动作 parse 通过且字段保留
    const withNew = PartActionSchema.parse({
      ...legacy,
      acquisition: 'selfPurchase',
      reimburseEntryId: 'reimb-1',
      reimburseItemIndex: 0,
    });
    expect(withNew.acquisition).toBe('selfPurchase');
    expect(withNew.reimburseEntryId).toBe('reimb-1');
    expect(withNew.reimburseItemIndex).toBe(0);
    expect(() => PartActionSchema.parse({
      ...legacy,
      acquisition: 'selfPurchase',
      reimburseEntryId: 'reimb-1',
    })).toThrow();
    expect(() => PartActionSchema.parse({
      ...legacy,
      kind: 'damage',
      acquisition: 'selfPurchase',
      reimburseEntryId: 'reimb-1',
      reimburseItemIndex: 0,
    })).toThrow();
    expect(() => PartActionSchema.parse({
      ...legacy,
      acquisition: 'selfPurchase',
      reimburseEntryId: '',
      reimburseItemIndex: 0,
    })).toThrow();
  });
});
