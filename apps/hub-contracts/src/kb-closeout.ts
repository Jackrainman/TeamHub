import { z } from 'zod';

import {
  ArchiveDocumentSchema,
  ArchiveGeneratedBySchema,
  ErrorEntrySchema,
  InvestigationRecordSchema,
  IssueCardSchema,
  KB_ARRAY_MAX,
  KB_LONG_TEXT_MAX,
  KB_MARKDOWN_MAX,
  KB_TEXT_MAX,
} from './kb.js';
import type {
  ArchiveDocument,
  ArchiveGeneratedBy,
  ErrorEntry,
  InvestigationRecord,
  IssueCard,
} from './kb.js';
import { KnowledgeNodeSchema } from './growth.js';
import type { KnowledgeNode } from './growth.js';

/**
 * 结案闭环（KB-CORE）。从 Probe_Flash 移植 `buildCloseoutFromIssue` **纯函数**——把选中的
 * IssueCard + 调查时间线转成「归档文档 + 错误表条目 + 已归档的卡」，并新增
 * `deriveKnowledgeNodeFromIssue` 把结案副产品自动挂成知识节点（「用着就沉淀，不做事后填总结」）。
 *
 * 移植差异（诚实标注，AGENTS §10）：
 * - 保持纯函数：`now / errorEntryId / errorCode / generatedBy` 全由 `opts` 注入（与 TeamHub Clock
 *   注入模式一致）；Probe_Flash 的 `nowISO / generateErrorEntryId / generateErrorCode`（用 Date.now /
 *   Math.random / crypto）**不移植**，由 `POST /api/kb/closeout` 路由用 clock + 既有条目派生注入。
 *
 * 护栏（AGENTS §5）：
 * - **I0**：归档 `generatedBy` 是 ai/manual/hybrid，**不记「谁结的案」**；派生的 KnowledgeNode 无人维度。
 * - **C2**：错误表 / 知识节点主键是 errorCode / 知识点，无人完成量。
 */

export type CloseoutGeneratedBy = ArchiveGeneratedBy;

export interface CloseoutInput {
  category: string;
  rootCause: string;
  resolution: string;
  prevention: string;
}

export interface CloseoutOptions {
  now: string;
  errorEntryId: string;
  errorCode: string;
  generatedBy: CloseoutGeneratedBy;
}

export type CloseoutFailure = {
  ok: false;
  reason: string;
  path?: (string | number)[];
};

export type CloseoutSuccess = {
  ok: true;
  archiveDocument: ArchiveDocument;
  errorEntry: ErrorEntry;
  updatedIssueCard: IssueCard;
  /** 结案派生的知识节点（draft，id/createdAt 由 Store 补；见 deriveKnowledgeNodeFromIssue）。 */
  knowledgeNodeDraft: Omit<KnowledgeNode, 'id' | 'createdAt'>;
};

export type CloseoutResult = CloseoutSuccess | CloseoutFailure;

function normalizeInput(input: CloseoutInput): CloseoutInput {
  return {
    category: input.category.trim(),
    rootCause: input.rootCause.trim(),
    resolution: input.resolution.trim(),
    prevention: input.prevention.trim(),
  };
}

function derivePrevention(input: CloseoutInput): string {
  if (input.prevention.length > 0) return input.prevention;
  return `把本次处理加入调试检查单以防复发：${input.resolution}`;
}

function failureFromIssue(
  prefix: string,
  issue: { path: (string | number)[]; message: string },
): CloseoutFailure {
  return {
    ok: false,
    reason: `${prefix}: ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    path: issue.path,
  };
}

function datePartFromISO(now: string): string {
  const match = now.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '0000-00-00';
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
}

function slugify(value: string, fallback: string): string {
  return toSlug(value) || toSlug(fallback) || 'issue-archive';
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function uniqueTags(values: string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const value of values) {
    const tag = value.trim();
    const key = tag.toLocaleLowerCase();
    if (tag.length === 0 || seen.has(key) || key === 'uncategorized') continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

function formatList(values: string[]): string {
  if (values.length === 0) return '- (none)';
  return values.map((value) => `- ${value}`).join('\n');
}

function renderTimeline(records: InvestigationRecord[]): string {
  if (records.length === 0) return '- (no investigation records)';
  return records
    .map(
      (record) => `- ${record.createdAt} [${record.type}] ${record.polishedText}`,
    )
    .join('\n');
}

function renderArchiveMarkdown(
  issueCard: IssueCard,
  records: InvestigationRecord[],
  input: CloseoutInput,
  generatedAt: string,
): string {
  const relatedFiles = unique([
    ...issueCard.relatedFiles,
    ...records.flatMap((record) => record.linkedFiles),
  ]);
  const relatedCommits = unique([
    ...issueCard.relatedCommits,
    ...records.flatMap((record) => record.linkedCommits),
  ]);

  const markdown = [
    `# ${issueCard.title}`,
    '',
    '## Summary',
    `- Issue ID: ${issueCard.id}`,
    `- Project ID: ${issueCard.projectId}`,
    `- Severity: ${issueCard.severity}`,
    `- Archived At: ${generatedAt}`,
    '',
    '## Symptom',
    issueCard.symptomSummary ||
      issueCard.normalizedSummary ||
      issueCard.rawInput ||
      '(not recorded)',
    '',
    '## Root Cause',
    input.rootCause,
    '',
    '## Resolution',
    input.resolution,
    '',
    '## Prevention',
    input.prevention || '(not recorded)',
    '',
    '## Investigation Timeline',
    renderTimeline(records),
    '',
    '## Related Files',
    formatList(relatedFiles),
    '',
    '## Related Commits',
    formatList(relatedCommits),
    '',
  ].join('\n');
  // markdownContent 是派生字段：体积由各输入字段（均已 .max() 上限）+ 100 条时间线 + 文件/commit 列表
  // 决定，schema-合法的极端输入可拼出数 MB。绝不因派生体积超限而拒绝合法结案——超限就**截断**（非拒绝），
  // 保证 ArchiveDocumentSchema.markdownContent.max(KB_MARKDOWN_MAX) 永远满足。真实排障篇幅远在上限内、不受影响。
  if (markdown.length <= KB_MARKDOWN_MAX) return markdown;
  const marker = '\n\n…（归档正文过长，已截断到上限）';
  return markdown.slice(0, KB_MARKDOWN_MAX - marker.length) + marker;
}

