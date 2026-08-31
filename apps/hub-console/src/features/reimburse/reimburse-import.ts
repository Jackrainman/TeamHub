import {
  classifyInvoiceEntryKind,
  INVOICE_ARCHIVE_LIMITS,
  parseInvoicePdfText,
  parseInvoiceXbrlText,
  parseInvoiceXmlText,
  planInvoiceArchive,
  type ParsedInvoice,
} from '@teamhub/hub-contracts';
import { extractPdfTextLines } from './lib/pdf-extract';
import {
  ArchiveGateError,
  extractOfdXbrlText,
  extractZipEntries,
} from './lib/archive-extract';
import {
  emptyItemDraft,
  type EntryDraft,
  type EntryItemDraft,
} from './reimburse-utils';

/**
 * 发票导入域逻辑（REIMBURSE-PROC 阶段 4）——文件分类/解析编排/预填草稿装配。
 * 红线：文件本体只在浏览器里读（file.text() / pdf.js），识别结果只进表单草稿，
 * 用户改完点提交才走既有 POST 结构化字段链路，解析值绝不直接 POST。
 *
 * `analyzeInvoiceFile` 的副作用（读文件/pdf.js）通过 deps 注入，编排分支由
 * test/reimburse-import.test.ts 用 fake 覆盖（照「测逻辑不测 DOM/库」惯例）。
 */

/** 单个文件的导入结局：parsed/unrecognized 进确认队列，failed 直接报错不入队。 */
export type ImportFailReason = 'type' | 'read' | 'gate' | 'nested' | 'dup';
export type ImportOutcome =
  | { kind: 'parsed'; fileName: string; invoice: ParsedInvoice }
  | { kind: 'unrecognized'; fileName: string }
  | { kind: 'failed'; fileName: string; reason: ImportFailReason };

/** 按扩展名分类（大小写不敏感）；非 .pdf/.xml/.ofd/.zip → null（跳过并报错，不硬解）。 */
export function classifyInvoiceFile(fileName: string): 'xml' | 'pdf' | 'ofd' | 'zip' | null {
  const kind = classifyInvoiceEntryKind(fileName);
  if (kind === 'container') return 'zip';
  return kind === 'other' ? null : kind;
}

export interface AnalyzeDeps {
  /** 读 xml 文本（默认 file.text()）。 */
  readText: (file: File) => Promise<string>;
  /** pdf → 文本行（默认 pdf-extract 的 extractPdfTextLines）。 */
  extractPdfLines: (file: File) => Promise<string[]>;
}

const defaultDeps: AnalyzeDeps = {
  readText: (file) => file.text(),
  extractPdfLines: extractPdfTextLines,
};

/**
 * 单文件编排：分类 → 读取 → contracts 解析。读取/解析抛错 → failed/read（非发票 PDF、
 * 损坏文件都落这里）；解析函数返回 null → unrecognized（开空表单手填）。
 * 不静默吞：任何异常都变成显式结局返回，绝不 resolve undefined。
 */
export async function analyzeInvoiceFile(
  file: File,
  deps: AnalyzeDeps = defaultDeps,
): Promise<ImportOutcome> {
  const fileName = file.name;
  const type = classifyInvoiceFile(fileName);
  // 容器/版式文件走 analyzeInvoiceFileDeep（解包/内嵌 XBRL），这里只兜散件 xml/pdf。
  if (type === null || type === 'ofd' || type === 'zip') {
    return { kind: 'failed', fileName, reason: 'type' };
  }
  try {
    const invoice =
      type === 'xml'
        ? parseInvoiceXmlText(await deps.readText(file))
        : parseInvoicePdfText(await deps.extractPdfLines(file));
    if (invoice === null) {
      return { kind: 'unrecognized', fileName };
    }
    return { kind: 'parsed', fileName, invoice };
  } catch {
    return { kind: 'failed', fileName, reason: 'read' };
  }
}

// ---------------------------------------------------------------------------
// 深度编排（REIMBURSE-OFD-PARSE）：ZIP 解包队列 + OFD 内嵌 XBRL，安全门全覆盖。
// ---------------------------------------------------------------------------

