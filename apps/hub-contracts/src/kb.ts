import { z } from 'zod';

import { isoDateTimeSchema } from './common.js';

/**
 * 战队知识库·核心域（KB-CORE，frontier#1 / D-042 拆）。
 *
 * 从 Probe_Flash（同源）移植 `IssueCard → InvestigationRecord → ErrorEntry → ArchiveDocument`
 * 调试闭环 Zod 链，作为「随手沉淀、不做事后填总结」的知识载体：调试时本就会记现象 / 试了什么 /
 * 根因，结案把这串副产品自动归档并派生 KnowledgeNode（见 `kb-closeout.ts`）。
 *
 * 移植差异（诚实标注，AGENTS §10）：
 * - **去掉 `repoSnapshot`**：Probe_Flash 的 IssueCard 内嵌整份 git `RepoSnapshot`（branch/head/
 *   changedFiles…），那是 desktop 单机抓取产物。TeamHub 的 git 关联走治理侧 gitCommit 信号 +
 *   本卡 `relatedCommits/relatedFiles` 即可，不内嵌快照（小作坊轻量 C3、避免与治理 git 路径双写 G2）。
 * - **时间字段统一** `isoDateTimeSchema`（offset 必带），与 common.ts 一致；不再各文件重声明。
 * - **保留 `normalizedSummary/relatedFiles/relatedCommits` 三字段**：`buildCloseoutFromIssue`
 *   读这三者，删则 TS2339（backlog KB-CORE-DESIGN 明列）。
 * - **`IssueStatus` 值改 camelCase**（Probe_Flash `needs_manual_review` → `needsManualReview`），对齐
 *   TeamHub 枚举约定（如 TaskStatus `inProgress`）。本仓无分支引用该值（similar/closeout 只判 archived/resolved）、
 *   Probe_Flash v0.3 已冻结无活数据互通，故安全；仅未来与 Probe_Flash 历史数据互通时留意值不兼容。
 *
 * 护栏（AGENTS §5）：
 * - **A4 / C4**：相似检索（见 `kb-similar.ts`）只列候选、给「疑似同因」检查单条目，**不断言同因、由人选用**；
 *   schema 不含任何「自动判定根因」字段。
 * - **C2 反排名**：知识卡的主键是 issue / errorCode / 知识点，**无人完成量维度**；不记「谁调得快」。
 */

/**
 * KB 文本/数组上限（M17）：防一次结案请求整文件重写 / 数组无限增长把存储与渲染拖垮。
 * 与 server `bodyLimit`（256KB）配套——schema 层先给调用方明确约束、避免「能传无限大」的误导。
 * 上限取宽松值：正常排障文本远低于此，仅挡异常/恶意超大输入。
 */
export const KB_ID_MAX = 200;
export const KB_TAG_MAX = 80;
export const KB_TITLE_MAX = 500;
export const KB_TEXT_MAX = 2_000;
export const KB_LONG_TEXT_MAX = 20_000;
export const KB_ARRAY_MAX = 100;
/** markdown 归档正文上限：与 server bodyLimit(256KB) 同量级，留足真实排障篇幅。
 *  注意：markdownContent 是**派生**字段（renderArchiveMarkdown 拼接 + 截断到此上限），
 *  绝不因派生体积超限而拒绝一个输入合法的结案——超长在 renderArchiveMarkdown 里 clamp，不在 schema 拒。 */
export const KB_MARKDOWN_MAX = 200_000;
/** 派生 prevention 上限：derivePrevention = 固定前缀 + resolution(≤KB_LONG_TEXT_MAX)，留前缀余量，
 *  使「空 prevention + resolution 顶格」的合法结案不被 ErrorEntry 校验误拒。 */
export const KB_DERIVED_PREVENTION_MAX = KB_LONG_TEXT_MAX + 64;

export const IssueSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

export const IssueStatusSchema = z.enum([
  'open',
  'investigating',
  'resolved',
  'archived',
  'needsManualReview',
]);

/**
 * 一次调试问题卡。`relatedHistoricalIssueIds` = 相似检索（kb-similar）人工选用后回挂的历史卡，
 * 不是自动判定的「同因」结论（A4）。
 */
