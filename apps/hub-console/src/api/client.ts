import { z } from 'zod';
import {
  AgentBackendsResponseSchema,
  ArtifactsResponseSchema,
  BotChannelsResponseSchema,
  BridgeMembersResponseSchema,
  DataSourcesResponseSchema,
  DepGraphSchema,
  GitReposResponseSchema,
  GroupGapsResponseSchema,
  HubEventsResponseSchema,
  PresenceScheduleResponseSchema,
  ResourceSessionsResponseSchema,
  SharedResourcesResponseSchema,
  TasksResponseSchema,
  type ArtifactsResponse,
  type DepGraph,
  type GroupGapsResponse,
  type PresenceScheduleResponse,
  type ResourceSessionsResponse,
  type SharedResourcesResponse,
  type Task,
  type TaskStatus,
} from '@teamhub/hub-contracts';
import {
  HealthResponseSchema,
  OverviewSnapshotSchema,
  SystemStatusResponseSchema,
  type OverviewSnapshot,
  type SystemStatusResponse,
} from './schemas/system';
import {
  KbSimilarResponseSchema,
  KbCloseoutResponseSchema,
  type KbSimilarParams,
  type KbSimilarResponse,
  type KbCloseoutRequest,
  type KbCloseoutResponse,
} from './schemas/kb';
import {
  CreateTaskResponseSchema,
  CreateDependencyResponseSchema,
  CreateNeedResponseSchema,
  TransitionTaskStatusResponseSchema,
  WaiveDependencyResponseSchema,
  CreateArtifactResponseSchema,
  UploadArtifactResponseSchema,
  type CreateTaskRequest,
  type CreateTaskResponse,
  type CreateDependencyRequest,
  type CreateDependencyResponse,
  type CreateNeedRequest,
  type CreateNeedResponse,
  type TransitionTaskStatusResponse,
  type WaiveDependencyResponse,
  type CreateArtifactRequest,
  type CreateArtifactResponse,
  type UploadArtifactResponse,
} from './schemas/pm';
import {
  InventoryResponseSchema,
  CreatePartTypeResponseSchema,
  CreatePartActionResponseSchema,
  type InventoryResponse,
  type CreatePartTypeRequest,
  type CreatePartTypeResponse,
  type CreatePartActionRequest,
  type CreatePartActionResponse,
} from './schemas/inv';
import {
  RelayBoardResponseSchema,
  UpdateResourceSessionResponseSchema,
  RelayHandoffResponseSchema,
  CreateResourceSessionResponseSchema,
  type RelayBoardResponse,
  type UpdateResourceSessionRequest,
  type UpdateResourceSessionResponse,
  type CreateRelayHandoffRequest,
  type RelayHandoffResponse,
  type CreateResourceSessionRequest,
  type CreateResourceSessionResponse,
} from './schemas/schedule';
import {
  CreateResourceResponseSchema,
  UpdateResourceResponseSchema,
  type CreateResourceRequest,
  type CreateResourceResponse,
  type UpdateResourceStatusRequest,
  type UpdateResourceResponse,
} from './schemas/resources';

type FetchLike = typeof fetch;

export interface HubApiClientOptions {
  baseUrl?: string;
  fetcher?: FetchLike;
  // 写入令牌（Bearer）：server 绑非 loopback 时写端点强制鉴权。有则附到所有 POST 的
  // Authorization 头；空则不附（loopback dev 无需）。来源 = 设置页 localStorage。
  writeToken?: string;
}

