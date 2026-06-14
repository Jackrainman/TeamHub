import type { IssueSeverity } from '@teamhub/hub-contracts';

/**
 * ProbeFlash `.debug-archive` 一次性导入解析器（KB-IMPORT-PROBEFLASH，frontier#1）。
 *
 * 把 `debug-checklist` skill 攒下的历史归档 markdown（异构：部分有 YAML frontmatter、部分是
 * 裸检查清单；单文件常汇总多个历史 bug）**best-effort** 解析成一张「知识档案卡」的中间结构，
 * 交给 CLI（import-debug-archive.ts）喂 canonical `buildCloseoutFromIssue`（注入历史时戳）落进
 * 检索语料。**纯函数、零 IO**，可单测。
 *
 * 设计取舍（诚实标注，AGENTS §10）：
 * - **一文件 = 一张归档卡**（非一 bug 一卡）。这些归档多是「整篇汇总 N 个历史问题」的文档，
 *   逐 bug 拆卡需要可靠的结构边界（这些文档没有），best-effort 下「整篇可被检索召回」比「假装精确拆分」
 *   更诚实、recall 更稳。`rawInput` 存全文 → kb-similar 的关键词重合扫描覆盖整篇正文。
 * - **历史时戳**：日期取 frontmatter `date` → 文件名日期前缀 → 正文「自动生成于 / 生成时间」→ 兜底常量。
 *   errorCode 由 CLI 用本日期派生（`DBG-<历史日期>-NNN`），**不是 server 当前钟**（backlog 明列）。
 * - **rootCause/resolution best-effort**：能抽到「根因 / 修复」段就抽（关键词富集，利于 kb-similar 的
 *   根因/处理术语重合打分）；抽不到则给**诚实的指向性兜底**（「详见归档正文」），不杜撰具体结论（C4/§10）。
 * - **不下判断**：解析只做提取 + 词表标签，不推断「同因」「该谁修」；标签是客观关键词命中（A4/C2 无人维度）。
 */

/** 解析产物：构造输入 IssueCard + 结案输入所需的人本字段（CLI 据此组卡 + 调 buildCloseoutFromIssue）。 */
export interface ParsedArchive {
  /** 文件名派生的稳定 ascii slug（用于 issueId / 归档文件名，保证可 sluggable）。 */
  slug: string;
  /** 历史时戳（ISO8601 带 offset）；errorCode / 归档日期 / 卡时间戳都用它。 */
  historicalNow: string;
  title: string;
  symptom: string;
  /** 全文正文（去 frontmatter）；进 IssueCard.rawInput 供全文关键词召回。 */
  rawInput: string;
  tags: string[];
  relatedFiles: string[];
  relatedCommits: string[];
  severity: IssueSeverity;
  category: string;
  rootCause: string;
  resolution: string;
  prevention: string;
}

/** 缺日期时的兜底（归档批次大致时间 2026R2 赛季）；CLI 会 log 标注哪些文件落到兜底。 */
const FALLBACK_DATE = '2026-05-12T00:00:00.000Z';

/** 领域词表：命中关键词 → 规范标签。标签驱动 kb-similar 打分（标签重合 ×4），故覆盖战队常见子系统。 */
const TAG_VOCAB: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bfdcan\b|\bcan\b|can[_\s-]?list/i, 'CAN'],
  [/microros|micro-ros|micro\s*ros/i, 'MicroROS'],
  [/freertos/i, 'FreeRTOS'],
  [/\bdma\b/i, 'DMA'],
  [/\buart\b|\busart\b|串口/i, '串口'],
  [/\bidle\b/i, 'IDLE'],
  [/systick/i, 'SysTick'],
  [/达妙|\b8006\b|\b6220\b|damiao/i, '达妙'],
  [/\b3508\b/i, '3508'],
  [/电机|motor/i, '电机'],
  [/底盘|chassis/i, '底盘'],
  [/机械臂|arm[_\s-]?ctrl|机械 ?臂/i, '机械臂'],
  [/夹爪|catch|gripper/i, '夹爪'],
  [/抬升|lift/i, '抬升'],
  [/hardfault|hard fault/i, 'HardFault'],
  [/\bheap\b|堆栈|内存|malloc|configtotal_heap/i, '内存'],
  [/互斥锁|mutex/i, '互斥锁'],
  [/\biic\b|\bi2c\b/i, 'IIC'],
  [/光电/i, '光电开关'],
  [/轨迹规划|trajectory/i, '轨迹规划'],
  [/合并冲突|merge\s*conflict|合并.*bug|合并中的/i, '合并冲突'],
  [/初始化|init\b/i, '初始化'],
  [/\bfifo\b/i, 'FIFO'],
  [/stm32/i, 'STM32'],
  [/上电顺序|上电|power[\s-]?on/i, '上电时序'],
  [/yaw|陀螺仪|imu/i, '姿态'],
];

