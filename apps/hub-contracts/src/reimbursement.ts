import { z } from 'zod';

import { isoDateTimeSchema } from './common.js';
import { PartAcquisitionSchema, PartTypeSchema, PartActionSchema } from './inventory.js';

/**
 * 采购-报账-入库联动 · 报账模块一期（REIMBURSE-PROC，计划 taskmaster-impulse-steel）。
 *
 * 一句话定位：成员垫钱买物资 → 本地解析发票自动填单（**文件本体永不上传**，只 POST 结构化字段）
 * → 批次汇总报销 → 物资类条目确认入库（联动库存 restock，钉 acquisition='selfPurchase'）。
 *
 * 两实体 + 纯派生：
 *  - `ReimburseEntry` — 一条报账条目 = 一张发票；**无 status 字段**，draft/partial/complete 由
 *    `deriveReimburseStatus` 纯函数派生（tidoc 同款自动推导，无手工状态机）。
 *  - `ReimburseBatch` — 报销批次（三档状态机在批次上，条目装批 = entry.batchId 单批归属）。
 *  - `parseInvoiceXmlText` / `parseInvoicePdfText` — 发票 XML/PDF 文本 → 结构化字段（纯字符串
 *    处理，不依赖 DOM，node/浏览器通吃）；版式规则借鉴 tidoc engine/parser.py，**只覆盖主流
 *    数电票版式，识别不出返回 null 由前端手填，不追识别率**。
 *
 * 红线（计划「安全红线」节，本文件落到 schema 形状上）：
 * 1. 发票 PDF/XML、付款截图、查验单**文件本体永不上传**——本域只有结构化字段，无任何文件键；
 *    付款截图/查验单只是 `materials` checklist 布尔（已备/未备）。
 * 2. 卡号、开户行等收款信息**不进本系统**（留在 tidoc 或线下）——schema 无此类字段。
 * 3. **I0**：`memberId`（垫付人）属事实层（钱要还给本人，合法）；但条目读视图只回**本人+超管**
 *    （过滤在 server 路由层，契约不含滤后 Public 变体——事实层直接回本人）。批次聚合
 *    `deriveBatchSummary` 只有 count/totalAmountFen/incompleteCount，**无按人明细、无排行**。
 * 4. 金额单位一律 **分（int）**（`totalAmountFen` / `amountFen`），避浮点；发票单价常有超过
 *    两位小数的精度（如 20.0990099009901），无法整分表示时 `unitPriceFen=null`，不硬凑。
 *
 * **独立域文件**（照 `inventory.ts` / `checklist.ts` 范式）：不进 GovernanceSnapshot，独立 store
 * + 独立落盘（store 实现属 server 阶段，本文件只落契约）。
 */

// ---------------------------------------------------------------------------
// 枚举与基础件
// ---------------------------------------------------------------------------

/** 条目类型：goods=物资采购（触发入库联动）/ expense=纯费用（差旅/快递等，不入库）。 */
export const ReimburseEntryKindSchema = z.enum(['goods', 'expense']);

/** 批次状态机：collecting=收集装批中 / submitted=已提交财务 / reimbursed=已打款完结。 */
export const ReimburseBatchStatusSchema = z.enum([
  'collecting',
  'submitted',
  'reimbursed',
]);

/** 条目就绪度三档（**派生值，不落库**）：draft=基本空 / partial=有内容但未齐 / complete=可交。 */
export const ReimburseEntryStatusSchema = z.enum([
  'draft',
  'partial',
  'complete',
]);

/**
 * 发票明细行（仅 goods 条目使用）：品名已剥掉 `*分类*` 星号段（cleanItemName）。
 * `unitPriceFen=null` = 单价精度超分（数电票常见），不代表无单价；`quantity` 允许小数（公斤/米）。
 */
export const ReimburseItemSchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1).nullable(), // 识别不出单位 → null，手填补
  quantity: z.number().positive(), // 识别不出时解析器兜底 1
  unitPriceFen: z.number().int().nullable(), // 超分精度 → null（见文件头红线4）
  amountFen: z.number().int(), // 价税合计（折扣行并入后可为负，故不加 nonnegative）
});

