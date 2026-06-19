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
  TasksResponseSchema,
  type ArtifactsResponse,
  type DepGraph,
  type GroupGapsResponse,
  type PresenceScheduleResponse,
  type ResourceSessionsResponse,
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
} from './schemas/pm';

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
  };
}

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
    throw new Error(`Hub API ${response.status}: ${url}`);
  }
  return schema.parse(await response.json());
}

async function postJson<T>(
  url: string,
  body: unknown,
  schema: { parse(value: unknown): T },
  fetcher: FetchLike,
  writeToken?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (writeToken) headers.authorization = `Bearer ${writeToken}`;
  const response = await fetcher(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
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

async function readDetail(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    return typeof body.detail === 'string' ? body.detail : null;
  } catch {
    return null;
  }
}
