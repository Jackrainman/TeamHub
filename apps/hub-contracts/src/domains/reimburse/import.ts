import type { InvoiceRecognitionSource, ReimburseItem } from './model.js';

/** 浏览器本地解析结果；文件本体永不进入此契约。 */

/** 解析结果（表单预填用，瞬态不落库）：字段识别不出为 null，整体识别不出返回 null。 */
export interface ParsedInvoice {
  invoiceNo: string;
  invoiceDate: string | null;
  seller: string | null;
  purchaserName: string | null;
  purchaserTaxNo: string | null;
  recognitionSource: InvoiceRecognitionSource;
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
  const purchaserName =
    xmlTagText(xmlText, 'BuyerName') || xmlTagText(xmlText, 'PurchaserName') || null;
  const purchaserTaxNo =
    xmlTagText(xmlText, 'BuyerTaxID') ||
    xmlTagText(xmlText, 'BuyerIdNum') ||
    xmlTagText(xmlText, 'BuyerTaxNo') ||
    null;
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

  return {
    invoiceNo,
    invoiceDate,
    seller,
    purchaserName,
    purchaserTaxNo,
    recognitionSource: 'xml',
    totalAmountFen,
    items,
  };
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
 * 销售方抬头抽取（只覆盖主流版式，识别不出返回 null，不追识别率）：
 * 1. 数电票双栏版式同一行两个「名称：X 名称：Y」→ 左购右销，取 Y（滴滴票实测版式，
 *    竖排「购/销」标签常与名称行分离，故不依赖购销锚字）；
 * 2. 购销同布局行「购 名称：X … 销 名称：Y」→ Y；
 * 3. 「销售方信息」角色块下的第一条「名称：…」；
 * 4. 裸「名称：X」候选 ≥2 时，剔除像学校抬头（大学/学院/学校/基金会）的购买方后取第一个。
 */
function extractPdfSeller(lines: string[]): string | null {
  for (const line of lines) {
    const twoNames =
      /名\s*称\s*[:：]\s*(.+?)\s+名\s*称\s*[:：]\s*(.+?)\s*$/.exec(line);
    if (twoNames && twoNames[2] && !/^(购|销|买|售)$/.test(twoNames[2])) {
      return twoNames[2].replace(/\s+/g, '');
    }
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

function extractPdfPurchaserName(lines: string[]): string | null {
  for (const line of lines) {
    const labeled =
      /购买方名称\s*[:：]\s*(.+?)(?=\s+(?:统一社会信用代码|纳税人识别号|税号)\s*[:：]|$)/.exec(
        line,
      );
    if (labeled?.[1]) {
      return labeled[1].replace(/\s+/g, '');
    }
    // 购销两列布局（「购 名称：X … 销 名称：Y」）优先精确匹配，避免购方名把「销」单字吞进尾部。
    const direct = /购\s+名称\s*[:：]\s*(.*?)\s+销\s+名称\s*[:：]/.exec(line);
    if (direct?.[1] && direct[1].trim()) {
      return direct[1].replace(/\s+/g, '');
    }
    const twoNames =
      /名\s*称\s*[:：]\s*(.+?)\s+名\s*称\s*[:：]\s*(.+?)\s*$/.exec(line);
    if (twoNames?.[1] && !/^(购|销|买|售)$/.test(twoNames[1])) {
      return twoNames[1].replace(/\s+/g, '');
    }
  }

  let inPurchaserBlock = false;
  for (const line of lines) {
    const norm = line.replace(/\s+/g, '');
    if (norm === '购买方信息' || norm === '买方信息') {
      inPurchaserBlock = true;
      continue;
    }
    if (norm === '销售方信息' || norm === '卖方信息') {
      inPurchaserBlock = false;
      continue;
    }
    const name = /^\s*名\s*称\s*[:：]\s*(.+?)\s*$/.exec(line)?.[1];
    if (inPurchaserBlock && name && !/^(购|销|买|售)$/.test(name)) {
      return name.replace(/\s+/g, '');
    }
  }
  return null;
}

function extractPdfPurchaserTaxNo(lines: string[]): string | null {
  const taxNoPattern = /(?:统一社会信用代码|纳税人识别号|税号)(?:\/纳税人识别号)?\s*[:：]\s*([0-9A-Za-z ]{15,30})/g;
  for (const line of lines) {
    const matches = [...line.matchAll(taxNoPattern)];
    if (matches.length === 0) {
      continue;
    }
    const normalized = matches[0][1].replace(/\s+/g, '').toUpperCase();
    if (normalized.length >= 15 && normalized.length <= 20) {
      return normalized;
    }
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
          // 负金额折行星号行 = 折扣/红冲（滴滴「*交通…*客运服 -16.70 3% -0.50」实测版式，
          // 金额在税率前，上面的 discount 正则锚不住）——并入上一条而非独立成行。
          discountOnly: amountFen < 0,
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
export function parseInvoicePdfText(
  textLines: string[],
  recognitionSource: 'pdf' | 'ocr' = 'pdf',
): ParsedInvoice | null {
  const rawLines = textLines.map((l) => l.trim()).filter((l) => l.length > 0);
  const lines = mergeVerticalCharLines(rawLines);
  const text = lines.join('\n');

  const invoiceNo = extractPdfInvoiceNo(text);
  const invoiceDate = extractPdfInvoiceDate(text);
  const seller = extractPdfSeller(lines);
  const purchaserName = extractPdfPurchaserName(lines);
  const purchaserTaxNo = extractPdfPurchaserTaxNo(lines);

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
  // 品名列折行：数电票长品名常在列内折行，数字尾列跟在第一段同行（「*交通运输服务*客运服
  // 83.50 1 83.50 3% 2.50」下一行才「务费」）。上一条明细的下一行若是纯中文短行则续接到
  // 该条品名；续接只认紧跟的一行，且防重（endsWith）——折扣行的同名折行不会重复接尾。
  let lastWasItemLine = false;
  for (const line of lines) {
    const norm = line.replace(/\s+/g, '').replace(/：/g, ':');
    if (PDF_ITEM_SKIP_PREFIXES.some((p) => norm.startsWith(p))) {
      lastWasItemLine = false;
      continue;
    }
    const isStarLine = norm.startsWith('*');
    if (!isStarLine && !pendingName) {
      const last = items[items.length - 1];
      if (
        lastWasItemLine &&
        last &&
        /^[一-鿿·()（）]{1,12}$/.test(norm) &&
        !last.name.endsWith(norm)
      ) {
        last.name += norm;
      }
      lastWasItemLine = false;
      continue;
    }
    const parsed = parsePdfItemLine(line, pendingName);
    if (!parsed) {
      // 非数字行 → 折行续名（tidoc pending_name_parts 同款）。
      if (!/\d+\.\d{2}|\d+%/.test(line)) {
        pendingName += norm;
      }
      lastWasItemLine = false;
      continue;
    }
    const name = cleanInvoiceItemName(parsed.name || pendingName);
    pendingName = '';
    const last = items[items.length - 1];
    // 折扣并入：同名直接并；品名折行截断会让折扣行名比上一条短一截（客运服 vs 客运服务费），
    // 互为前缀也并（长度 ≥2 防「服务」之类过泛短名误并）。
    const nameMatches =
      last &&
      (name === last.name ||
        (name.length >= 2 &&
          last.name.length >= 2 &&
          (last.name.startsWith(name) || name.startsWith(last.name))));
    if (parsed.discountOnly && nameMatches) {
      last.amountFen += parsed.amountFen; // 折扣行并入上一条（tidoc 同款）
      lastWasItemLine = true; // 折扣行的品名同样可能下一行折行续名
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
      lastWasItemLine = true;
      continue;
    }
    lastWasItemLine = false;
  }

  // 铁路电子客票：无 `*分类*` 明细段，票面只有「票价：￥x」——按票种合成一条明细，
  // 车次/区间抓得到就带上，抓不到不硬凑（金额恒取价税合计，不另猜）。
  if (items.length === 0 && totalAmountFen !== null && /铁路电子客票|电子客票号/.test(text)) {
    // 车次：字母冠号（G/D/C/K/T/Z+数字）优先；纯数字车次只认带「次」的，防把日期年份当车次。
    const trainNo =
      /(?<![A-Za-z0-9])([GDCKTZ]\d{1,5})(?![A-Za-z0-9])/.exec(text)?.[1] ??
      /(?<![A-Za-z0-9])(\d{1,4})次/.exec(text)?.[1];
    const route = /([一-鿿]{2,8}站)\s+([一-鿿]{2,8}站)/.exec(text);
    const detail = [trainNo, route ? `${route[1]}-${route[2]}` : null]
      .filter(Boolean)
      .join(' ');
    items.push({
      name: `铁路客运${detail ? `（${detail}）` : ''}`,
      unit: null,
      quantity: 1,
      unitPriceFen: null,
      amountFen: totalAmountFen,
    });
  }

  if (!invoiceNo && totalAmountFen === null && items.length === 0) {
    return null;
  }
  return {
    invoiceNo,
    invoiceDate,
    seller,
    purchaserName,
    purchaserTaxNo,
    recognitionSource,
    totalAmountFen,
    items,
  };
}