export interface HubApiClient {
  getOverview(): Promise<OverviewSnapshot>;
  getSystemStatus(): Promise<SystemStatusResponse>;
  getDepGraph(): Promise<DepGraph>;
  // 方向缺口（S2，D-069）：组级缺人方向，只读派生视图。A1：响应无 memberId、永不下钻到人。
  getGroupGaps(): Promise<GroupGapsResponse>;
  // 差异化在场排班（D-029）：按组×窗口派生 present/onCall/free，I0：输出无 memberId/invitedMemberIds。
  getSchedule(windowLabel: string): Promise<PresenceScheduleResponse>;
  getResourceSessions(): Promise<ResourceSessionsResponse>;
  // 共享物理资源（机器人）列表：接力链按机器人并排时取 displayCode ?? name 作列头。无人维度（中性事实）。
  getResources(): Promise<SharedResourcesResponse>;
  // 机器人管理写侧（R3，D-072 §3.2/§3.3）。新建：填 season + robotTarget + version → server 派生 displayCode
  //（禁手写）；改状态：维修 / 退役 / 拆解 / 恢复等状态迁移（**退役 = status→retired、非物删，无 DELETE 口子**）。
  // 反监视红线：SharedResource 结构上无成员维度，写请求绝不含 memberId / 出勤。
  createResource(req: CreateResourceRequest): Promise<CreateResourceResponse>;
  updateResourceStatus(
    id: string,
    patch: UpdateResourceStatusRequest,
  ): Promise<UpdateResourceResponse>;
  getKbSimilar(params: KbSimilarParams): Promise<KbSimilarResponse>;
  getTasks(): Promise<{ tasks: Task[] }>;
  // 图纸提交日志/版本时间线（档案页）：与总览第 7 个 fetch 同源 /api/artifacts，读治理快照。
  getArtifacts(): Promise<ArtifactsResponse>;
  // 写侧（PM 录入簇 + KB 结案）。I0：confirmedBy 随依赖/需求请求传入但读视图永不回显；
  // 创建响应回完整对象（回给录入本人，非第三方）。
  createTask(req: CreateTaskRequest): Promise<CreateTaskResponse>;
  createDependency(
    req: CreateDependencyRequest,
  ): Promise<CreateDependencyResponse>;
  createNeed(req: CreateNeedRequest): Promise<CreateNeedResponse>;
  closeoutKb(req: KbCloseoutRequest): Promise<KbCloseoutResponse>;
  // 受限状态机迁移（非创建）：任务状态流转 + 连线作废（软删除）。POST 子资源动作，命中后端写鉴权钩子。
  updateTaskStatus(
    taskId: string,
    status: TaskStatus,
  ): Promise<TransitionTaskStatusResponse>;
  waiveDependency(depId: string): Promise<WaiveDependencyResponse>;
  // 图纸档案写侧（V1-FOLLOWUPS ④，append-only）。I0：请求无人维度，submittedVia 由 server 钉 console（C5）。
  createArtifact(req: CreateArtifactRequest): Promise<CreateArtifactResponse>;
  // 给既有图纸上传/替换真实文件（multipart，HUB-ARTIFACT-STORE-MECH 本地卷）。字节进本地卷、回带 storedFile 指针。
  uploadArtifactFile(id: string, file: File): Promise<UploadArtifactResponse>;
  // 库存 / BOM（INV-BOM-CORE）。读：零件 + 个体件 + 矩阵派生 + 缺料；I0：返回体无人维度。
  // 写：盘点 / 调整零件 + 一句话快记动作（source 由 server 钉 human，C5；recordedBy 绝无 memberId）。
  getInventory(): Promise<InventoryResponse>;
  upsertPartType(req: CreatePartTypeRequest): Promise<CreatePartTypeResponse>;
  recordPartAction(req: CreatePartActionRequest): Promise<CreatePartActionResponse>;
  // 接力交接画布（R1，D-029）。读：派生「一排接力站 + 站间交接线」（windowLabel）。
  // 写：PATCH 占用窗口受限编辑（队长拖卡片排先后 orderInWindow / 选填 eta）；POST/DELETE 接力交接线。
  // 反监视红线：stages / handoffs / 任何返回体绝不含 memberId / invitedMemberIds / 出勤计数。
  getRelay(windowLabel: string): Promise<RelayBoardResponse>;
  updateResourceSession(
    id: string,
    patch: UpdateResourceSessionRequest,
  ): Promise<UpdateResourceSessionResponse>;
  // A2 加一棒（POST /api/resource-sessions）：队长在画布上新增一条占用窗口（选机器人 + 任务 → 该机器人末棒 +1）。
  // confirmedBy 随请求传入（录入即拍板）；I0：响应剥 confirmedBy，invitedMemberIds 由调用方传空。
  createResourceSession(
    req: CreateResourceSessionRequest,
  ): Promise<CreateResourceSessionResponse>;
  createRelayHandoff(
    req: CreateRelayHandoffRequest,
  ): Promise<RelayHandoffResponse>;
  deleteRelayHandoff(id: string): Promise<{ deleted: string }>;
  // A2 删一棒（DELETE /api/resource-sessions/:id）：删卡，后端级联删引用它的接力交接线（箭头不悬空）。
  deleteResourceSession(id: string): Promise<{ deleted: string }>;
}

