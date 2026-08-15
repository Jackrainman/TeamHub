import type {
  CreateReimburseEntryRequest,
  InvoiceRecognitionSource,
  ReimburseEntryKind,
  ReimburseItem,
} from '@teamhub/hub-contracts';

/**
 * 报账域纯函数（REIMBURSE-PROC 阶段 3）——金额分↔元格式化、新建表单草稿校验/装配。
 * 零 React / fetch，照 myview-utils / identity-utils「测逻辑不测 DOM」先例由 test/reimburse.test.ts 覆盖。
 */

/** 分 → 展示文本（¥1,234.56；负数 -¥0.88）。 */
export function formatAmountFen(fen: number): string {
  const sign = fen < 0 ? '-' : '';
  const abs = Math.abs(fen);
  const yuan = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, '0');
  return `${sign}¥${yuan.toLocaleString('zh-CN')}.${cents}`;
}

/** 用户输入的元文本 → 分（int）。容忍 ¥/￥/千分位/空格；超两位小数或无法解析 → null（不硬凑）。 */
export function yuanTextToFen(raw: string): number | null {
  const cleaned = raw.trim().replace(/[¥￥\s,，]/g, '');
  if (cleaned === '') {
    return null;
  }
  const m = /^(-?\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!m) {
    return null;
  }
  const yuan = Number.parseInt(m[1], 10);
  const cents = Number.parseInt((m[2] ?? '').padEnd(2, '0') || '0', 10);
  return yuan * 100 + (cleaned.startsWith('-') ? -cents : cents);
}

/** 新建表单明细行草稿（goods 类；输入框全部是字符串，装配时才转数值）。 */
export interface EntryItemDraft {
  name: string;
  unit: string;
  quantity: string;
  unitPriceYuan: string; // 空 = 无单价（unitPriceFen=null）
  amountYuan: string;
}

export interface EntryDraft {
  kind: ReimburseEntryKind;
  invoiceNo: string;
  invoiceDate: string; // input[type=date] 的 YYYY-MM-DD 或 ''
  seller: string;
  purchaserName: string;
  purchaserTaxNo: string;
  recognitionSource: InvoiceRecognitionSource;
  totalYuan: string;
  actualItemName: string;
  note: string;
  items: EntryItemDraft[];
}

export function emptyItemDraft(): EntryItemDraft {
  return { name: '', unit: '', quantity: '', unitPriceYuan: '', amountYuan: '' };
}

/** 空表单草稿（手动录入初值 / 导入未识别时开空表单）。 */
export function emptyEntryDraft(): EntryDraft {
  return {
    kind: 'goods',
    invoiceNo: '',
    invoiceDate: '',
    seller: '',
    purchaserName: '',
    purchaserTaxNo: '',
    recognitionSource: 'manual',
    totalYuan: '',
    actualItemName: '',
    note: '',
    items: [emptyItemDraft()],
  };
}

function isBlankItem(item: EntryItemDraft): boolean {
  return (
    item.name.trim() === '' &&
    item.unit.trim() === '' &&
    item.quantity.trim() === '' &&
    item.unitPriceYuan.trim() === '' &&
    item.amountYuan.trim() === ''
  );
}

/** 可选文本：空串/纯空白 → null（schema 的 nullable 语义），否则 trim 后文本。 */
function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * 草稿 → POST 请求体；任一必填/已填字段非法 → null（表单据此算 valid，不给服务端递坏数据）。
 * 规则：totalYuan 必须可解析且 ≥0（金额是报账唯一硬字段）；goods 的非空明细行每行须
 * 名称非空 + 数量>0 + 金额可解析；全空行直接丢弃（允许先建无明细草稿，状态派生会标 partial）。
 */
export function buildCreateEntryRequest(
  draft: EntryDraft,
  projectId: string,
): CreateReimburseEntryRequest | null {
  const normalizedProjectId = projectId.trim();
  if (normalizedProjectId === '') {
    return null;
  }
  const totalAmountFen = yuanTextToFen(draft.totalYuan);
  if (totalAmountFen === null || totalAmountFen < 0) {
    return null;
  }

  const items: ReimburseItem[] = [];
  if (draft.kind === 'goods') {
    for (const row of draft.items) {
      if (isBlankItem(row)) {
        continue;
      }
      const name = row.name.trim();
      const quantity = Number(row.quantity.trim());
      const amountFen = yuanTextToFen(row.amountYuan);
      const unitPriceFen =
        row.unitPriceYuan.trim() === '' ? null : yuanTextToFen(row.unitPriceYuan);
      if (
        name === '' ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        amountFen === null ||
        (row.unitPriceYuan.trim() !== '' && unitPriceFen === null)
      ) {
        return null;
      }
      items.push({
        name,
        unit: optionalText(row.unit),
        quantity,
        unitPriceFen,
        amountFen,
      });
    }
  }

  return {
    projectId: normalizedProjectId,
    kind: draft.kind,
    invoiceNo: optionalText(draft.invoiceNo),
    invoiceDate: optionalText(draft.invoiceDate),
    seller: optionalText(draft.seller),
    purchaserName: optionalText(draft.purchaserName),
    purchaserTaxNo: optionalText(draft.purchaserTaxNo),
    recognitionSource: draft.recognitionSource,
    totalAmountFen,
    items,
    actualItemName: optionalText(draft.actualItemName),
    materials: { paymentShot: false, inspection: false }, // 新条目材料恒未备，在卡片上勾
    note: optionalText(draft.note),
  };
}