/** 材料 checklist（红线1：**只是布尔**，文件本体永不上传）。 */
export const ReimburseMaterialsSchema = z.object({
  paymentShot: z.boolean(), // 付款截图已备
  inspection: z.boolean(), // 查验单已备
});

// ---------------------------------------------------------------------------
// 实体
// ---------------------------------------------------------------------------

/**
 * 报账条目 = 一张发票。`memberId`（垫付人）server 钉 sessionActor，不由客户端给（写契约 omit）。
 * `invoiceNo` = 查重键（server 全库唯一、409；空号草稿跳过查重），故 nullable。
 * **无 status 字段**——就绪度由 `deriveReimburseStatus` 派生。
 */
export const ReimburseEntrySchema = z.object({
  id: z.string().min(1), // reimb-xxx
  projectId: z.string().min(1),
  memberId: z.string().min(1), // 垫付人（I0 事实层，红线3）
  batchId: z.string().min(1).nullable(), // 装批归属（单批，比 tidoc 多对多简化）
  kind: ReimburseEntryKindSchema,
  invoiceNo: z.string().min(1).nullable(), // 发票号码（数电 20 位）
  invoiceDate: z.string().min(1).nullable(), // YYYY-MM-DD
  seller: z.string().min(1).nullable(), // 销售方抬头
  totalAmountFen: z.number().int().nonnegative(), // 价税合计（分）
  items: z.array(ReimburseItemSchema), // 仅 goods；expense 恒为空数组
  actualItemName: z.string().min(1).nullable(), // 实际物资名称（手填，报账说明用）
  materials: ReimburseMaterialsSchema,
  note: z.string().min(1).nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

/** 报销批次（一期财务视角=超管）。条目装批 = entry.batchId。 */
export const ReimburseBatchSchema = z.object({
  id: z.string().min(1), // reimb-batch-xxx
  projectId: z.string().min(1),
  name: z.string().min(1), // "2026-08 第一批"
  status: ReimburseBatchStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type ReimburseEntryKind = z.infer<typeof ReimburseEntryKindSchema>;
export type ReimburseBatchStatus = z.infer<typeof ReimburseBatchStatusSchema>;
export type ReimburseEntryStatus = z.infer<typeof ReimburseEntryStatusSchema>;
export type ReimburseItem = z.infer<typeof ReimburseItemSchema>;
export type ReimburseMaterials = z.infer<typeof ReimburseMaterialsSchema>;
export type ReimburseEntry = z.infer<typeof ReimburseEntrySchema>;
export type ReimburseBatch = z.infer<typeof ReimburseBatchSchema>;

// ---------------------------------------------------------------------------
// 纯派生函数（+单测，reimbursement.test.ts）
// ---------------------------------------------------------------------------

/** 批次聚合形状（deriveBatchSummary 输出 / GET batches 响应的 summaries 元素共用）。 */
export const ReimburseBatchSummarySchema = z.object({
  batchId: z.string().min(1),
  count: z.number().int().nonnegative(), // 批内条目数
  totalAmountFen: z.number().int().nonnegative(), // 批内价税合计总和
  incompleteCount: z.number().int().nonnegative(), // 未齐（非 complete）条目数
});
export type ReimburseBatchSummary = z.infer<typeof ReimburseBatchSummarySchema>;

/**
 * 条目就绪度派生（tidoc 同款自动推导，无手工状态机）：
 *  - complete：发票核心字段齐（invoiceNo/invoiceDate/seller/totalAmountFen>0；goods 另需明细非空）
 *    **且**材料 checklist 两项全勾；
 *  - draft：核心字段全空且材料未勾且 actualItemName 未填（刚建的空条目）；
 *  - 其余 partial。
 */
export function deriveReimburseStatus(entry: ReimburseEntry): ReimburseEntryStatus {
  const coreFilled =
    entry.invoiceNo !== null &&
    entry.invoiceDate !== null &&
    entry.seller !== null &&
    entry.totalAmountFen > 0 &&
    (entry.kind !== 'goods' || entry.items.length > 0);
  const materialsDone = entry.materials.paymentShot && entry.materials.inspection;
  if (coreFilled && materialsDone) {
    return 'complete';
  }
  const anyFilled =
    entry.invoiceNo !== null ||
    entry.invoiceDate !== null ||
    entry.seller !== null ||
    entry.totalAmountFen > 0 ||
    entry.items.length > 0 ||
    entry.actualItemName !== null ||
    entry.materials.paymentShot ||
    entry.materials.inspection;
  return anyFilled ? 'partial' : 'draft';
}

/**
 * 批次聚合（I0 红线3：只有 count/总额/未齐计数，**永不做按人明细/排行**）。
 * entries 传全量条目，本函数按 batchId 过滤。
 */
export function deriveBatchSummary(
  entries: ReimburseEntry[],
  batchId: string,
): Omit<ReimburseBatchSummary, 'batchId'> {
  const inBatch = entries.filter((e) => e.batchId === batchId);
  return {
    count: inBatch.length,
    totalAmountFen: inBatch.reduce((s, e) => s + e.totalAmountFen, 0),
    incompleteCount: inBatch.filter((e) => deriveReimburseStatus(e) !== 'complete')
      .length,
  };
}

// ---------------------------------------------------------------------------
// 发票解析纯函数（XML / PDF 文本行 → 结构化字段；识别不出返回 null）
// ---------------------------------------------------------------------------

/** 解析结果（表单预填用，瞬态不落库）：字段识别不出为 null，整体识别不出返回 null。 */
export interface ParsedInvoice {
  invoiceNo: string;
  invoiceDate: string | null; // YYYY-MM-DD
  seller: string | null;
  totalAmountFen: number | null;
  items: ReimburseItem[];
}

/**
 * 元金额文本 → 分（int）。容忍 ¥/￥、千分位、数字间空格（PDF 文本流常见 "¥ 1,234.56"）；
 * 超两位小数或无法解析 → null（不硬凑）。
 */
function yuanTextToFen(raw: string): number | null {
  const cleaned = raw.replace(/[¥￥\s,，]/g, '');
  const m = /^(-?\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!m) {
    return null;
  }
  const yuan = Number.parseInt(m[1], 10);
  const frac = m[2] ?? '';
  const cents = Number.parseInt(frac.padEnd(2, '0') || '0', 10);
  // 负号看字符串而非数值——"-0.88" 的 yuan 是 -0，`-0 < 0` 为 false，单靠数值判负会丢号。
  return yuan * 100 + (cleaned.startsWith('-') ? -cents : cents);
}

/** 剥掉发票品名里的 `*分类*` 星号段（tidoc clean_item_name 同款）。 */
export function cleanInvoiceItemName(name: string): string {
  return name.replace(/\*[^*]+\*/g, '').replace(/\s+/g, '').trim();
}

// ---------------------------------------------------------------- XML

/** 提取首个 `<tag>text</tag>`（容忍命名空间前缀 `<ab:tag>`），解码 XML 实体。 */
function xmlTagText(xml: string, tag: string): string {
  const re = new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${tag}[^>]*>([\\s\\S]*?)</(?:[A-Za-z_][\\w.-]*:)?${tag}>`,
  );
  const m = re.exec(xml);
  return m ? decodeXmlEntities(m[1]).trim() : '';
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&amp;/g, '&'); // &amp; 最后解，避免二次展开
}

/**
 * 数电电子发票 XML 文本 → 结构化字段。纯字符串处理（不依赖 DOM，node/浏览器通吃）。
 * 字段标签照数电票 XML 版式（EIid / IssueTime / SellerName / TotalTax-includedAmount /
 * Item 块内 ItemName·SpecMod·MeaUnits·Quantity·UnPrice·Amount·ComTaxAm）；
 * 明细行金额 = Amount(不含税) + ComTaxAm(税额)。**无 EIid 标签即非数电票 XML → 返回 null**。
 * 跨行拆分的同名无数量条目（tidoc 同款）金额并入上一条。
 */
export function parseInvoiceXmlText(xmlText: string): ParsedInvoice | null {
  const invoiceNo = xmlTagText(xmlText, 'EIid');
  if (!invoiceNo) {
    return null;
  }
  const invoiceDate =
    xmlTagText(xmlText, 'IssueTime') ||
    xmlTagText(xmlText, 'RequestTime').slice(0, 10) ||
    null;
  const seller = xmlTagText(xmlText, 'SellerName') || null;
  const totalAmountFen = yuanTextToFen(xmlTagText(xmlText, 'TotalTax-includedAmount'));

  const items: ReimburseItem[] = [];
  // <Item ...>…</Item> 块（\b 保证不匹配 <ItemDetails>）。
  const itemBlocks =
    xmlText.match(/<(?:[A-Za-z_][\w.-]*:)?Item\b[\s\S]*?<\/(?:[A-Za-z_][\w.-]*:)?Item>/g) ??
    [];
  for (const block of itemBlocks) {
    const rawName = xmlTagText(block, 'ItemName');
    if (!rawName) {
      continue;
    }
    const amountText = xmlTagText(block, 'Amount');
    const taxText = xmlTagText(block, 'ComTaxAm');
    const amountFen = yuanTextToFen(amountText);
    const taxFen = yuanTextToFen(taxText);
    const lineTotalFen = (amountFen ?? 0) + (taxFen ?? 0);
    const quantityText = xmlTagText(block, 'Quantity');
    const name = cleanInvoiceItemName(rawName);
    const last = items[items.length - 1];
    // 跨行拆分的同名条目（无数量）：金额并入上一条（tidoc 同款）。
    if (last && !quantityText && name === last.name) {
      last.amountFen += lineTotalFen;
      continue;
    }
    const quantity = quantityText ? Number(quantityText) : 1;
    items.push({
      name: name || rawName,
      unit: xmlTagText(block, 'MeaUnits') || null,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      unitPriceFen: yuanTextToFen(xmlTagText(block, 'UnPrice')), // 超分精度 → null
      amountFen: lineTotalFen,
    });
  }

  return { invoiceNo, invoiceDate, seller, totalAmountFen, items };
}

// ---------------------------------------------------------------- PDF 文本行

/** 明细区终止词（tidoc _SKIP_PREFIXES 精简版）：命中即非明细行。 */
const PDF_ITEM_SKIP_PREFIXES = [
  '合计',
  '价税合计',
  '购买时间',
  '收款人',
  '复核人',
  '开票人',
  '备注',
  '名称:',
  '名称：',
  '统一社会信用',
  '电子发票',
  '小计',
  '项目名称',
];

/** 竖排单字行（销/售/方/信/息…每字独占一行）合并成一行的预处理（tidoc _normalize_party_lines 同款）。 */
function mergeVerticalCharLines(lines: string[]): string[] {
  const out: string[] = [];
  let buf = '';
  for (const line of lines) {
    if (/^[一-鿿]$/.test(line)) {
      buf += line;
      continue;
    }
    if (buf) {
      out.push(buf);
      buf = '';
    }
    out.push(line);
  }
  if (buf) {
    out.push(buf);
  }
  return out;
}

/** 发票号码：带标签优先（20 位，容忍数字间空格），兜底独立 20 位数字串（tidoc _extract_invoice_no 精简）。 */
function extractPdfInvoiceNo(text: string): string {
  const labeled = /发票号码[:：]?[^\d\n]*((?:\d[^\S\n]*){20,})/.exec(text);
  if (labeled) {
    const value = labeled[1].replace(/\D/g, '');
    if (value.length === 20) {
      return value;
    }
  }
  const standalone = /(?<!\d)\d{20}(?!\d)/.exec(text);
  if (standalone) {
    return standalone[0];
  }
  for (const m of text.matchAll(/(?<!\d)(?:\d[^\S\n]*){20,}/g)) {
    const value = m[0].replace(/\D/g, '');
    if (value.length === 20) {
      return value;
    }
  }
  return '';
}

/** 开票日期 → YYYY-MM-DD（容忍字符间空格，tidoc _extract_invoice_date 同款）。 */
function extractPdfInvoiceDate(text: string): string | null {
  const m =
    /((?:\d[^\S\n]*){4})[^\S\n]*年[^\S\n]*((?:\d[^\S\n]*){1,2})[^\S\n]*月[^\S\n]*((?:\d[^\S\n]*){1,2})[^\S\n]*日/.exec(
      text,
    );
  if (!m) {
    return null;
  }
  const digits = (s: string) => s.replace(/\D/g, '');
  return `${digits(m[1])}-${digits(m[2]).padStart(2, '0')}-${digits(m[3]).padStart(2, '0')}`;
}

/**
 * 销售方抬头抽取（只覆盖三种主流版式，识别不出返回 null，不追识别率）：
 * 1. 购销同布局行「购 名称：X … 销 名称：Y」→ Y；
 * 2. 「销售方信息」角色块下的第一条「名称：…」；
 * 3. 裸「名称：X」候选 ≥2 时，剔除像学校抬头（大学/学院/学校/基金会）的购买方后取第一个。
 */
function extractPdfSeller(lines: string[]): string | null {
  for (const line of lines) {
    const direct = /购\s+名称\s*[:：]\s*(.*?)\s+销\s+名称\s*[:：]\s*(.*?)\s*$/.exec(
      line,
    );
    if (direct && direct[2]) {
      return direct[2].replace(/\s+/g, '');
    }
    const split = /购\s+名称\s*[:：]\s*(.*?)\s{3,}(.*?)销\s+名称/.exec(line);
    if (split && split[2]) {
      return split[2].replace(/\s+/g, '');
    }
  }
  let inSellerBlock = false;
  const bareNames: string[] = [];
  for (const line of lines) {
    const norm = line.replace(/\s+/g, '');
    if (norm === '销售方信息') {
      inSellerBlock = true;
      continue;
    }
    if (norm === '购买方信息' || norm === '买方信息') {
      inSellerBlock = false;
      continue;
    }
    const m = /^\s*名\s*称\s*[:：]\s*(.+?)\s*$/.exec(line);
    if (m && m[1] && !/^(购|销|买|售)$/.test(m[1])) {
      if (inSellerBlock) {
        return m[1].replace(/\s+/g, '');
      }
      bareNames.push(m[1].replace(/\s+/g, ''));
    }
  }
  if (bareNames.length >= 2) {
    const nonBuyer = bareNames.filter((n) => !/(大学|学院|学校|基金会)/.test(n));
    return nonBuyer[0] ?? bareNames[0];
  }
  return null;
}

interface PdfItemTail {
  name: string; // 本行识别出的品名（可能为空 = 名称在 pending 里）
  unit: string | null;
  quantity: number;
  unitPriceFen: number | null;
  amountFen: number; // 金额+税额（价税合计）
  discountOnly: boolean; // 纯折扣行（负数金额，并入上一条）
}

/** 解析明细行尾列「数量 单价 金额 税率% 税额」（tidoc _parse_amount_tax_line / _parse_loose_amount_tax_line 精简）。 */
function parsePdfItemLine(line: string, pendingName: string): PdfItemTail | null {
  // 发数字小数点两侧空格粘连（"23. 01"），再压空白（tidoc compact 同款）。
  const compact = line
    .replace(/(?<=\d)\s*\.\s*(?=\d)/g, '.')
    .replace(/\s+/g, ' ')
    .trim();

  // 纯折扣行：「*分类*名称 13%-0.88 -0.12」（金额税额皆负）。
  const discount =
    /^(\*?.+?)\s+(-?\d+(?:\.\d+)?)%\s*(-\d+(?:\.\d+)?)\s+(-\d+(?:\.\d+)?)$/.exec(
      compact,
    );
  if (discount) {
    const amountFen = yuanTextToFen(discount[3]);
    const taxFen = yuanTextToFen(discount[4]);
    if (amountFen !== null && taxFen !== null) {
      return {
        name: discount[1],
        unit: null,
        quantity: 1,
        unitPriceFen: null,
        amountFen: amountFen + taxFen,
        discountOnly: true,
      };
    }
  }

  if (compact.startsWith('*')) {
    // 完整版式：「*分类*名称 [规格] 单位 数量 单价 金额 税率% 税额」（规格可省）。
    const full =
      /^(\*.+?)\s+(?:(\S+)\s+)?([一-鿿A-Za-z]{1,4})\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+\.\d{2})\s+(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)$/.exec(
        compact,
      );
    if (full) {
      const amountFen = yuanTextToFen(full[6]);
      const taxFen = yuanTextToFen(full[8]);
      if (amountFen !== null && taxFen !== null) {
        return {
          name: full[1],
          unit: full[3],
          quantity: Number(full[4]) || 1,
          unitPriceFen: yuanTextToFen(full[5]),
          amountFen: amountFen + taxFen,
          discountOnly: false,
        };
      }
    }

    // 折行版式：「*分类*名称（可带规格段） 金额 税率% 税额」（无单位/数量）。
    const folded =
      /^(\*.+?)(?:\s+\S+)*?\s+(-?\d+\.\d{2})\s+(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)$/.exec(
        compact,
      );
    if (folded) {
      const amountFen = yuanTextToFen(folded[2]);
      const taxFen = yuanTextToFen(folded[4]);
      if (amountFen !== null && taxFen !== null) {
        return {
          name: folded[1],
          unit: null,
          quantity: 1,
          unitPriceFen: null,
          amountFen: amountFen + taxFen,
          discountOnly: false,
        };
      }
    }
    return null;
  }

  // 数字尾折行（名称在前面 pending 行）：「[规格] 单位 数量 单价 金额 税率% 税额」。
  if (pendingName) {
    const loose =
      /^(?:(\S+)\s+)?([一-鿿A-Za-z]{1,4})\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+\.\d{2})\s+(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)$/.exec(
        compact,
      );
    if (loose) {
      const amountFen = yuanTextToFen(loose[5]);
      const taxFen = yuanTextToFen(loose[7]);
      if (amountFen !== null && taxFen !== null) {
        return {
          name: pendingName,
          unit: loose[2],
          quantity: Number(loose[3]) || 1,
          unitPriceFen: yuanTextToFen(loose[4]),
          amountFen: amountFen + taxFen,
          discountOnly: false,
        };
      }
    }
  }
  return null;
}

/**
 * 发票 PDF 文本行 → 结构化字段。`textLines` 为 pdf.js 按行抽取的文本（前端本地解析，文件不上传）。
 * 只覆盖主流数电票版式：发票号码/开票日期（容忍字符间空格）、购销布局行与「销售方信息」块、
 * 价税合计（¥金额取该行/全局最大）、`*分类*品名` 明细行（含折行续名与折扣行并入）。
 * **整体识别不出（无发票号且无金额且无明细）→ 返回 null**，前端转手填。
 */
export function parseInvoicePdfText(textLines: string[]): ParsedInvoice | null {
  const rawLines = textLines.map((l) => l.trim()).filter((l) => l.length > 0);
  const lines = mergeVerticalCharLines(rawLines);
  const text = lines.join('\n');

  const invoiceNo = extractPdfInvoiceNo(text);
  const invoiceDate = extractPdfInvoiceDate(text);
  const seller = extractPdfSeller(lines);

  // 价税合计：优先「价税合计（小写）」同行金额，兜底全局最大 ¥ 金额（tidoc 同款）。
  let totalAmountFen: number | null = null;
  const amounts: number[] = [];
  for (const line of lines) {
    const m = /[¥￥][^\S\n]*(-?(?:[0-9,，][^\S\n]*)+(?:\.[^\S\n]*(?:[0-9][^\S\n]*){1,2})?)/.exec(
      line,
    );
    if (!m) {
      continue;
    }
    const fen = yuanTextToFen(m[1]);
    if (fen === null) {
      continue;
    }
    amounts.push(fen);
    if (/价税合计/.test(line) && /小写/.test(line)) {
      totalAmountFen = fen;
    }
  }
  if (totalAmountFen === null && amounts.length > 0) {
    totalAmountFen = Math.max(...amounts);
  }

  // 明细行：以 `*分类*品名` 起行，折行续名进 pending，命中数字尾列成行。
  const items: ReimburseItem[] = [];
  let pendingName = '';
  for (const line of lines) {
    const norm = line.replace(/\s+/g, '').replace(/：/g, ':');
    if (PDF_ITEM_SKIP_PREFIXES.some((p) => norm.startsWith(p))) {
      continue;
    }
    const isStarLine = norm.startsWith('*');
    if (!isStarLine && !pendingName) {
      continue;
    }
    const parsed = parsePdfItemLine(line, pendingName);
    if (!parsed) {
      // 非数字行 → 折行续名（tidoc pending_name_parts 同款）。
      if (!/\d+\.\d{2}|\d+%/.test(line)) {
        pendingName += norm;
      }
      continue;
    }
    const name = cleanInvoiceItemName(parsed.name || pendingName);
    pendingName = '';
    const last = items[items.length - 1];
    if (parsed.discountOnly && last && name === last.name) {
      last.amountFen += parsed.amountFen; // 折扣行并入上一条（tidoc 同款）
      continue;
    }
    if (!parsed.discountOnly) {
      items.push({
        name: name || parsed.name,
        unit: parsed.unit,
        quantity: parsed.quantity,
        unitPriceFen: parsed.unitPriceFen,
        amountFen: parsed.amountFen,
      });
    }
  }

  if (!invoiceNo && totalAmountFen === null && items.length === 0) {
    return null;
  }
  return { invoiceNo, invoiceDate, seller, totalAmountFen, items };
}

// ---------------------------------------------------------------------------
// API 读 / 写契约（跨端单一源，server + console 共用）
// ---------------------------------------------------------------------------

/**
 * POST /api/reimburse/entries：手动录入 / 发票解析预填后提交。**memberId 不由客户端给**——
 * server 钉 sessionActor（垫付人=本人，I0 事实层）；id/createdAt/updatedAt server 补；
 * batchId 不收（新条目必未装批，装批走 PATCH）。projectId 照 inventory/pm 写契约惯例随请求传入。
 * 发票号查重（409）在 server 路由层，契约不承载。
 */
export const CreateReimburseEntryRequestSchema = ReimburseEntrySchema.omit({
  id: true,
  memberId: true,
  batchId: true,
  createdAt: true,
  updatedAt: true,
});
export const CreateReimburseEntryResponseSchema = z.object({
  entry: ReimburseEntrySchema,
});

/**
 * PATCH /api/reimburse/entries/:id：补材料 checklist / 实际物资名称 / 备注 / 装批移出（batchId=null）。
 * 发票核心字段的纠错走同端点？——一期刻意只放这四键（计划拍板：PATCH 用材料 checklist/
 * actualItemName/note/batchId），全 optional（PATCH 语义，客户端只传要改的键）。
 */
export const UpdateReimburseEntryRequestSchema = z.object({
  materials: ReimburseMaterialsSchema.optional(),
  actualItemName: z.string().min(1).nullable().optional(),
  note: z.string().min(1).nullable().optional(),
  batchId: z.string().min(1).nullable().optional(),
});
export const UpdateReimburseEntryResponseSchema = z.object({
  entry: ReimburseEntrySchema,
});

/**
 * POST /api/reimburse/entries/:id/stock-in：物资类条目确认入库（鉴权=条目本人或超管）。
 * 逐明细行给出入库去向：`partTypeId`=入既有件 或 `newPart`=新建件（件号+名称+类别+单位）。
 * server 内部调 invStore.upsertPartType + recordPartAction（kind='restock'，
 * acquisition='selfPurchase'，reimburseEntryId=条目 id）。
 */
export const StockInLineSchema = z.object({
  itemIndex: z.number().int().nonnegative(), // 对应 entry.items 下标
  quantity: z.number().int().positive(), // 入库数量（库存 quantityDelta 为 int）
  target: z.union([
    z.object({ partTypeId: z.string().min(1) }),
    z.object({
      newPart: z.object({
        partNumber: z.string().min(1),
        name: z.string().min(1),
        category: z.string().min(1),
        unit: z.string().min(1),
      }),
    }),
  ]),
});
export const StockInRequestSchema = z.object({
  lines: z.array(StockInLineSchema).min(1),
});
export const StockInResponseSchema = z.object({
  partTypes: z.array(PartTypeSchema), // 触及的件（新建或补料后快照）
  actions: z.array(PartActionSchema), // 落账的 restock 动作（带 acquisition/reimburseEntryId）
});

/**
 * POST /api/reimburse/batches（超管）：建批次；server clamp status='collecting'、补 id/时间戳。
 * PATCH /api/reimburse/batches/:id：名称改 / 状态流转（三档全允许，无回退限制）。
 */
export const CreateReimburseBatchRequestSchema = ReimburseBatchSchema.omit({
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});
export const UpdateReimburseBatchRequestSchema = z.object({
  name: z.string().min(1).optional(),
  status: ReimburseBatchStatusSchema.optional(),
});
export const ReimburseBatchResponseSchema = z.object({
  batch: ReimburseBatchSchema,
});

/**
 * GET /api/reimburse/entries：**过滤在服务端**——普通成员只回本人条目，超管回全部（I0 红线3）。
 * GET /api/reimburse/batches：批次 + 聚合（summaries 按批次一行；无按人明细、无排行）。
 */
export const ReimburseEntriesResponseSchema = z.object({
  entries: z.array(ReimburseEntrySchema),
});
export const ReimburseBatchesResponseSchema = z.object({
  batches: z.array(ReimburseBatchSchema),
  summaries: z.array(ReimburseBatchSummarySchema),
});

// PartAcquisitionSchema 在 inventory.ts 定义（动作上钉来源），由 index.ts 经 inventory.js 导出，本文件不重导出。
// stock-in 落账恒为 'selfPurchase'；赞助入库走库存自己的 restock 表单（'sponsored'，不关联条目）。

export type ParsedInvoiceItem = ReimburseItem;
export type CreateReimburseEntryRequest = z.infer<
  typeof CreateReimburseEntryRequestSchema
>;
export type CreateReimburseEntryResponse = z.infer<
  typeof CreateReimburseEntryResponseSchema
>;
export type UpdateReimburseEntryRequest = z.infer<
  typeof UpdateReimburseEntryRequestSchema
>;
export type UpdateReimburseEntryResponse = z.infer<
  typeof UpdateReimburseEntryResponseSchema
>;
export type StockInLine = z.infer<typeof StockInLineSchema>;
export type StockInRequest = z.infer<typeof StockInRequestSchema>;
export type StockInResponse = z.infer<typeof StockInResponseSchema>;
export type CreateReimburseBatchRequest = z.infer<
  typeof CreateReimburseBatchRequestSchema
>;
export type UpdateReimburseBatchRequest = z.infer<
  typeof UpdateReimburseBatchRequestSchema
>;
export type ReimburseBatchResponse = z.infer<typeof ReimburseBatchResponseSchema>;
export type ReimburseEntriesResponse = z.infer<typeof ReimburseEntriesResponseSchema>;
export type ReimburseBatchesResponse = z.infer<typeof ReimburseBatchesResponseSchema>;