function safeParseOrFailure<T>(
  schema: { safeParse: (value: unknown) => z.SafeParseReturnType<unknown, T> },
  draft: unknown,
  prefix: string,
): { ok: true; data: T } | CloseoutFailure {
  const parsed = schema.safeParse(draft);
  if (parsed.success) return { ok: true, data: parsed.data };
  const first = parsed.error.issues[0];
  return first
    ? failureFromIssue(prefix, first)
    : { ok: false, reason: `${prefix}: schema validation failed` };
}

/**
 * 把已结案的 IssueCard 派生成知识节点 draft（「踩过的坑」沉淀成可复用知识点）。
 * `groupId` 由调用方按所属组传入（默认 null = 通用，不预设本体 C3）；resourceLinks 指向归档 +
 * 相关文件 / 提交。**无人维度**（I0/C2）。纯函数，id/createdAt 由 Store 补。
 */
export function deriveKnowledgeNodeFromIssue(params: {
  issue: IssueCard;
  groupId?: string | null;
  archiveFilePath?: string;
}): Omit<KnowledgeNode, 'id' | 'createdAt'> {
  const { issue, groupId = null, archiveFilePath } = params;
  const resourceLinks: KnowledgeNode['resourceLinks'] = [];
  if (archiveFilePath) {
    resourceLinks.push({ label: `结案归档：${issue.title}`, uri: `archive://${archiveFilePath}` });
  }
  for (const file of unique(issue.relatedFiles)) {
    resourceLinks.push({ label: `相关文件 ${file}`, uri: `repo://${file}` });
  }
  for (const commit of unique(issue.relatedCommits)) {
    resourceLinks.push({ label: `相关提交 ${commit.slice(0, 7)}`, uri: `git://${commit}` });
  }
  return {
    name: `踩过的坑：${issue.title}`,
    groupId,
    parentNodeId: null,
    resourceLinks,
  };
}

export function buildCloseoutFromIssue(
  issueCard: IssueCard,
  records: InvestigationRecord[],
  rawInput: CloseoutInput,
  opts: CloseoutOptions,
): CloseoutResult {
  const normalizedInput = normalizeInput(rawInput);

  if (issueCard.status === 'archived') {
    return { ok: false, reason: 'issue is already archived', path: ['status'] };
  }
  if (normalizedInput.rootCause.length === 0) {
    return { ok: false, reason: 'rootCause is required', path: ['rootCause'] };
  }
  if (normalizedInput.resolution.length === 0) {
    return { ok: false, reason: 'resolution is required', path: ['resolution'] };
  }

  const input: CloseoutInput = {
    ...normalizedInput,
    prevention: derivePrevention(normalizedInput),
  };

  const sortedRecords = [...records].sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
  );
  const datePart = datePartFromISO(opts.now);
  const fileName = `${datePart}_${slugify(issueCard.title, issueCard.id)}.md`;
  const filePath = `.debug_workspace/archive/${fileName}`;
  const symptom =
    issueCard.symptomSummary ||
    issueCard.normalizedSummary ||
    issueCard.rawInput ||
    '';
  const relatedFiles = unique([
    ...issueCard.relatedFiles,
    ...sortedRecords.flatMap((record) => record.linkedFiles),
  ]);
  const relatedCommits = unique([
    ...issueCard.relatedCommits,
    ...sortedRecords.flatMap((record) => record.linkedCommits),
  ]);
  const tags = uniqueTags([...issueCard.tags, input.category]);

  const archiveResult = safeParseOrFailure<ArchiveDocument>(
    ArchiveDocumentSchema,
    {
      issueId: issueCard.id,
      projectId: issueCard.projectId,
      fileName,
      filePath,
      markdownContent: renderArchiveMarkdown(
        issueCard,
        sortedRecords,
        input,
        opts.now,
      ),
      generatedBy: opts.generatedBy,
      generatedAt: opts.now,
    },
    'archiveDocument',
  );
  if (!archiveResult.ok) return archiveResult;

  const errorEntryResult = safeParseOrFailure<ErrorEntry>(
    ErrorEntrySchema,
    {
      id: opts.errorEntryId,
      projectId: issueCard.projectId,
      sourceIssueId: issueCard.id,
      errorCode: opts.errorCode,
      title: issueCard.title,
      category: input.category || 'uncategorized',
      symptom,
      rootCause: input.rootCause,
      resolution: input.resolution,
      prevention: input.prevention,
      tags,
      relatedFiles,
      relatedCommits,
      archiveFilePath: archiveResult.data.filePath,
      createdAt: opts.now,
      updatedAt: opts.now,
    },
    'errorEntry',
  );
  if (!errorEntryResult.ok) return errorEntryResult;

  const issueCardResult = safeParseOrFailure<IssueCard>(
    IssueCardSchema,
    {
      ...issueCard,
      status: 'archived',
      updatedAt: opts.now,
    },
    'issueCard',
  );
  if (!issueCardResult.ok) return issueCardResult;

  return {
    ok: true,
    archiveDocument: archiveResult.data,
    errorEntry: errorEntryResult.data,
    updatedIssueCard: issueCardResult.data,
    knowledgeNodeDraft: deriveKnowledgeNodeFromIssue({
      issue: issueCardResult.data,
      archiveFilePath: archiveResult.data.filePath,
    }),
  };
}

