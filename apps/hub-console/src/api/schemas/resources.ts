// R3 车管理（建车 / 改状态 / 退役）读写契约下沉 @teamhub/hub-contracts（与 hub-server 共用同一源），
// 此处 re-export 维持本地 import 路径（client.ts / ResourcesPage from '../../api/schemas/resources'），
// 镜像 schemas/pm.ts / schemas/schedule.ts 的收口模式：不在 console 复刻 schema，单一真相在 contracts。
export {
  CreateResourceRequestSchema,
  CreateResourceResponseSchema,
  UpdateResourceStatusRequestSchema,
  UpdateResourceResponseSchema,
  SharedResourceSchema,
  SharedResourcesResponseSchema,
  ResourceStatusSchema,
  ResourceKindSchema,
  RobotTargetSchema,
  // displayCode 禁手写——建车前端用它实时预览将生成的车号（season + robotTarget + version）。
  deriveDisplayCode,
} from '@teamhub/hub-contracts';
export type {
  CreateResourceRequest,
  CreateResourceResponse,
  UpdateResourceStatusRequest,
  UpdateResourceResponse,
  SharedResource,
  SharedResourcesResponse,
  ResourceStatus,
  ResourceKind,
  RobotTarget,
} from '@teamhub/hub-contracts';