export const IssueCardSchema = z.object({
  id: z.string().min(1).max(KB_ID_MAX),
  projectId: z.string().min(1).max(KB_ID_MAX),
  title: z.string().min(1).max(KB_TITLE_MAX),
  rawInput: z.string().min(1).max(KB_LONG_TEXT_MAX),
  normalizedSummary: z.string().min(1).max(KB_LONG_TEXT_MAX),
  symptomSummary: z.string().min(1).max(KB_LONG_TEXT_MAX),
  suspectedDirections: z
    .array(z.string().min(1).max(KB_TEXT_MAX))
    .max(KB_ARRAY_MAX),
  suggestedActions: z.array(z.string().min(1).max(KB_TEXT_MAX)).max(KB_ARRAY_MAX),
  status: IssueStatusSchema,
  severity: IssueSeveritySchema,
  tags: z.array(z.string().min(1).max(KB_TAG_MAX)).max(KB_ARRAY_MAX).default([]),
  relatedFiles: z.array(z.string().min(1).max(KB_TEXT_MAX)).max(KB_ARRAY_MAX),
  relatedCommits: z.array(z.string().min(1).max(KB_TEXT_MAX)).max(KB_ARRAY_MAX),
  relatedHistoricalIssueIds: z
    .array(z.string().min(1).max(KB_ID_MAX))
    .max(KB_ARRAY_MAX)
    .default([]),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const InvestigationRecordTypeSchema = z.enum([
  'observation',
  'hypothesis',
  'action',
  'result',
  'conclusion',
  'note',
]);

/** 调试时间线一条：现象 / 假设 / 动作 / 结果。`polishedText` 是 AI 转译后的人读版本（C4 转译不判定）。 */
export const InvestigationRecordSchema = z.object({
  id: z.string().min(1).max(KB_ID_MAX),
  issueId: z.string().min(1).max(KB_ID_MAX),
  type: InvestigationRecordTypeSchema,
  rawText: z.string().min(1).max(KB_LONG_TEXT_MAX),
  polishedText: z.string().max(KB_LONG_TEXT_MAX),
  aiExtractedSignals: z.array(z.string().max(KB_TEXT_MAX)).max(KB_ARRAY_MAX),
  linkedFiles: z.array(z.string().max(KB_TEXT_MAX)).max(KB_ARRAY_MAX),
  linkedCommits: z.array(z.string().max(KB_TEXT_MAX)).max(KB_ARRAY_MAX),
  createdAt: isoDateTimeSchema,
});

export const ERROR_CODE_PATTERN = /^DBG-\d{8}-\d{3}$/;

/** 结案沉淀的错误表条目（跨赛季可检索的「这类 bug 长这样 / 根因 / 怎么修」）。 */
export const ErrorEntrySchema = z.object({
  id: z.string().min(1).max(KB_ID_MAX),
  projectId: z.string().min(1).max(KB_ID_MAX),
  sourceIssueId: z.string().min(1).max(KB_ID_MAX),
  errorCode: z
    .string()
    .regex(ERROR_CODE_PATTERN, 'errorCode 必须匹配 DBG-YYYYMMDD-NNN'),
  title: z.string().min(1).max(KB_TITLE_MAX),
  category: z.string().max(KB_TEXT_MAX),
  symptom: z.string().max(KB_LONG_TEXT_MAX),
  rootCause: z.string().max(KB_LONG_TEXT_MAX),
  resolution: z.string().max(KB_LONG_TEXT_MAX),
  prevention: z.string().trim().min(1).max(KB_DERIVED_PREVENTION_MAX),
  tags: z.array(z.string().max(KB_TAG_MAX)).max(KB_ARRAY_MAX).optional(),
  relatedFiles: z.array(z.string().max(KB_TEXT_MAX)).max(KB_ARRAY_MAX),
  relatedCommits: z.array(z.string().max(KB_TEXT_MAX)).max(KB_ARRAY_MAX),
  archiveFilePath: z.string().min(1).max(KB_TEXT_MAX),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const ArchiveGeneratedBySchema = z.enum(['ai', 'manual', 'hybrid']);

export const ARCHIVE_FILE_NAME_PATTERN = /^\d{4}-\d{2}-\d{2}_[a-z0-9-]+\.md$/;

/** 结案归档文档（人读 markdown）。`generatedBy` 是 ai/manual/hybrid，**非人名**（I0：不记谁结的案）。 */
export const ArchiveDocumentSchema = z.object({
  issueId: z.string().min(1).max(KB_ID_MAX),
  projectId: z.string().min(1).max(KB_ID_MAX),
  fileName: z
    .string()
    .max(KB_TEXT_MAX)
    .regex(ARCHIVE_FILE_NAME_PATTERN, 'fileName 必须匹配 YYYY-MM-DD_<slug>.md'),
  filePath: z.string().min(1).max(KB_TEXT_MAX),
  markdownContent: z.string().max(KB_MARKDOWN_MAX),
  generatedBy: ArchiveGeneratedBySchema,
  generatedAt: isoDateTimeSchema,
});

export const IssueCardsResponseSchema = z.object({
  issues: z.array(IssueCardSchema),
});
export const ErrorEntriesResponseSchema = z.object({
  entries: z.array(ErrorEntrySchema),
});

/**
 * 知识库读快照（与 `GovernanceSnapshot` 对称）：相似检索（kb-similar）的排序语料。
 * **不在 `GovernanceSnapshot` 内**——故 KbStore 独立于 GovStore（承接 base 收口刀对抗核实结论，
 * 见 gov-store.ts KbStore；knowledgeNodes/taskKnowledgeTags 那半仍复用 GovernanceSnapshot）。
 */
export interface KbSnapshot {
  projectId: string;
  issueCards: IssueCard[];
  errorEntries: ErrorEntry[];
  archiveDocuments: ArchiveDocument[];
}

export type IssueSeverity = z.infer<typeof IssueSeveritySchema>;
export type IssueStatus = z.infer<typeof IssueStatusSchema>;
export type IssueCard = z.infer<typeof IssueCardSchema>;
export type InvestigationRecordType = z.infer<
  typeof InvestigationRecordTypeSchema
>;
export type InvestigationRecord = z.infer<typeof InvestigationRecordSchema>;
export type ErrorEntry = z.infer<typeof ErrorEntrySchema>;
export type ArchiveGeneratedBy = z.infer<typeof ArchiveGeneratedBySchema>;
export type ArchiveDocument = z.infer<typeof ArchiveDocumentSchema>;