/** 高危词：命中升 severity（best-effort，不下结论，只标主观显著度）。 */
const HIGH_SEVERITY_PATTERN = /烧毁|烧了|冒烟|hardfault|失控|卡死|死循环|堵转/i;
const MEDIUM_HIGH_PATTERN = /\[优先级[:：]\s*高\]|严重|阻塞/;

/**
 * frontmatter 抽取：仅当文件以 `---\n` 开头时解析首个 `---` 块。返回 {fields, body}。
 * 不引 YAML 库（零依赖，照仓库惯例）；只解析本归档实际用到的标量 + 简单 `[...]` 数组。
 */
interface Frontmatter {
  fields: Record<string, string>;
  arrays: Record<string, string[]>;
  body: string;
}

export function splitFrontmatter(markdown: string): Frontmatter {
  const normalized = markdown.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return { fields: {}, arrays: {}, body: normalized };
  }
  const end = normalized.indexOf('\n---', 4);
  if (end === -1) {
    return { fields: {}, arrays: {}, body: normalized };
  }
  const block = normalized.slice(4, end);
  const afterMarker = normalized.indexOf('\n', end + 1);
  const body = afterMarker === -1 ? '' : normalized.slice(afterMarker + 1);

  const fields: Record<string, string> = {};
  const arrays: Record<string, string[]> = {};
  for (const line of block.split('\n')) {
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2].trim();
    const arrayMatch = value.match(/^\[(.*)\]$/);
    if (arrayMatch) {
      arrays[key] = arrayMatch[1]
        .split(',')
        .map((item) => item.trim().replace(/^["']|["']$/g, ''))
        .filter((item) => item.length > 0);
    } else {
      fields[key] = value.replace(/^["']|["']$/g, '');
    }
  }
  return { fields, arrays, body };
}

/** 文件名 → ascii slug（去扩展名、非 [a-z0-9] 转 `-`、压缩、截断）；中文文件名退化为含 ascii 段或哈希。 */
export function fileNameToSlug(fileName: string): string {
  const base = fileName.replace(/\.md$/i, '');
  const ascii = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  if (ascii.length >= 3) return ascii;
  // 纯中文 / 过短：用确定性哈希兜底，保证 issueId 唯一且可 sluggable
  let hash = 0;
  for (const ch of base) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const suffix = hash.toString(36).slice(0, 8);
  return ascii.length > 0 ? `${ascii}-${suffix}` : `doc-${suffix}`;
}

/** 把 "YYYY-MM-DD HH:MM" / "YYYY-MM-DD" 归一成带 Z 的 ISO8601；解析失败返回 null。 */
export function toIsoDateTime(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const dt = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!dt) return null;
  const [, y, mo, d, hh, mm] = dt;
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const hour = hh ?? '00';
  const min = mm ?? '00';
  return `${y}-${mo}-${d}T${hour}:${min}:00.000Z`;
}

function firstHeading(body: string): string | null {
  const match = body.match(/^#\s+(.+?)\s*$/m);
  return match ? match[1].trim() : null;
}

function stripChecklistPrefix(title: string): string {
  return title.replace(/^检查清单[:：]\s*/, '').trim();
}

function deriveDate(
  fm: Frontmatter,
  fileName: string,
): { iso: string; fromFallback: boolean } {
  const fromFm = toIsoDateTime(fm.fields.date);
  if (fromFm) return { iso: fromFm, fromFallback: false };

  // 文件名任意位置的日期（`2026-05-15-…` 或 `debug-checklist-2026-05-12`）
  const fromName = fileName.match(/(\d{4}-\d{2}-\d{2})/);
  if (fromName) {
    const iso = toIsoDateTime(fromName[1]);
    if (iso) return { iso, fromFallback: false };
  }

  // 正文「生成时间 / 自动生成于」；容忍 markdown 加粗与标点（`**生成时间**：2026-05-12`）
  const fromBody = fm.body.match(
    /(?:自动生成于|生成时间|生成日期)\**\s*[：:]*\s*(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?)/,
  );
  if (fromBody) {
    const iso = toIsoDateTime(fromBody[1]);
    if (iso) return { iso, fromFallback: false };
  }

  return { iso: FALLBACK_DATE, fromFallback: true };
}

function deriveTags(haystack: string, fmProject: string | undefined): string[] {
  const tags = new Set<string>();
  for (const [pattern, tag] of TAG_VOCAB) {
    if (pattern.test(haystack)) tags.add(tag);
  }
  // frontmatter project 里出现的子系统词也补一遍（如 "STM32G4 / FreeRTOS / MicroROS"）
  if (fmProject) {
    for (const [pattern, tag] of TAG_VOCAB) {
      if (pattern.test(fmProject)) tags.add(tag);
    }
  }
  return Array.from(tags).slice(0, 12);
}

function deriveCommits(fm: Frontmatter, body: string): string[] {
  if (fm.arrays.relatedCommits && fm.arrays.relatedCommits.length > 0) {
    return unique(fm.arrays.relatedCommits).slice(0, 30);
  }
  // 反引号包裹的 7~12 位 hex（commit 短哈希）；规避裸 hex 误命中
  const found: string[] = [];
  for (const m of body.matchAll(/`([0-9a-f]{7,12})`/g)) found.push(m[1]);
  // commit `xxxxxxx` 形式（无反引号但有 commit 前缀）
  for (const m of body.matchAll(/commit\s+([0-9a-f]{7,12})\b/gi)) found.push(m[1]);
  return unique(found).slice(0, 30);
}

function deriveFiles(fm: Frontmatter, body: string): string[] {
  if (fm.arrays.relatedFiles && fm.arrays.relatedFiles.length > 0) {
    return unique(fm.arrays.relatedFiles).slice(0, 30);
  }
  const found: string[] = [];
  // 反引号包裹或裸的 .c/.h 路径（含可选目录段）
  for (const m of body.matchAll(/`([\w./-]+\.[ch])`/g)) found.push(m[1]);
  for (const m of body.matchAll(/(?<![\w./-])([\w-]+(?:\/[\w-]+)*\.[ch])\b/g)) {
    found.push(m[1]);
  }
  return unique(found).slice(0, 30);
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const v = value.trim();
    if (v.length === 0 || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * 抽取「根因 / 修复 / 预防」段：扫所有命中标记词的标题/加粗行，收集其后到下一个标题/空行的文本。
 * 关键词富集（利于 kb-similar 打分），抽不到返回空串（CLI 用诚实兜底补）。截断防 errorEntry 膨胀。
 */
function extractSection(body: string, markers: RegExp, limit = 700): string {
  const lines = body.split('\n');
  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 标题行 `### 根因` / 加粗行 `**根因**：xxx` / `**修复方案**:`
    if (!markers.test(line)) continue;
    // 同行冒号后的内容
    const inline = line.replace(/^[#*\s>-]+/, '').replace(markers, '').replace(/^[）)：:\s*]+/, '').trim();
    if (inline.length > 0) chunks.push(inline);
    // 续行直到下一个标题 / 连续空行 / 代码块围栏
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      if (/^#{1,6}\s/.test(next) || /^---\s*$/.test(next) || /^```/.test(next)) break;
      if (next.trim().length === 0) break;
      chunks.push(next.replace(/^[*\s>-]+/, '').trim());
    }
    if (chunks.join(' ').length >= limit) break;
  }
  return chunks
    .join('；')
    .replace(/；{2,}/g, '；')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function deriveSymptom(fm: Frontmatter, body: string, title: string): string {
  if (fm.fields.symptom) return fm.fields.symptom.trim();
  const fromSection = extractSection(body, /(\*\*症状\*\*|^#{2,6}\s*症状|症状[：:])/, 300);
  if (fromSection.length > 0) return fromSection;
  return title;
}

function deriveSeverity(haystack: string): IssueSeverity {
  if (/烧毁|冒烟|hardfault|失控|死循环/i.test(haystack)) return 'high';
  if (HIGH_SEVERITY_PATTERN.test(haystack)) return 'high';
  if (MEDIUM_HIGH_PATTERN.test(haystack)) return 'high';
  return 'medium';
}

export interface ParseResult {
  parsed: ParsedArchive;
  /** 警告（落兜底日期 / rootCause 用兜底文案等），CLI 据此 log，不静默（§10）。 */
  warnings: string[];
}

/**
 * 解析一份归档 markdown。`fileName` 用于派生 slug / 日期兜底。
 * 返回 null = 该文件无可用内容（空文件 / 纯目录说明），CLI 跳过并 log。
 */
export function parseDebugArchive(
  markdown: string,
  fileName: string,
): ParseResult | null {
  const fm = splitFrontmatter(markdown);
  const body = fm.body.trim();
  if (body.length === 0) return null;

  const warnings: string[] = [];
  const heading = firstHeading(body);
  const title =
    (heading ? stripChecklistPrefix(heading) : '') ||
    fm.fields.symptom?.trim() ||
    fileName.replace(/\.md$/i, '');

  const { iso: historicalNow, fromFallback } = deriveDate(fm, fileName);
  if (fromFallback) {
    warnings.push(`无可解析日期，落兜底 ${FALLBACK_DATE}`);
  }

  const relatedFiles = deriveFiles(fm, body);
  const relatedCommits = deriveCommits(fm, body);
  // 标签 haystack 含相关文件路径：文件名是强子系统信号（can_list.c→CAN、microros_ctrl.c→MicroROS），
  // 即便正文没逐字提到该子系统也能据档案文件归类，提升 kb-similar 召回。
  const haystack = `${title}\n${fm.fields.project ?? ''}\n${relatedFiles.join('\n')}\n${body}`;
  const tags = deriveTags(haystack, fm.fields.project);
  const symptom = deriveSymptom(fm, body, title);
  const severity = deriveSeverity(haystack);

  const rootCauseExtracted = extractSection(
    body,
    /(\*\*根因(?:分析)?\*\*|^#{2,6}\s*根因|根本原因|根因[：:])/,
  );
  const resolutionExtracted = extractSection(
    body,
    /(\*\*修复(?:方案|代码)?\*\*|^#{2,6}\s*(?:实际)?根因与?修复|修复方案|解决方案|已采用的修复|修复[：:])/,
  );
  const preventionExtracted = extractSection(
    body,
    /(\*\*(?:预防|经验|教训)\*\*|^#{2,6}\s*(?:总结|预防|经验|排查建议)|预防[：:])/,
    400,
  );

  let rootCause = rootCauseExtracted;
  if (rootCause.length === 0) {
    rootCause = `本条为 ProbeFlash .debug-archive 历史归档导入，具体根因见归档正文（症状：${symptom}）。`;
    warnings.push('未抽到根因段，用指向性兜底文案');
  }
  let resolution = resolutionExtracted;
  if (resolution.length === 0) {
    resolution = '修复 / 验证步骤见归档正文检查清单各条。';
    warnings.push('未抽到修复段，用指向性兜底文案');
  }

  const category = tags[0] ?? '历史归档';

  return {
    parsed: {
      slug: fileNameToSlug(fileName),
      historicalNow,
      title: title.slice(0, 200),
      symptom: symptom.slice(0, 400),
      rawInput: body,
      tags,
      relatedFiles,
      relatedCommits,
      severity,
      category,
      rootCause,
      resolution,
      prevention: preventionExtracted,
    },
    warnings,
  };
}
