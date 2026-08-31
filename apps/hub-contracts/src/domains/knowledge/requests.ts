import { z } from 'zod';

import {
  ErrorEntrySchema,
  IssueCardSchema,
  KB_ID_MAX,
  KB_TEXT_MAX,
  KB_TITLE_MAX,
} from './model.js';

/** 知识库域 API 读 / 写契约（跨端单一源，server + console 共用）。 */

export const IssueCardsResponseSchema = z.object({
  issues: z.array(IssueCardSchema),
});
export const ErrorEntriesResponseSchema = z.object({
  entries: z.array(ErrorEntrySchema),
});

/**
 * KB 批量 md 导入报告（KB-BULK-MD-IMPORT，打磨轮刀⑫）：`POST /api/kb/import-docs` 响应。
 * 三段（照名册/库存导入报告范式，段从简不照搬六段）：
 *  - imported：落库的归档文档（id = ArchiveDocument.issueId，title = 文件名去后缀）；
 *  - skipped：未落库但非错误——同 title 幂等去重（库里已有同名文档）/ 非 .md/.markdown 后缀；
 *  - failed：读取失败 / 超单文件上限 / 文档不合 ArchiveDocumentSchema。
 * I0：报告全是文档事实回显给操作者本人，无人键、无聚合。
 */
export const KbImportDocRefSchema = z.object({
  id: z.string().min(1).max(KB_ID_MAX),
  title: z.string().min(1).max(KB_TITLE_MAX),
});
export const KbImportDocIssueSchema = z.object({
  title: z.string().min(1).max(KB_TITLE_MAX),
  reason: z.string().min(1).max(KB_TEXT_MAX),
});
export const KbImportDocsReportSchema = z.object({
  imported: z.array(KbImportDocRefSchema),
  skipped: z.array(KbImportDocIssueSchema),
  failed: z.array(KbImportDocIssueSchema),
});

export type KbImportDocRef = z.infer<typeof KbImportDocRefSchema>;
export type KbImportDocIssue = z.infer<typeof KbImportDocIssueSchema>;
export type KbImportDocsReport = z.infer<typeof KbImportDocsReportSchema>;
