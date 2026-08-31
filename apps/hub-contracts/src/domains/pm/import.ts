import { z } from 'zod';
import { MemberGradeSchema, type MemberGrade } from './model.js';
import { UTF8_BOM, decodeCsvBytes, tokenizeCsv } from '../../csv-core.js';

// INV-BULK-IMPORT 刀⑪：编码探测 + CSV 记录切分抽成 csv-core 两域共用（库存导入同一套规则）。
// `decodeRosterBytes` 保留原名 re-export，server/测试既有 import 零变化。


/**
 * 名册导入契约 + 纯解析器（ROSTER-IMPORT，K8——minor v0.25.0）。
 *
 * **动机**：名册此前没有任何增删通道（唯一来源 = demo seed 落盘）；身份模式 + 空板 = 登录死锁
 * （无人可选 → 无法登录 → 无法初始化管理员）。本模块给「批量导入 CSV 名册」提供两块纯能力：
 *  - CSV 模板生成（`buildRosterTemplateCsv`，GET /api/roster/template 直接回它）。
 *  - 上传 CSV 字节 → 结构化行（`decodeRosterBytes` 编码探测 + `parseRosterCsv` 手写零依赖切分 + 行→草稿映射）。
 *
 * 行→Member 的 id 生成 / 组解析（建组）/ displayName 幂等 upsert 是**有状态**动作（要读实时名册 +
 * id 序列），落在 hub-server 的 store（`importRoster`），不在本纯模块。本模块只产「已校验的行草稿」+ 报告契约。
 *
 * **I0**：报告全是「名单事实回显给操作者本人」（队长在看自己刚导的表），绝不落任何按人聚合统计字段
 * （无完成量 / 无排名 / 无按人筛选派生）。
 */

// ── CSV 模板（GET /api/roster/template）─────────────────────────────────────────────────────────
// 表头列序即解析列序（parser 依此下标取字段）。**列说明放前端文案、不进 CSV 内**（K8 拍板①）。
// **三列（ROSTER-CSV-3COL，公测补强刀③，2026-07-24 用户拍板）**：原五列（姓名/年级/组/组长/验收人）
// 去掉组长、验收人两列——组长改在导入后确认页逐组选（有成员必选），验收人沿用年级默认派生
// （大三及以上，见 GATE_REVIEWER_DEFAULT_GRADES）。解析器不再产 role。
export const ROSTER_TEMPLATE_HEADERS = ['姓名', '年级', '组'] as const;

/** 构造名册导入 CSV 模板（表头 + 示例行，带 BOM + CRLF——Excel 友好）。GET /api/roster/template 直接回此串。 */
export function buildRosterTemplateCsv(): string {
  return `${UTF8_BOM}${ROSTER_TEMPLATE_HEADERS.join(',')}\r\n张三,大二,电控\r\n李四,研一,视觉\r\n`;
}

// ── 中文年级 → grade 枚举（K8 拍板③ + GRADE-7-TIERS 刀⑥）───────────────────────────────────────
// 非法值该行报错进报告、不中断整批（见 parseRosterCsv）。
const GRADE_BY_LABEL: Record<string, MemberGrade> = {
  大一: 'freshman',
  大二: 'sophomore',
  大三: 'junior',
  大四: 'senior',
  研一: 'grad1',
  研二: 'grad2',
  研三: 'grad3',
  研究生: 'graduate', // legacy 档：旧 CSV 写法仍可导入
};

/**
 * 验收人默认规则（K8 拍板③，刀③ 后唯一来源；GRADE-7-TIERS 刀⑥ 扩研档）：大三及以上
 * （junior/senior/graduate/grad1/grad2/grad3）默认 true，否则 false。**导出供 server 端
 * bootstrap 等其它「年级→验收人」派生消费同一来源**（server 不再手列枚举）。
 */
export const GATE_REVIEWER_DEFAULT_GRADES: ReadonlySet<MemberGrade> = new Set([
  'junior',
  'senior',
  'graduate',
  'grad1',
  'grad2',
  'grad3',
]);

// ── 已校验行草稿（parseRosterCsv 产出，store.importRoster 消费）────────────────────────────────
// ROSTER-IMPORT-PREVIEW 刀⑦ 起落成 zod schema（JSON body / preview 响应都要校验），类型仍同形导出。
export const RosterImportRowSchema = z.object({
  displayName: z.string().min(1),
  grade: MemberGradeSchema,
  groupName: z.string().min(1),
  // 验收人 = 年级默认规则派生（刀③ 去掉验收人列后沿用既有默认，无新逻辑）。
  gateReviewer: z.boolean(),
  // true = 按年级默认规则判为 true（进报告 autoReviewers，让操作者看清自动标了谁）。刀③ 后恒等于
  // gateReviewer（无显式列可覆盖，全部自动）。
  gateReviewerAuto: z.boolean(),
  /**
   * 该行在 CSV 里的物理行号（1-based，含表头；parseRosterCsv 填写）。刀④ PROGRAM-GROUP-ABSTRACT：
   * store 侧拒绝（组名命中非叶子/哨兵组）也要进报告 failed 段，行号随行带到 store 才能指回原行。
   * 非 CSV 来源（如 setup bootstrap 单行复用）不填 → 报告里 line=0。
   */
  line: z.number().int().positive().optional(),
});
export type RosterImportRow = z.infer<typeof RosterImportRowSchema>;

