import { z } from 'zod';
import type { MemberGrade, MemberRole } from './pm-core.js';

// `TextDecoder` 是 Node/浏览器共有的 WHATWG 标准全局，但 contracts 的 tsconfig `lib=ES2022`
// （无 DOM / 无 node types）未声明它。这里补一个**最小、环境中立**的 module 级 ambient 声明——
// 只声明本文件用到的构造 + decode，**不 import 'node:util'**（那会把 node-only import 塞进浏览器打包）。
// module 级 `declare const` 只在本模块可见、不泄漏成全局，故与 hub-console（含 DOM lib）的 TextDecoder 无冲突。
declare const TextDecoder: {
  new (label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean }): {
    decode(input?: Uint8Array): string;
  };
};

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
export const ROSTER_TEMPLATE_HEADERS = ['姓名', '年级', '组', '组长', '验收人'] as const;

// UTF-8 BOM（U+FEFF）：Excel 直接双击打开 CSV 时据此识别 UTF-8（否则中文乱码）。
const UTF8_BOM = '﻿';
// U+FFFD 替换字符：TextDecoder(non-fatal) 遇非法字节序列时吐它，作编码探测信号。
const REPLACEMENT_CHAR = '�';

/** 构造名册导入 CSV 模板（仅表头行，带 BOM + CRLF——Excel 友好）。GET /api/roster/template 直接回此串。 */
export function buildRosterTemplateCsv(): string {
  return `${UTF8_BOM}${ROSTER_TEMPLATE_HEADERS.join(',')}\r\n`;
}

// ── 编码探测（K8 拍板②）───────────────────────────────────────────────────────────────────────
/**
 * 名册 CSV 字节 → 文本（编码自动探测）：
 *  - UTF-8 BOM（EF BB BF）→ 按 UTF-8 解（`TextDecoder('utf-8')` 默认剥 BOM）。
 *  - 无 BOM → 先按 UTF-8 解；出现替换字符 U+FFFD（非法 UTF-8 序列）→ 再按 gbk 重解
 *    （node24 内置 full-icu，`TextDecoder('gbk')` 可用；构造失败也兜底）。
 *  - 两者都出现 U+FFFD（或 gbk 不可用）→ `null`（路由转 400「编码无法识别，请另存为 CSV UTF-8」）。
 *
 * 纯函数（`TextDecoder`/`Uint8Array` 为 WHATWG 标准全局，Node/浏览器同在），便于用硬编码字节单测。
 */
export function decodeRosterBytes(bytes: Uint8Array): string | null {
  // BOM 探测：EF BB BF → 明确 UTF-8，短路（TextDecoder 默认 ignoreBOM=false，自动剥 BOM）。
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes);
  }
  const asUtf8 = new TextDecoder('utf-8').decode(bytes);
  if (!asUtf8.includes(REPLACEMENT_CHAR)) return asUtf8;
  // UTF-8 解出替换字符 → 疑似 GBK，重解。
  let asGbk: string;
  try {
    asGbk = new TextDecoder('gbk').decode(bytes);
  } catch {
    return null; // 运行时不支持 gbk（理论不至，node24 full-icu 内置）
  }
  if (!asGbk.includes(REPLACEMENT_CHAR)) return asGbk;
  return null;
}

// ── 中文年级 → grade 枚举（K8 拍板③）───────────────────────────────────────────────────────────
// 非法值该行报错进报告、不中断整批（见 parseRosterCsv）。
const GRADE_BY_LABEL: Record<string, MemberGrade> = {
  大一: 'freshman',
  大二: 'sophomore',
  大三: 'junior',
  大四: 'senior',
  研究生: 'graduate',
};

/** 验收人默认规则（K8 拍板③）：留空时大三及以上（junior/senior/graduate）默认 true，否则 false。 */
const GATE_REVIEWER_DEFAULT_GRADES: ReadonlySet<MemberGrade> = new Set([
  'junior',
  'senior',
  'graduate',
]);

// 组长列 / 验收人列真值 token（大小写不敏感）：勾选类符号 + 是/1/y/true 家族。
const TRUTHY_TOKENS: ReadonlySet<string> = new Set([
  '✓',
  '√',
  '☑',
  '是',
  '对',
  '1',
  'y',
  'yes',
  'true',
  't',
]);
// 验收人列显式假值 token（区别于「留空走默认」）。
const FALSY_TOKENS: ReadonlySet<string> = new Set([
  '✗',
  '×',
  '☐',
  '否',
  '0',
  'n',
  'no',
  'false',
  'f',
  'x',
]);

