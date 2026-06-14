import { z } from 'zod';
import { SimilarIssueMatchSchema } from '@teamhub/hub-contracts';

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