export interface AnalyzeDeepDeps extends AnalyzeDeps {
  /** 读文件字节（默认 file.arrayBuffer()）。 */
  readBytes: (file: File) => Promise<Uint8Array>;
  /** zip 字节 → 条目表（默认 fflate 流式解包，带安全门）。 */
  extractZip: (data: Uint8Array) => Promise<Map<string, Uint8Array>>;
  /** ofd 字节 → 内嵌 XBRL 文本（默认解包找 Attachs xml）。 */
  extractOfdXbrl: (data: Uint8Array) => Promise<string | null>;
}

const defaultDeepDeps: AnalyzeDeepDeps = {
  ...defaultDeps,
  readBytes: async (file) => new Uint8Array(await file.arrayBuffer()),
  extractZip: (data) => extractZipEntries(data).then((r) => r.entries),
  extractOfdXbrl: (data) => extractOfdXbrlText(data),
};

const decoder = new TextDecoder('utf-8');

/** 结构化来源优先（ofd/xbrl > xml > pdf）：同发票号多格式并存时留权威源。 */
const SOURCE_RANK: Record<string, number> = { ofd: 0, xml: 1, pdf: 2 };

async function outcomeFromBytes(
  fileName: string,
  kind: 'pdf' | 'xml' | 'ofd',
  data: Uint8Array,
  deps: AnalyzeDeepDeps,
): Promise<ImportOutcome> {
  try {
    let invoice: ParsedInvoice | null;
    if (kind === 'xml') {
      invoice = parseInvoiceXmlText(decoder.decode(data));
    } else if (kind === 'ofd') {
      const xbrl = await deps.extractOfdXbrl(data);
      invoice = xbrl === null ? null : parseInvoiceXbrlText(xbrl);
    } else {
      invoice = parseInvoicePdfText(
        await deps.extractPdfLines(new File([new Uint8Array(data)], fileName)),
      );
    }
    if (invoice === null) {
      return { kind: 'unrecognized', fileName };
    }
    return { kind: 'parsed', fileName, invoice };
  } catch (error) {
    // ArchiveGateError: corrupt=损坏文件走 read；配额类才是真门禁 gate。
    if (error instanceof ArchiveGateError) {
      return { kind: 'failed', fileName, reason: error.code === 'corrupt' ? 'read' : 'gate' };
    }
    return { kind: 'failed', fileName, reason: 'read' };
  }
}

/**
 * 单文件深度编排：散件（pdf/xml/ofd）→ 单结局；容器（zip）→ 解包 → 逐条处置计划
 * （planInvoiceArchive 门禁）→ 逐条解析，成员 fileName 记为「包名 › 条目名」。
 * 安全门：输入字节上限（读前挡）+ 解包三道门（条目数/解压总量/单条目）+ 嵌套容器不展开。
 * 包内发票号去重：同号多格式留权威源（ofd>xbrl/xml>pdf），被去重的记 failed/dup 明示不静默。
 * 任何单点失败都只影响自己那条结局，不拖垮整包。
 */
