// R1 接力交接画布读/写契约下沉 @teamhub/hub-contracts（与 hub-server 共用同一源），
// 此处 re-export 维持本地 import 路径（client.ts / RelayCanvas from './schemas/schedule'），
// 镜像 schemas/pm.ts 的收口模式：不在 console 复刻 schema，单一真相在 contracts。
export {
  RelayStageSchema,
  RelayBoardResponseSchema,
  UpdateResourceSessionRequestSchema,
  UpdateResourceSessionResponseSchema,
  CreateRelayHandoffRequestSchema,
  RelayHandoffResponseSchema,
} from '@teamhub/hub-contracts';
export type {
  RelayStage,
  RelayHandoff,
  RelayBoardResponse,
  UpdateResourceSessionRequest,
  UpdateResourceSessionResponse,
  CreateRelayHandoffRequest,
  RelayHandoffResponse,
} from '@teamhub/hub-contracts';
