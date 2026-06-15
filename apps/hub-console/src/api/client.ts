import {
  AdaptersResponseSchema,
  ArtifactsResponseSchema,
  BridgeMembersResponseSchema,
  DepGraphSchema,
  GitReposResponseSchema,
  HubEventsResponseSchema,
  TasksResponseSchema,
  type ArtifactsResponse,
  type DepGraph,
  type Task,
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
  type CreateTaskRequest,
  type CreateTaskResponse,
  type CreateDependencyRequest,
  type CreateDependencyResponse,
  type CreateNeedRequest,
  type CreateNeedResponse,
} from './schemas/pm';

type FetchLike = typeof fetch;

export interface HubApiClientOptions {
  baseUrl?: string;
  fetcher?: FetchLike;
}

export interface HubApiClient {
  getOverview(): Promise<OverviewSnapshot>;
  getSystemStatus(): Promise<SystemStatusResponse>;
  getDepGraph(): Promise<DepGraph>;
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
}

export function createHubApiClient(options: HubApiClientOptions = {}): HubApiClient {
  // 单一真实后端：baseUrl 为空 / '/' → 同源相对路径；否则用给定绝对地址。
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetcher = options.fetcher ?? fetch;
  return {
    async getOverview() {
      const [
        health,
        system,
        adapters,
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
        fetchJson(`${baseUrl}/api/adapters`, AdaptersResponseSchema, fetcher),
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
        adapters,
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
    async getKbSimilar(params: KbSimilarParams) {
      const qs = new URLSearchParams();
      qs.set('symptom', params.symptom);
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
      );
    },
    async createDependency(req: CreateDependencyRequest) {
      return postJson(
        `${baseUrl}/api/dependencies`,
        req,
        CreateDependencyResponseSchema,
        fetcher,
      );
    },
    async createNeed(req: CreateNeedRequest) {
      return postJson(
        `${baseUrl}/api/needs`,
        req,
        CreateNeedResponseSchema,
        fetcher,
      );
    },
    async closeoutKb(req: KbCloseoutRequest) {
      return postJson(
        `${baseUrl}/api/kb/closeout`,
        req,
        KbCloseoutResponseSchema,
        fetcher,
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
): Promise<T> {
  const response = await fetcher(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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