export async function analyzeInvoiceFileDeep(
  file: File,
  deps: AnalyzeDeepDeps = defaultDeepDeps,
): Promise<ImportOutcome[]> {
  const fileName = file.name;
  const type = classifyInvoiceFile(fileName);
  if (type === null) {
    return [{ kind: 'failed', fileName, reason: 'type' }];
  }
  if (type === 'xml' || type === 'pdf') {
    return [await analyzeInvoiceFile(file, deps)];
  }
  // ofd / zip 都要读字节：输入上限先挡
  if (file.size > INVOICE_ARCHIVE_LIMITS.maxInputBytes) {
    return [{ kind: 'failed', fileName, reason: 'gate' }];
  }
  let data: Uint8Array;
  try {
    data = await deps.readBytes(file);
  } catch {
    return [{ kind: 'failed', fileName, reason: 'read' }];
  }

  if (type === 'ofd') {
    return [await outcomeFromBytes(fileName, 'ofd', data, deps)];
  }

  // zip 容器
  let entries: Map<string, Uint8Array>;
  try {
    entries = await deps.extractZip(data);
  } catch (error) {
    const reason =
      error instanceof ArchiveGateError && error.code !== 'corrupt' ? 'gate' : 'read';
    return [{ kind: 'failed', fileName, reason }];
  }
  const plan = planInvoiceArchive(
    [...entries.keys()].map((name) => ({ name, size: entries.get(name)!.length })),
  );
  // 整包无任何可解析条目（全是截图/文档）→ 容器记 failed/type，不让用户白等。
  if (!plan.some((p) => p.action === 'parse')) {
    return [{ kind: 'failed', fileName, reason: 'type' }];
  }

  const outcomes: ImportOutcome[] = [];
  const parsed: Array<ImportOutcome & { kind: 'parsed' }> = [];
  for (const entry of plan) {
    const memberName = `${fileName} › ${entry.name}`;
    if (entry.action === 'skip') {
      // 类型跳过（截图/说明文档）不打搅用户：不进失败列表。门禁类跳过要明示。
      if (entry.reason === 'type') continue;
      outcomes.push({
        kind: 'failed',
        fileName: memberName,
        reason: entry.reason === 'nestedContainer' ? 'nested' : 'gate',
      });
      continue;
    }
    const outcome = await outcomeFromBytes(
      memberName,
      entry.kind as 'pdf' | 'xml' | 'ofd',
      entries.get(entry.name)!,
      deps,
    );
    if (outcome.kind === 'parsed') parsed.push(outcome);
    else outcomes.push(outcome);
  }

  // 包内发票号去重（真实场景：同一票的 pdf+ofd 成对打包）
  const byNo = new Map<string, ImportOutcome & { kind: 'parsed' }>();
  for (const p of parsed) {
    const key = p.invoice.invoiceNo;
    const existing = byNo.get(key);
    if (!existing) {
      byNo.set(key, p);
      continue;
    }
    const kindOf = (o: typeof p) => classifyInvoiceEntryKind(o.fileName);
    const keep = SOURCE_RANK[kindOf(p)] < SOURCE_RANK[kindOf(existing)] ? p : existing;
    const drop = keep === p ? existing : p;
    byNo.set(key, keep);
    outcomes.push({ kind: 'failed', fileName: drop.fileName, reason: 'dup' });
  }
  return [...byNo.values(), ...outcomes];
}

/** 分 → 元输入框文本（两位小数；表单输入框一律字符串）。 */
function fenToYuanText(fen: number): string {
  return (fen / 100).toFixed(2);
}

/**
 * ParsedInvoice → 表单草稿（预填，用户可改后再提交）。
 * 类型无法从发票判断，恒落 'goods'（有明细行正好用；纯费用用户自己切 expense）；
 * 识别不出的字段留空串（= 表单的空值约定），不硬凑。
 */
export function draftFromParsedInvoice(invoice: ParsedInvoice): EntryDraft {
  const items: EntryItemDraft[] = invoice.items.map((item) => ({
    name: item.name,
    unit: item.unit ?? '',
    quantity: String(item.quantity),
    unitPriceYuan: item.unitPriceFen === null ? '' : fenToYuanText(item.unitPriceFen),
    amountYuan: fenToYuanText(item.amountFen),
  }));
  return {
    kind: 'goods',
    invoiceNo: invoice.invoiceNo,
    invoiceDate: invoice.invoiceDate ?? '',
    seller: invoice.seller ?? '',
    purchaserName: invoice.purchaserName ?? '',
    purchaserTaxNo: invoice.purchaserTaxNo ?? '',
    recognitionSource: invoice.recognitionSource,
    totalYuan:
      invoice.totalAmountFen === null ? '' : fenToYuanText(invoice.totalAmountFen),
    actualItemName: '',
    note: '',
    items: items.length > 0 ? items : [emptyItemDraft()],
  };
}
