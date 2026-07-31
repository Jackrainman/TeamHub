import { z } from 'zod';
import { UTF8_BOM, tokenizeCsv } from './csv-core.js';
import { RobotTargetSchema, type RobotTarget } from './pm-core.js';
import { RESOURCE_INIT_STATUSES } from './resource-requests.js';

/**
 * 车队批量导入契约 + 纯解析器（FLEET-CSV-IMPORT，照库存导入 inventory-import.ts / 名册导入 roster-import.ts
 * 结构）：初始化向导「车队」步的 CSV 主路径——模板下载（`buildFleetTemplateCsv`，GET /api/resources/template
 * 直接回它）+ 上传 CSV 文本 → 结构化行（`parseFleetCsv`；编码探测复用 csv-core `decodeCsvBytes`，与名册/库存同律）。
 *
 * 行 → SharedResource 的 id / displayCode 派生是**有状态**动作（要读实时车队 + deriveDisplayCode），落在
 * hub-server 的 store（`createResource`，经既有 POST /api/resources/batch 消费）。本模块只产「已校验的行草稿」
 * + 预览契约。预览确认后前端把行拼成 CreateResourcesBatchRequest 走既有批量端点——**本模块不新增落库语义**。
 *
 * 行形状刻意与 CreateResourcesBatchRequestSchema 的单项同形（+ 物理行号 line）：预览编辑完剥掉 line 即合法
 * 批量请求体（kind 缺省 robot、statusReason 不引入）。
 *
 * **I0**：车队维度本就无人键——预览/报告全是「车队事实回显给操作者本人」，绝不引入 recordedBy / 任何按人字段。
 */

// ── CSV 模板（GET /api/resources/template）──────────────────────────────────────────────────────
// 表头列序即解析列序（parser 依此下标取字段）。**列说明放前端文案、不进 CSV 内**（照名册/库存先例）。
// 五列：名称 / 编号（R1·R2·共用）/ 赛季码（后两位，可空）/ 第几代（可空=默认 1）/ 状态（能用·在修·退役·停用，可空=能用）。
export const FLEET_TEMPLATE_HEADERS = ['名称', '编号', '赛季码', '第几代', '状态'] as const;

/** 构造车队导入 CSV 模板（表头 + 示例行，带 BOM + CRLF——Excel 友好）。GET /api/resources/template 直接回此串。 */
export function buildFleetTemplateCsv(): string {
  return `${UTF8_BOM}${FLEET_TEMPLATE_HEADERS.join(',')}\r\nR1 比赛机器人,R1,27,1,能用\r\n共用备件车,共用,,2,在修\r\n`;
}

// ── 中文编号位 / 状态 → 枚举（照名册 GRADE_BY_LABEL 范式；非法值该行报错进报告、不中断整批）────────────
/** 编号位：R1/R2 原样，「共用」→ shared（兼容直接写 shared）。 */
const FLEET_TARGET_BY_LABEL: Record<string, RobotTarget> = {
  R1: 'R1',
  R2: 'R2',
  共用: 'shared',
  shared: 'shared',
};

/** 状态四档（与 contracts RESOURCE_INIT_STATUSES 同源）：中文标签 → 枚举；空 = 默认 available（解析器补）。 */
const FLEET_STATUS_BY_LABEL: Record<string, (typeof RESOURCE_INIT_STATUSES)[number]> = {
  能用: 'available',
  在修: 'repair',
  退役: 'retired',
  停用: 'down',
};

// ── 已校验行草稿（parseFleetCsv 产出，前端拼 CreateResourcesBatchRequest 消费）──────────────────────
export const FleetImportRowSchema = z.object({
  name: z.string().min(1),
  robotTarget: RobotTargetSchema,
  /** 赛季后两位（如 "27"）；可空（undefined → displayCode 不派生赛季位、读视图回退 name）。 */
  season: z.string().min(1).optional(),
  /** 第几代整机；可空（undefined → 批量端点/store 默认 1）。 */
  version: z.number().int().positive().optional(),
  /** 初始化四档；可空（undefined → available）。 */
  status: z.enum(RESOURCE_INIT_STATUSES).optional(),
  /** 该行在 CSV 里的物理行号（1-based，含表头；parseFleetCsv 填写）——坏行报告与预览指回原行。 */
  line: z.number().int().positive().optional(),
});
export type FleetImportRow = z.infer<typeof FleetImportRowSchema>;

