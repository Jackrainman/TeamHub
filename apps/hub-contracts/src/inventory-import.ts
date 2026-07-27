import { z } from 'zod';
import { UTF8_BOM, tokenizeCsv } from './csv-core.js';
import { PartCategorySchema } from './inventory.js';

/**
 * 库存批量导入契约 + 纯解析器（INV-BULK-IMPORT 刀⑪，onboarding-init-wizard-2026-07-25 §4）——
 * 结构逐条镜像名册导入（roster-import.ts，ROSTER-IMPORT 刀⑦）：
 *  - CSV 模板生成（`buildInventoryTemplateCsv`，GET /api/inventory/template 直接回它）。
 *  - 上传 CSV 文本 → 结构化行（`parseInventoryCsv`；编码探测复用 csv-core `decodeCsvBytes`，与名册同律）。
 *
 * 行→PartType 的 id 生成 / partNumber 幂等 upsert 是**有状态**动作（要读实时库存），落在 hub-server
 * 的 store（`importPartTypes`），不在本纯模块。本模块只产「已校验的行草稿」+ 报告契约。
 *
 * **I0**：零件维度本就无人键——报告全是「库存事实回显给操作者本人」，绝不引入 recordedBy / 任何按人字段。
 */

// ── CSV 模板（GET /api/inventory/template）──────────────────────────────────────────────────────
// 表头列序即解析列序（parser 依此下标取字段）。**列说明放前端文案、不进 CSV 内**（照名册先例）。
// 低储阈值可空（空 = 新建行钉 0、更新行保留既有值）。件号是幂等 upsert 的匹配键。
export const INVENTORY_TEMPLATE_HEADERS = [
  '件号',
  '名称',
  '类别',
  '单位',
  '总数',
  '低储阈值',
] as const;

/** 构造库存导入 CSV 模板（表头 + 示例行，带 BOM + CRLF——Excel 友好）。GET /api/inventory/template 直接回此串。 */
export function buildInventoryTemplateCsv(): string {
  return `${UTF8_BOM}${INVENTORY_TEMPLATE_HEADERS.join(',')}\r\nGM6020,6020 云台电机,电机,个,6,2\r\nM4x12,M4x12 内六角螺栓,紧固件,个,200,50\r\n`;
}

// ── 已校验行草稿（parseInventoryCsv 产出，store.importPartTypes 消费）────────────────────────────
export const InventoryImportRowSchema = z.object({
  partNumber: z.string().min(1), // 幂等 upsert 匹配键（如 GM6020 / C620）
  name: z.string().min(1),
  category: PartCategorySchema, // 开放 string（同 PartType.category）
  unit: z.string().min(1), // "个"
  totalQuantity: z.number().int().nonnegative(),
  /** 可空：undefined = 新建行钉 0、更新行保留既有阈值（不动）。 */
  lowStockThreshold: z.number().int().nonnegative().optional(),
  /** 该行在 CSV 里的物理行号（1-based，含表头；parseInventoryCsv 填写）——store 侧拒行也能指回原行。 */
  line: z.number().int().positive().optional(),
});
export type InventoryImportRow = z.infer<typeof InventoryImportRowSchema>;

export const InventoryImportFailureSchema = z.object({
  /** 坏行的物理行号（1-based，含表头行——与 Excel/编辑器所见一致，便于操作者定位）。 */
  line: z.number().int().nonnegative(),
  reason: z.string().min(1),
});
export type InventoryImportFailure = z.infer<typeof InventoryImportFailureSchema>;

export interface InventoryParseResult {
  rows: InventoryImportRow[];
  errors: InventoryImportFailure[];
}

/** 非负整数单元格解析：空串 → null（调用方判「必填缺」或「可空未填」）；非整数/负数/非数 → NaN。 */
function parseCountCell(raw: string): number {
  if (raw === '') return Number.NaN;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : Number.NaN;
}