/**
 * `POST /api/kb/closeout` 写侧请求 / 响应契约（跨端单一源，D-052 重复真相收口）。
 * 此前 hub-server/src/contracts.ts 与 hub-console/src/api/schemas/kb.ts 各声明一份同形 schema、字段逐行重复；
 * 现下沉至此，两端 re-export，避免漂移。
 *
 * `rootCause/resolution` 仍需手填（可行性 §2）；server 用 clock + issue.id 派生 errorCode/errorEntryId
 * （确定性、可测）。**I0**：`generatedBy` 是 ai/manual/hybrid 来源凭证，不记结案人；派生知识节点无人维度（C2）。
 */
export const KbCloseoutRequestSchema = z.object({
  issue: IssueCardSchema,
  records: z.array(InvestigationRecordSchema).max(KB_ARRAY_MAX).default([]),
  category: z.string().max(KB_TEXT_MAX).default(''),
  rootCause: z.string().trim().min(1).max(KB_LONG_TEXT_MAX),
  resolution: z.string().trim().min(1).max(KB_LONG_TEXT_MAX),
  prevention: z.string().max(KB_LONG_TEXT_MAX).default(''),
  generatedBy: ArchiveGeneratedBySchema.default('hybrid'),
});

export const KbCloseoutResponseSchema = z.object({
  archiveDocument: ArchiveDocumentSchema,
  errorEntry: ErrorEntrySchema,
  updatedIssueCard: IssueCardSchema,
  knowledgeNode: KnowledgeNodeSchema,
});

export type KbCloseoutRequest = z.infer<typeof KbCloseoutRequestSchema>;
export type KbCloseoutResponse = z.infer<typeof KbCloseoutResponseSchema>;

/**
 * 由结案时刻派生 `DBG-YYYYMMDD-NNN` 错误码（不引入 Math.random，可单测复现）。
 *
 * **M9（AUDIT-FIXES 部署前必修）**：NNN 优先取 `sequence`（调用方传入「同日既有 ErrorEntry 数 + 1」的
 * 单调序号）——避免原「issueId 哈希 mod 1000」在 ~38 次/日时生日碰撞 → 静默覆盖、污染 `kb-similar`
 * 依赖 errorCode 的跨赛季查找。`sequence` 省略时回退到 issueId 哈希（CLI 历史导入 / console mock
 * 无 store 访问、走 best-effort 哈希）。
 *
 * 单一源（D-052 重复真相收口）：hub-server 结案路由 / ProbeFlash 导入 CLI / hub-console mock 三端
 * import 同一函数。导入路径传入**历史时戳**（归档 frontmatter date / 文件名日期）而非当前钟，
 * 故 errorCode 的日期段反映 bug 当年发生时间（KB-IMPORT-PROBEFLASH 要求）。
 */
export function deriveErrorCode(
  now: string,
  issueId: string,
  sequence?: number,
): string {
  const datePart = now.slice(0, 10).replace(/-/g, '');
  const nnn = sequence != null ? sequence % 1000 : hashIssueId(issueId);
  return `DBG-${datePart}-${String(nnn).padStart(3, '0')}`;
}

function hashIssueId(issueId: string): number {
  let hash = 0;
  for (const ch of issueId) hash = (hash * 31 + ch.charCodeAt(0)) % 1000;
  return hash;
}