export const FleetImportFailureSchema = z.object({
  /** 坏行的物理行号（1-based，含表头行——与 Excel/编辑器所见一致，便于操作者定位）。 */
  line: z.number().int().nonnegative(),
  reason: z.string().min(1),
});
export type FleetImportFailure = z.infer<typeof FleetImportFailureSchema>;

export interface FleetParseResult {
  rows: FleetImportRow[];
  errors: FleetImportFailure[];
}

/** 正整数字符串判定（'' 不算；前导 + / 小数 / 负数 / 非数全拒）——第几代单元格用。 */
function parseVersionCell(raw: string): number {
  if (!/^\d+$/.test(raw)) return Number.NaN;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : Number.NaN;
}

/**
 * CSV 文本 → 已校验行 + 坏行报告。**首条非空记录 = 表头**（模板由 buildFleetTemplateCsv 生成），跳过。
 * 逐数据行（只读前五列，多余列忽略）：名称为空 → 该行报错；编号非法（非 R1/R2/共用/shared）→ 该行报错；
 * 第几代填了但非正整数 → 该行报错；状态填了但非四档 → 该行报错。赛季码 / 第几代 / 状态留空皆合法
 * （undefined，批量端点/store 补默认）。**任一坏行只报进 errors、不中断整批**（行号 = 物理行号，含表头）。
 */
export function parseFleetCsv(text: string): FleetParseResult {
  // 防御性剥前导 BOM（decodeCsvBytes 已处理，但独立调用也稳）。
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records = tokenizeCsv(clean);
  const rows: FleetImportRow[] = [];
  const errors: FleetImportFailure[] = [];
  let headerSkipped = false;
  for (const record of records) {
    if (!headerSkipped) {
      headerSkipped = true;
      continue;
    }
    const cell = (i: number) => (record.fields[i] ?? '').trim();
    const name = cell(0);
    const targetLabel = cell(1);
    const season = cell(2);
    const versionRaw = cell(3);
    const statusLabel = cell(4);

    if (name === '') {
      errors.push({ line: record.line, reason: '名称为空' });
      continue;
    }
    const robotTarget = FLEET_TARGET_BY_LABEL[targetLabel];
    if (!robotTarget) {
      errors.push({
        line: record.line,
        reason: `编号无法识别：「${targetLabel || '（空）'}」（应为 R1/R2/共用）`,
      });
      continue;
    }
    // 第几代可空；填了就必须是正整数。
    let version: number | undefined;
    if (versionRaw !== '') {
      const parsed = parseVersionCell(versionRaw);
      if (Number.isNaN(parsed)) {
        errors.push({
          line: record.line,
          reason: `第几代无法识别：「${versionRaw}」（应为正整数或留空）`,
        });
        continue;
      }
      version = parsed;
    }
    // 状态可空（= 能用）；填了就必须命中四档。
    let status: (typeof RESOURCE_INIT_STATUSES)[number] | undefined;
    if (statusLabel !== '') {
      const mapped = FLEET_STATUS_BY_LABEL[statusLabel];
      if (!mapped) {
        errors.push({
          line: record.line,
          reason: `状态无法识别：「${statusLabel}」（应为 能用/在修/退役/停用）`,
        });
        continue;
      }
      status = mapped;
    }
    rows.push({
      name,
      robotTarget,
      season: season === '' ? undefined : season,
      version,
      status,
      line: record.line,
    });
  }
  return { rows, errors };
}

// ── 预览契约（POST /api/resources/preview 响应；照库存/名册 preview 段）──────────────────────────────

/** POST /api/resources/preview 响应：解析出的行 + 坏行（行号+原因）。**只解析不落库**，确认后前端走批量端点。 */
export const FleetPreviewResponseSchema = z.object({
  rows: z.array(FleetImportRowSchema),
  failed: z.array(FleetImportFailureSchema),
});
export type FleetPreviewResponse = z.infer<typeof FleetPreviewResponseSchema>;