function isTruthyCell(raw: string): boolean {
  return TRUTHY_TOKENS.has(raw.trim().toLowerCase());
}

/** 验收人列三态：显式真 → true、显式假 → false、留空 / 无法识别 → null（走年级默认规则）。 */
function parseReviewerCell(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (v === '') return null;
  if (TRUTHY_TOKENS.has(v)) return true;
  if (FALSY_TOKENS.has(v)) return false;
  return null; // 无法识别 → 宽松走默认（不为一格拼写把整行判失败）
}

// ── 已校验行草稿（parseRosterCsv 产出，store.importRoster 消费）────────────────────────────────
export interface RosterImportRow {
  displayName: string;
  grade: MemberGrade;
  groupName: string;
  // 解析器只产 'groupAdmin' | 'member'（superAdmin 不经导入产生，store 侧另有降级保护）。
  role: MemberRole;
  gateReviewer: boolean;
  // true = 验收人列留空 + 年级默认规则判为 true（进报告 autoReviewers，让操作者看清自动标了谁）。
  gateReviewerAuto: boolean;
}

export interface RosterImportFailure {
  /** 坏行的物理行号（1-based，含表头行——与 Excel/编辑器所见一致，便于操作者定位）。 */
  line: number;
  reason: string;
}

export interface RosterParseResult {
  rows: RosterImportRow[];
  errors: RosterImportFailure[];
}

interface CsvRecord {
  fields: string[];
  line: number; // 1-based 物理行号（记录起始行）
}

/**
 * 手写零依赖 CSV 记录切分（RFC4180 子集）：支持引号字段（内部逗号 / 换行 / `""` 转义引号），
 * 跟踪每条记录的起始物理行号（供坏行报告）。全空记录（所有字段皆空）跳过（= 空行）。
 */
function tokenizeCsv(text: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let field = '';
  let fields: string[] = [];
  let inQuotes = false;
  let line = 1;
  let recordStartLine = 1;
  let atRecordStart = true;

  const pushField = () => {
    fields.push(field);
    field = '';
  };
  const pushRecord = () => {
    pushField();
    // 全空记录 = 空行（含 `,,,,` 全空列、Excel 尾随空行），跳过。
    if (!fields.every((f) => f === '')) {
      records.push({ fields, line: recordStartLine });
    }
    fields = [];
    atRecordStart = true;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (atRecordStart) {
      recordStartLine = line;
      atRecordStart = false;
    }
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
        continue;
      }
      if (ch === '\n') line++; // 引号内换行计入行号、但不结束记录
      field += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      pushField();
      continue;
    }
    if (ch === '\r') continue; // CRLF：吞 \r，等 \n 结束记录
    if (ch === '\n') {
      pushRecord();
      line++;
      continue;
    }
    field += ch;
  }
  // 末条无换行结尾（field 或已积累的 fields 非空）。
  if (field !== '' || fields.length > 0) pushRecord();
  return records;
}

/**
 * CSV 文本 → 已校验行 + 坏行报告（K8 拍板②/③）。**首条非空记录 = 表头**（模板由 buildRosterTemplateCsv
 * 生成、列说明在前端），跳过。逐数据行：姓名/组为空 → 该行报错；年级非法 → 该行报错；组长/验收人列
 * 按真值 token 判定，验收人留空走年级默认规则。**任一坏行只报进 errors、不中断整批**。
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
    const leadCell = record.fields[3] ?? '';
    const reviewerCell = record.fields[4] ?? '';

    if (displayName === '') {
      errors.push({ line: record.line, reason: '姓名为空' });
      continue;
    }
    const grade = GRADE_BY_LABEL[gradeLabel];
    if (!grade) {
      errors.push({
        line: record.line,
        reason: `年级无法识别：「${gradeLabel || '（空）'}」（应为 大一/大二/大三/大四/研究生）`,
      });
      continue;
    }
    if (groupName === '') {
      errors.push({ line: record.line, reason: '组为空' });
      continue;
    }
    const role: MemberRole = isTruthyCell(leadCell) ? 'groupAdmin' : 'member';
    const reviewerExplicit = parseReviewerCell(reviewerCell);
    const gateReviewer =
      reviewerExplicit !== null ? reviewerExplicit : GATE_REVIEWER_DEFAULT_GRADES.has(grade);
    const gateReviewerAuto = reviewerExplicit === null && gateReviewer;
    rows.push({ displayName, grade, groupName, role, gateReviewer, gateReviewerAuto });
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
