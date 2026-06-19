// 知识库相似检索 / 结案写侧的「响应/请求契约」——D-052 重复真相收口（续）：已下沉 hub-contracts 单一源，
// 此处仅 re-export，前端与 hub-server 共用同一份 schema、不再各自镜像声明（消除字段逐行重复 → 不会漂移）。
// 沿用 system.ts 的既有做法：fail-closed 解析后端响应。
export {
  KbSimilarResponseSchema,
  KbCloseoutRequestSchema,
  KbCloseoutResponseSchema,
} from '@teamhub/hub-contracts';
export type {
  KbSimilarResponse,
  KbCloseoutRequest,
  KbCloseoutResponse,
} from '@teamhub/hub-contracts';

/** GET /api/kb/similar 查询入参（前端表单 → querystring）。前端专用、不跨端，留在本地。 */
export interface KbSimilarParams {
  symptom: string;
  /** 可选项目范围限定；server KbSimilarQuerySchema 早已支持，传入后语料只从该项目取。不传则全库检索。 */
  projectId?: string;
  tags?: string[];
  limit?: number;
  minScore?: number;
}