export interface RosterImportFailure {
  /** 坏行的物理行号（1-based，含表头行——与 Excel/编辑器所见一致，便于操作者定位）。 */
  line: number;
  reason: string;
}

export interface RosterParseResult {
  rows: RosterImportRow[];
  errors: RosterImportFailure[];
}

/**
 * CSV 文本 → 已校验行 + 坏行报告（K8 拍板②/③ + 刀③ 三列）。**首条非空记录 = 表头**（模板由
 * buildRosterTemplateCsv 生成、列说明在前端），跳过。逐数据行（只读前三列，多余列忽略）：姓名/组为空 →
 * 该行报错；年级非法 → 该行报错；验收人按年级默认规则派生（大三及以上）。**任一坏行只报进 errors、
 * 不中断整批**。
 */
export function parseRosterCsv(text: string): RosterParseResult {
  // 防御性剥前导 BOM（decodeRosterBytes 已处理，但独立调用也稳）。
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records = tokenizeCsv(clean);
  const rows: RosterImportRow[] = [];
  const errors: RosterImportFailure[] = [];
  let headerSkipped = false;
  for (const record of records) {
    if (!headerSkipped) {
      headerSkipped = true;
      continue;
    }
    const cell = (i: number) => (record.fields[i] ?? '').trim();
    const displayName = cell(0);
    const gradeLabel = cell(1);
    const groupName = cell(2);

    if (displayName === '') {
      errors.push({ line: record.line, reason: '姓名为空' });
      continue;
    }
    const grade = GRADE_BY_LABEL[gradeLabel];
    if (!grade) {
      errors.push({
        line: record.line,
        reason: `年级无法识别：「${gradeLabel || '（空）'}」（应为 大一/大二/大三/大四/研一/研二/研三/研究生）`,
      });
      continue;
    }
    if (groupName === '') {
      errors.push({ line: record.line, reason: '组为空' });
      continue;
    }
    const gateReviewer = GATE_REVIEWER_DEFAULT_GRADES.has(grade);
    rows.push({
      displayName,
      grade,
      groupName,
      gateReviewer,
      gateReviewerAuto: gateReviewer,
      line: record.line, // 刀④：行号随行带到 store——组名命中非叶子/哨兵组被拒时能指回原行
    });
  }
  return { rows, errors };
}

// ── 导入报告契约（POST /api/roster/import 响应）────────────────────────────────────────────────
export const RosterImportFailureSchema = z.object({
  line: z.number().int().nonnegative(),
  reason: z.string().min(1),
});

/**
 * 导入报告（K8 拍板⑥）：六段全是**名单事实回显给操作者本人**（队长看自己刚导的表）——
 * created/updated（新建/更新的姓名）、failed（坏行=行号+原因）、missingFromSheet（库里有但表里没有、
 * 绝不删）、createdGroups（自动新建的组名）、autoReviewers（按规则自动标为验收人的姓名）。
 * **I0**：绝不落任何聚合统计字段（无完成量 / 无排名 / 无按人筛选派生）。
 */
export const RosterImportReportSchema = z.object({
  created: z.array(z.string()),
  updated: z.array(z.string()),
  failed: z.array(RosterImportFailureSchema),
  missingFromSheet: z.array(z.string()),
  createdGroups: z.array(z.string()),
  autoReviewers: z.array(z.string()),
});
export type RosterImportReport = z.infer<typeof RosterImportReportSchema>;

// ── 预览 / JSON 提交契约（ROSTER-IMPORT-PREVIEW 刀⑦，2026-07-25 用户拍板：预览表可编辑防手打错）─────────
// CSV 纯文本做不了下拉——前后端拆两段：preview（只解析不落库）→ 前端表格行内改年级/组 → 确认后 JSON
// 提交导入。行草稿（RosterImportRow）即编辑载体，两端共用同一 schema。

/** POST /api/roster/preview 响应：解析出的行 + 坏行（行号+原因，形状与报告 failed 段一致）。不落库。 */
export const RosterPreviewResponseSchema = z.object({
  rows: z.array(RosterImportRowSchema),
  failed: z.array(RosterImportFailureSchema),
});
export type RosterPreviewResponse = z.infer<typeof RosterPreviewResponseSchema>;

/** POST /api/roster/import 的 JSON body（multipart 之外的双收形态）：编辑后的行草稿直进 store。 */
export const RosterImportRowsRequestSchema = z.object({
  rows: z.array(RosterImportRowSchema),
});
export type RosterImportRowsRequest = z.infer<typeof RosterImportRowsRequestSchema>;
