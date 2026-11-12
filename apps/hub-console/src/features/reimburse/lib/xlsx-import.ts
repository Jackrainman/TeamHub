import { kindForExpenseType, type ReimburseExpenseType } from '@teamhub/hub-contracts';
import { extractZipEntries } from './archive-extract';
import { emptyEntryDraft, emptyItemDraft, yuanTextToFen, type EntryDraft } from '../reimburse-utils';

function decodeXml(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (entity) => {
    if (entity === '&amp;') return '&';
    if (entity === '&lt;') return '<';
    if (entity === '&gt;') return '>';
    if (entity === '&quot;') return '"';
    if (entity === '&apos;') return "'";
    const code = entity.toLowerCase().startsWith('&#x') ? Number.parseInt(entity.slice(3, -1), 16) : Number.parseInt(entity.slice(2, -1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
  });
}
function textElements(xml: string): string {
  return [...xml.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((match) => decodeXml(match[1])).join('');
}
function attribute(tag: string, name: string): string {
  return new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag)?.[1] ?? '';
}
function columnIndex(reference: string): number {
  const letters = /^([A-Z]+)/.exec(reference)?.[1] ?? 'A';
  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

/** 读取首个工作表的缓存单元格；不执行公式、宏或外部链接。 */
export async function readXlsxRows(file: File): Promise<string[][]> {
  const { entries } = await extractZipEntries(new Uint8Array(await file.arrayBuffer()));
  const decoder = new TextDecoder();
  const read = (name: string) => entries.has(name) ? decoder.decode(entries.get(name)) : '';
  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) => textElements(match[1]));
  const workbook = read('xl/workbook.xml');
  const relationshipId = attribute(/<sheet\b[^>]*>/.exec(workbook)?.[0] ?? '', 'r:id') || 'rId1';
  const relationship = [...read('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)]
    .map((match) => match[0]).find((tag) => attribute(tag, 'Id') === relationshipId);
  const target = attribute(relationship ?? '', 'Target') || 'worksheets/sheet1.xml';
  const sheetName = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  const sheet = read(sheetName);
  if (!sheet) throw new Error('XLSX_FIRST_SHEET_MISSING');
  return [...sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
    const values: string[] = [];
    for (const match of row[1].matchAll(/<c\b[^>]*(?:\/>|>[\s\S]*?<\/c>)/g)) {
      const cell = match[0];
      const tag = /<c\b[^>]*>/.exec(cell)?.[0] ?? cell;
      const index = columnIndex(attribute(tag, 'r'));
      const type = attribute(tag, 't');
      const raw = type === 'inlineStr' ? textElements(cell) : decodeXml(/<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cell)?.[1] ?? '');
      values[index] = type === 's' ? shared[Number(raw)] ?? '' : raw;
    }
    return values.map((value) => value ?? '');
  });
}

function expenseType(value: string): ReimburseExpenseType | null {
  const normalized = value.trim().toLowerCase();
  if (['purchase', '采购', '实际物资'].includes(normalized)) return 'purchase';
  if (['taxi', '打车', '网约车'].includes(normalized)) return 'taxi';
  if (['ticket', '车票', '火车票'].includes(normalized)) return 'ticket';
  if (['other', '其他'].includes(normalized)) return 'other';
  return null;
}
function excelDate(value: string): string {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return value;
  const serial = Number(value);
  if (serial < 1 || serial > 100000) return value;
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000).toISOString().slice(0, 10);
}

/** 每个非空 Excel 行只生成待确认草稿，不与服务器双向同步。 */
export function draftsFromXlsxRows(rows: readonly string[][]): EntryDraft[] {
  if (rows.length === 0) return [];
  const headers = rows[0].map((header) => header.trim());
  const value = (row: string[], names: string[]) => {
    const index = headers.findIndex((header) => names.includes(header));
    return index >= 0 ? row[index]?.trim() ?? '' : '';
  };
  return rows.slice(1).filter((row) => row.some((cell) => cell.trim())).map((row) => {
    const type = expenseType(value(row, ['支出类型', '类型', 'expenseType', 'kind']));
    const draft = emptyEntryDraft();
    draft.expenseType = type;
    draft.kind = type ? kindForExpenseType(type) : 'expense';
    draft.summary = value(row, ['费用摘要', '摘要', '实际物资', 'summary']);
    draft.invoiceType = 'unknown';
    draft.invoiceNo = value(row, ['发票号码', '发票号', 'invoiceNo']);
    draft.invoiceDate = excelDate(value(row, ['发票日期', '开票日期', 'invoiceDate']));
    draft.seller = value(row, ['销售方', '销方', 'seller']);
    draft.purchaserName = value(row, ['购买方名称', '购买方', 'purchaserName']);
    draft.purchaserTaxNo = value(row, ['购买方税号', '纳税人识别号', 'purchaserTaxNo']);
    draft.totalYuan = value(row, ['实付金额', '申请金额', '价税合计', '金额', 'totalYuan']).replace(/[¥￥,，\s]/g, '');
    draft.actualItemName = value(row, ['实际物资', 'actualItemName']);
    draft.note = value(row, ['备注', 'note']);
    const itemName = value(row, ['商品名称', '物品名称', '明细名称']);
    const quantity = value(row, ['数量', 'quantity']);
    const amount = value(row, ['明细金额', '商品金额', 'itemAmount']);
    if (itemName && Number(quantity) > 0 && yuanTextToFen(amount) !== null) {
      const unitPrice = value(row, ['单价', 'unitPrice']);
      draft.items = [{ ...emptyItemDraft(), name: itemName, unit: value(row, ['单位', 'unit']), quantity,
        unitPriceYuan: unitPrice, amountYuan: amount.replace(/[¥￥,，\s]/g, '') }];
      if (!type) { draft.expenseType = 'purchase'; draft.kind = 'goods'; }
    }
    return draft;
  });
}

export async function draftsFromReimburseXlsx(file: File): Promise<EntryDraft[]> {
  return draftsFromXlsxRows(await readXlsxRows(file));
}
