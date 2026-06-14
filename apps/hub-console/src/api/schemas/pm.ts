import { z } from 'zod';
import {
  TaskSchema,
  TaskStatusSchema,
  GovActorSourceSchema,
  DependencySchema,
  NeedSchema,
} from '@teamhub/hub-contracts';

// PM 项目计划表「写侧请求契约」前端镜像（与 hub-server/contracts.ts 的 Create*RequestSchema 同形派生）。
// 关键：和后端一样从同一份 hub-contracts schema 派生（omit server 生成字段），结构天然同步、不手抄字段表。
// I0 读写边界：confirmedBy 随请求传入（建边/建需求本人凭证），但**任何读视图永不回此对象**——
// 见 docs/design/pm-board.md §3。本前端只在写表单收集，列表/看板从不展示 confirmedBy。

/** POST /api/tasks：人本字段；server 补 id/时间戳、默认 status=pending/statusSource=console。 */
export const CreateTaskRequestSchema = TaskSchema.omit({
  id: true,
  status: true,
  statusSource: true,
  lastProgressAt: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: TaskStatusSchema.optional(),
  statusSource: GovActorSourceSchema.optional(),
});
export const CreateTaskResponseSchema = z.object({ task: TaskSchema });

/** POST /api/dependencies：人手建有向边；server clamp status=active、补 id/时间戳。 */
export const CreateDependencyRequestSchema = DependencySchema.omit({
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});
export const CreateDependencyResponseSchema = z.object({
  dependency: DependencySchema,
});

/** POST /api/needs：前置需求 G3；server clamp status=open、openedAt=now、claimedByMemberId=null（A2 反派单）。 */
export const CreateNeedRequestSchema = NeedSchema.omit({
  id: true,
  status: true,
  openedAt: true,
  escalatedAt: true,
  claimedByMemberId: true,
});
export const CreateNeedResponseSchema = z.object({ need: NeedSchema });

export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;
export type CreateTaskResponse = z.infer<typeof CreateTaskResponseSchema>;
export type CreateDependencyRequest = z.infer<
  typeof CreateDependencyRequestSchema
>;
export type CreateDependencyResponse = z.infer<
  typeof CreateDependencyResponseSchema
>;
export type CreateNeedRequest = z.infer<typeof CreateNeedRequestSchema>;
export type CreateNeedResponse = z.infer<typeof CreateNeedResponseSchema>;
