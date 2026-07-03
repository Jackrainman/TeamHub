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
  // A2 加一棒：POST /api/resource-sessions 写契约（队长在画布上新增一条占用窗口）。
  CreateResourceSessionRequestSchema,
  CreateResourceSessionResponseSchema,
  // D-082 今日计划表格：PATCH /api/resources/:id/preset（每车默认阵型写回）+
  // POST /api/resource-sessions/batch（表格【确认】原子落盘）。
  UpdateResourceDefaultPresetRequestSchema,
  UpdateResourceDefaultPresetResponseSchema,
  CreateResourceSessionsBatchRequestSchema,
  CreateResourceSessionsBatchResponseSchema,
  // 「使用预设」纯函数 + 草稿类型（表格页消费，见 features/schedule/today-plan.ts）。
  deriveTodayPlanFromPresets,
} from '@teamhub/hub-contracts';
export type {
  RelayStage,
  RelayHandoff,
  RelayBoardResponse,
  UpdateResourceSessionRequest,
  UpdateResourceSessionResponse,
  CreateRelayHandoffRequest,
  RelayHandoffResponse,
  CreateResourceSessionRequest,
  CreateResourceSessionResponse,
  UpdateResourceDefaultPresetRequest,
  UpdateResourceDefaultPresetResponse,
  CreateResourceSessionsBatchRequest,
  CreateResourceSessionsBatchResponse,
  DefaultPreset,
  TodayPlanSessionDraft,
} from '@teamhub/hub-contracts';