export function createHubApiClient(options: HubApiClientOptions = {}): HubApiClient {
  // 单一真实后端：baseUrl 为空 / '/' → 同源相对路径；否则用给定绝对地址。
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetcher = options.fetcher ?? fetch;
  const writeToken = options.writeToken?.trim() || undefined;
  return {
    async getOverview() {
      const [
        health,
        system,
        botChannels,
        agentBackends,
        dataSources,
        events,
        bridgeMembers,
        gitRepos,
        artifacts,
      ] = await Promise.all([
        fetchJson(`${baseUrl}/health`, HealthResponseSchema, fetcher),
        fetchJson(
          `${baseUrl}/api/system/status`,
          SystemStatusResponseSchema,
          fetcher,
        ),
        fetchJson(
          `${baseUrl}/api/bot-channels`,
          BotChannelsResponseSchema,
          fetcher,
        ),
        fetchJson(
          `${baseUrl}/api/agent-backends`,
          AgentBackendsResponseSchema,
          fetcher,
        ),
        fetchJson(
          `${baseUrl}/api/data-sources`,
          DataSourcesResponseSchema,
          fetcher,
        ),
        fetchJson(`${baseUrl}/api/events`, HubEventsResponseSchema, fetcher),
        fetchJson(
          `${baseUrl}/api/bridge/members`,
          BridgeMembersResponseSchema,
          fetcher,
        ),
        fetchJson(`${baseUrl}/api/git/repos`, GitReposResponseSchema, fetcher),
        fetchJson(`${baseUrl}/api/artifacts`, ArtifactsResponseSchema, fetcher),
      ]);

      return OverviewSnapshotSchema.parse({
        health,
        system,
        botChannels,
        agentBackends,
        dataSources,
        events,
        bridgeMembers,
        gitRepos,
        artifacts,
      });
    },
    async getSystemStatus() {
      return fetchJson(
        `${baseUrl}/api/system/status`,
        SystemStatusResponseSchema,
        fetcher,
      );
    },
    async getDepGraph() {
      return fetchJson(`${baseUrl}/api/dep-graph`, DepGraphSchema, fetcher);
    },
    async getGroupGaps() {
      return fetchJson(
        `${baseUrl}/api/group-gaps`,
        GroupGapsResponseSchema,
        fetcher,
      );
    },
    async getSchedule(windowLabel: string) {
      return fetchJson(
        `${baseUrl}/api/schedule?windowLabel=${encodeURIComponent(windowLabel)}`,
        PresenceScheduleResponseSchema,
        fetcher,
      );
    },
    async getResourceSessions() {
      return fetchJson(
        `${baseUrl}/api/resource-sessions`,
        ResourceSessionsResponseSchema,
        fetcher,
      );
    },
    async getResources() {
      return fetchJson(
        `${baseUrl}/api/resources`,
        SharedResourcesResponseSchema,
        fetcher,
      );
    },
    async createResource(req: CreateResourceRequest) {
      return postJson(
        `${baseUrl}/api/resources`,
        req,
        CreateResourceResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async updateResourceStatus(id: string, patch: UpdateResourceStatusRequest) {
      return sendJson(
        'PATCH',
        `${baseUrl}/api/resources/${encodeURIComponent(id)}/status`,
        patch,
        UpdateResourceResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async getKbSimilar(params: KbSimilarParams) {
      const qs = new URLSearchParams();
      qs.set('symptom', params.symptom);
      if (params.projectId) qs.set('projectId', params.projectId);
      if (params.tags && params.tags.length > 0) {
        qs.set('tags', params.tags.join(','));
      }
      if (params.limit != null) qs.set('limit', String(params.limit));
      if (params.minScore != null) qs.set('minScore', String(params.minScore));
      return fetchJson(
        `${baseUrl}/api/kb/similar?${qs.toString()}`,
        KbSimilarResponseSchema,
        fetcher,
      );
    },
    async getTasks() {
      return fetchJson(`${baseUrl}/api/tasks`, TasksResponseSchema, fetcher);
    },
    async getArtifacts() {
      return fetchJson(
        `${baseUrl}/api/artifacts`,
        ArtifactsResponseSchema,
        fetcher,
      );
    },
    async createTask(req: CreateTaskRequest) {
      return postJson(
        `${baseUrl}/api/tasks`,
        req,
        CreateTaskResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async createDependency(req: CreateDependencyRequest) {
      return postJson(
        `${baseUrl}/api/dependencies`,
        req,
        CreateDependencyResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async createNeed(req: CreateNeedRequest) {
      return postJson(
        `${baseUrl}/api/needs`,
        req,
        CreateNeedResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async closeoutKb(req: KbCloseoutRequest) {
      return postJson(
        `${baseUrl}/api/kb/closeout`,
        req,
        KbCloseoutResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async updateTaskStatus(taskId: string, status: TaskStatus) {
      return postJson(
        `${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/status`,
        { status },
        TransitionTaskStatusResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async waiveDependency(depId: string) {
      return postJson(
        `${baseUrl}/api/dependencies/${encodeURIComponent(depId)}/waive`,
        {},
        WaiveDependencyResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async createArtifact(req: CreateArtifactRequest) {
      return postJson(
        `${baseUrl}/api/artifacts`,
        req,
        CreateArtifactResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async uploadArtifactFile(id: string, file: File) {
      return postFormData(
        `${baseUrl}/api/artifacts/${encodeURIComponent(id)}/upload`,
        file,
        UploadArtifactResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async getInventory() {
      return fetchJson(
        `${baseUrl}/api/inventory`,
        InventoryResponseSchema,
        fetcher,
      );
    },
    async upsertPartType(req: CreatePartTypeRequest) {
      return postJson(
        `${baseUrl}/api/inventory/part-types`,
        req,
        CreatePartTypeResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async recordPartAction(req: CreatePartActionRequest) {
      return postJson(
        `${baseUrl}/api/inventory/actions`,
        req,
        CreatePartActionResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async getRelay(windowLabel: string) {
      return fetchJson(
        `${baseUrl}/api/relay?windowLabel=${encodeURIComponent(windowLabel)}`,
        RelayBoardResponseSchema,
        fetcher,
      );
    },
    async updateResourceSession(
      id: string,
      patch: UpdateResourceSessionRequest,
    ) {
      return sendJson(
        'PATCH',
        `${baseUrl}/api/resource-sessions/${encodeURIComponent(id)}`,
        patch,
        UpdateResourceSessionResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async createResourceSession(req: CreateResourceSessionRequest) {
      return postJson(
        `${baseUrl}/api/resource-sessions`,
        req,
        CreateResourceSessionResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async createRelayHandoff(req: CreateRelayHandoffRequest) {
      return postJson(
        `${baseUrl}/api/relay-handoffs`,
        req,
        RelayHandoffResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async deleteRelayHandoff(id: string) {
      return sendJson(
        'DELETE',
        `${baseUrl}/api/relay-handoffs/${encodeURIComponent(id)}`,
        undefined,
        DeletedResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async deleteResourceSession(id: string) {
      return sendJson(
        'DELETE',
        `${baseUrl}/api/resource-sessions/${encodeURIComponent(id)}`,
        undefined,
        DeletedResponseSchema,
        fetcher,
        writeToken,
      );
    },
  };
}

// DELETE /api/relay-handoffs/:id 命中返回 { deleted: id }（server.ts:541）。
const DeletedResponseSchema = z.object({ deleted: z.string().min(1) });

function normalizeBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim();
  // 空或 '/' → 同源相对路径（dev 走 vite proxy，同源部署直接命中 /api）。
  if (!trimmed || trimmed === '/') {
    return '';
  }
  return trimmed.replace(/\/+$/, '');
}

async function fetchJson<T>(
  url: string,
  schema: { parse(value: unknown): T },
  fetcher: FetchLike,
): Promise<T> {
  const response = await fetcher(url);
  if (!response.ok) {
    // 读侧也透出后端 { detail }（与 sendJson 对称）：否则只剩 "Hub API 400: url"、真实原因丢失。
    const detail = await readDetail(response);
    throw new Error(
      detail ? `${response.status}: ${detail}` : `Hub API ${response.status}: ${url}`,
    );
  }
  return schema.parse(await response.json());
}

function postJson<T>(
  url: string,
  body: unknown,
  schema: { parse(value: unknown): T },
  fetcher: FetchLike,
  writeToken?: string,
): Promise<T> {
  return sendJson('POST', url, body, schema, fetcher, writeToken);
}

// 写侧通用发送（POST/PATCH/DELETE 共用）。R1 引入 PATCH 占用窗口 / DELETE 接力线，与 POST
// 同走 Bearer 写鉴权 + { detail } 错误透出。body=undefined 时不发请求体（DELETE 无体）。
async function sendJson<T>(
  method: 'POST' | 'PATCH' | 'DELETE',
  url: string,
  body: unknown,
  schema: { parse(value: unknown): T },
  fetcher: FetchLike,
  writeToken?: string,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (writeToken) headers.authorization = `Bearer ${writeToken}`;
  const response = await fetcher(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    // 后端校验失败（400/422）带 { detail }：透出给表单错误条，便于人看清缺了什么。
    const detail = await readDetail(response);
    throw new Error(
      detail ? `${response.status}: ${detail}` : `Hub API ${response.status}: ${url}`,
    );
  }
  return schema.parse(await response.json());
}

// 文件上传（multipart）：不能走 sendJson（它 JSON.stringify body）。用 FormData，**不手设 content-type**——
// 浏览器自带 multipart boundary；写鉴权 Bearer 同 sendJson；错误同走 { detail } 透出。
async function postFormData<T>(
  url: string,
  file: File,
  schema: { parse(value: unknown): T },
  fetcher: FetchLike,
  writeToken?: string,
): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const headers: Record<string, string> = {};
  if (writeToken) headers.authorization = `Bearer ${writeToken}`;
  const response = await fetcher(url, { method: 'POST', headers, body: form });
  if (!response.ok) {
    const detail = await readDetail(response);
    throw new Error(
      detail ? `${response.status}: ${detail}` : `Hub API ${response.status}: ${url}`,
    );
  }
  return schema.parse(await response.json());
}

async function readDetail(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    return typeof body.detail === 'string' ? body.detail : null;
  } catch {
    return null;
  }
}
