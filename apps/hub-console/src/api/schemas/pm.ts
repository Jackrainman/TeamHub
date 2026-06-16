// D-052 重复真相收口：PM 写请求契约下沉 @teamhub/hub-contracts（与 hub-server 共用同一源），
// 此处 re-export 维持既有 import 路径（client.ts from './schemas/pm'、PmCreatePanel from '../../api/schemas/pm'）。
// 此前本文件与 hub-server/contracts.ts 各从 hub-contracts 派生一份同形 schema、字段表逐行重复。
export {
  CreateTaskRequestSchema,
  CreateTaskResponseSchema,
  CreateDependencyRequestSchema,
  CreateDependencyResponseSchema,
  CreateNeedRequestSchema,
  CreateNeedResponseSchema,
  TransitionTaskStatusRequestSchema,
  TransitionTaskStatusResponseSchema,
  WaiveDependencyResponseSchema,
  CreateArtifactRequestSchema,
  CreateArtifactResponseSchema,
} from '@teamhub/hub-contracts';
export type {
  CreateTaskRequest,
  CreateTaskResponse,
  CreateDependencyRequest,
  CreateDependencyResponse,
  CreateNeedRequest,
  CreateNeedResponse,
  TransitionTaskStatusResponse,
  WaiveDependencyResponse,
  CreateArtifactRequest,
  CreateArtifactResponse,
} from '@teamhub/hub-contracts';