/**
 * CSV 文本 → 已校验行 + 坏行报告。**首条非空记录 = 表头**（模板由 buildInventoryTemplateCsv 生成），
 * 跳过。逐数据行（只读前六列，多余列忽略）：件号/名称/类别/单位为空 → 该行报错；总数缺失 / 非数 /
 * 负数 → 该行报错；低储阈值留空 = 合法（undefined），填了但不是非负整数 → 该行报错。
 * **任一坏行只报进 errors、不中断整批**（行号 = 物理行号，含表头）。
 */
export function parseInventoryCsv(text: string): InventoryParseResult {
  // 防御性剥前导 BOM（decodeCsvBytes 已处理，但独立调用也稳）。
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records = tokenizeCsv(clean);
  const rows: InventoryImportRow[] = [];
  const errors: InventoryImportFailure[] = [];
  let headerSkipped = false;
  for (const record of records) {
    if (!headerSkipped) {
      headerSkipped = true;
      continue;
    }
    const cell = (i: number) => (record.fields[i] ?? '').trim();
    const partNumber = cell(0);
    const name = cell(1);
    const category = cell(2);
    const unit = cell(3);
    const totalRaw = cell(4);
    const thresholdRaw = cell(5);

    if (partNumber === '') {
      errors.push({ line: record.line, reason: '件号为空' });
      continue;
    }
    if (name === '') {
      errors.push({ line: record.line, reason: '名称为空' });
      continue;
    }
    if (category === '') {
      errors.push({ line: record.line, reason: '类别为空' });
      continue;
    }
    if (unit === '') {
      errors.push({ line: record.line, reason: '单位为空' });
      continue;
    }
    const totalQuantity = parseCountCell(totalRaw);
    if (Number.isNaN(totalQuantity)) {
      errors.push({
        line: record.line,
        reason: `总数无法识别：「${totalRaw || '（空）'}」（应为非负整数）`,
      });
      continue;
    }
    // 低储阈值可空；填了就必须是非负整数。
    let lowStockThreshold: number | undefined;
    if (thresholdRaw !== '') {
      const parsed = parseCountCell(thresholdRaw);
      if (Number.isNaN(parsed)) {
        errors.push({
          line: record.line,
          reason: `低储阈值无法识别：「${thresholdRaw}」（应为非负整数或留空）`,
        });
        continue;
      }
      lowStockThreshold = parsed;
    }
    rows.push({
      partNumber,
      name,
      category,
      unit,
      totalQuantity,
      lowStockThreshold,
      line: record.line,
    });
  }
  return { rows, errors };
}

// ── 导入报告契约（POST /api/inventory/import 响应）──────────────────────────────────────────────
/**
 * 导入报告（段从简，不照搬名册六段）：created/updated（新建/更新的**件号**）、failed（坏行=行号+原因，
 * = 解析层 errors + store 侧拒行）。**绝不删**——库里有但表里没有的零件不动（import 只 upsert）。
 * I0：全是库存事实回显给操作者本人，无任何按人字段。
 */
export const InventoryImportReportSchema = z.object({
  created: z.array(z.string()),
  updated: z.array(z.string()),
  failed: z.array(InventoryImportFailureSchema),
});
export type InventoryImportReport = z.infer<typeof InventoryImportReportSchema>;

// ── 预览 / JSON 提交契约（照名册刀⑦ 双段：preview 只解析不落库 → 前端表格行内编辑 → JSON 提交导入）──

/** POST /api/inventory/preview 响应：解析出的行 + 坏行（行号+原因，形状与报告 failed 段一致）。不落库。 */
export const InventoryPreviewResponseSchema = z.object({
  rows: z.array(InventoryImportRowSchema),
  failed: z.array(InventoryImportFailureSchema),
});
export type InventoryPreviewResponse = z.infer<typeof InventoryPreviewResponseSchema>;

/** POST /api/inventory/import 的 JSON body（multipart 之外的双收形态）：编辑后的行草稿直进 store。 */
export const InventoryImportRowsRequestSchema = z.object({
  rows: z.array(InventoryImportRowSchema),
});
export type InventoryImportRowsRequest = z.infer<typeof InventoryImportRowsRequestSchema>;
