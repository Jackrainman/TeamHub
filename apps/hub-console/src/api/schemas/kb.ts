import { z } from 'zod';
import {
  SimilarIssueMatchSchema,
  IssueCardSchema,
  InvestigationRecordSchema,
  ArchiveGeneratedBySchema,
  ArchiveDocumentSchema,
  ErrorEntrySchema,
  KnowledgeNodeSchema,
} from '@teamhub/hub-contracts';

// 知识库相似检索的「响应契约」前端镜像（与 hub-server/contracts.ts 的 KbSimilarResponseSchema 同形）。
// 沿用 system.ts 的既有做法：response item 复用 hub-contracts 的 SimilarIssueMatchSchema，
// 包装层（query/note）在前端本地声明，fail-closed 解析后端响应。
export const KbSimilarResponseSchema = z.object({
  query: z.object({
    symptom: z.string(),
    tags: z.array(z.string()),
  }),
  items: z.array(SimilarIssueMatchSchema),
  // A4 护栏措辞：「只列候选、不断言同因、由人选用」——后端焊进响应，前端原样呈现。
  note: z.string(),
});

export type KbSimilarResponse = z.infer<typeof KbSimilarResponseSchema>;

/** GET /api/kb/similar 查询入参（前端表单 → querystring）。 */
export interface KbSimilarParams {
  symptom: string;
  tags?: string[];
  limit?: number;
  minScore?: number;
}

// 结案归档「写侧契约」前端镜像（与 hub-server/contracts.ts 的 KbCloseout*Schema 同形）。
// 人工 web 录入口：补 kb-debug skill（本地 Claude Code）之外的浏览器录入通道。rootCause/resolution
// 必填（后端缺则 422，不伪造完成）；server 用 clock+issue.id 派生 errorCode/errorEntryId（确定性）。
// I0：generatedBy 是 ai/manual/hybrid 来源凭证，不记结案人；派生知识节点无人维度（C2）。
export const KbCloseoutRequestSchema = z.object({
  issue: IssueCardSchema,
  records: z.array(InvestigationRecordSchema).default([]),
  category: z.string().default(''),
  rootCause: z.string(),
  resolution: z.string(),
  prevention: z.string().default(''),
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
