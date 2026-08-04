import {
  parseInvoicePdfText,
  parseInvoiceXmlText,
  type ParsedInvoice,
} from '@teamhub/hub-contracts';
import { extractPdfTextLines } from './lib/pdf-extract';
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
export type ImportOutcome =
  | { kind: 'parsed'; fileName: string; invoice: ParsedInvoice }
  | { kind: 'unrecognized'; fileName: string }
  | { kind: 'failed'; fileName: string; reason: 'type' | 'read' };

/** 按扩展名分类（大小写不敏感）；非 .pdf/.xml → null（跳过并报错，不硬解）。 */
export function classifyInvoiceFile(fileName: string): 'xml' | 'pdf' | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xml')) {
    return 'xml';
  }
  if (lower.endsWith('.pdf')) {
    return 'pdf';
  }
  return null;
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
  if (type === null) {
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
    totalYuan:
      invoice.totalAmountFen === null ? '' : fenToYuanText(invoice.totalAmountFen),
    actualItemName: '',
    note: '',
    items: items.length > 0 ? items : [emptyItemDraft()],
  };
}
