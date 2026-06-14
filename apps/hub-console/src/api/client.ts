import {
  AdaptersResponseSchema,
  ArtifactsResponseSchema,
  BridgeMembersResponseSchema,
  DepGraphSchema,
  GitReposResponseSchema,
  HubEventsResponseSchema,
  TasksResponseSchema,
  TaskSchema,
  DependencySchema,
  NeedSchema,
  buildCloseoutFromIssue,
  deriveErrorCode,
  type DepGraph,
  type Task,
} from '@teamhub/hub-contracts';
import { mockDepGraph } from './mock/dep-graph';
import { mockKbSimilar } from './mock/kb';
import { mockOverviewSnapshot } from './mock/overview';
import { mockTasks } from './mock/tasks';
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
  mode: 'mock' | 'real';
  getOverview(): Promise<OverviewSnapshot>;
  getSystemStatus(): Promise<SystemStatusResponse>;
  getDepGraph(): Promise<DepGraph>;
  getKbSimilar(params: KbSimilarParams): Promise<KbSimilarResponse>;
  getTasks(): Promise<{ tasks: Task[] }>;
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
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  if (baseUrl === null) {
    // Mock 模式：闭包内可变任务表，让写表单在无后端时也能即时反映在看板上（演示/视觉验收用）。
    // 切换数据源会重建 client → 重置演示数据，符合预期。
    const mockTaskStore: Task[] = TasksResponseSchema.parse(mockTasks).tasks.slice();
    let mockSeq = 0;
    const nextId = (prefix: string) => `${prefix}-mock-${(mockSeq += 1)}`;
    return {
      mode: 'mock',
      async getOverview() {
        return OverviewSnapshotSchema.parse(mockOverviewSnapshot);
      },
      async getSystemStatus() {
        return SystemStatusResponseSchema.parse(mockOverviewSnapshot.system);
      },
      async getDepGraph() {
        return DepGraphSchema.parse(mockDepGraph);
      },
      async getKbSimilar(params: KbSimilarParams) {
        return mockKbSimilar(params);
      },
      async getTasks() {
        return { tasks: mockTaskStore.slice() };
      },
      async createTask(req: CreateTaskRequest) {
        const now = nowIso();
        const task = TaskSchema.parse({
          ...req,
          id: nextId('task'),
          status: req.status ?? 'pending',
          statusSource: req.statusSource ?? 'console',
          lastProgressAt: null,
          createdAt: now,
          updatedAt: now,
        });
        mockTaskStore.push(task);
        return CreateTaskResponseSchema.parse({ task });
      },
      async createDependency(req: CreateDependencyRequest) {
        const now = nowIso();
        const dependency = DependencySchema.parse({
          ...req,
          id: nextId('dep'),
          status: 'active',
          createdAt: now,
          updatedAt: now,
        });
        return CreateDependencyResponseSchema.parse({ dependency });
      },
      async createNeed(req: CreateNeedRequest) {
        const now = nowIso();
        const need = NeedSchema.parse({
          ...req,
          id: nextId('need'),
          status: 'open',
          claimedByMemberId: null,
          openedAt: now,
          escalatedAt: null,
        });
        return CreateNeedResponseSchema.parse({ need });
      },
      async closeoutKb(req: KbCloseoutRequest) {
        // Mock 复用「与后端同一份」纯函数 buildCloseoutFromIssue（不在前端复刻派生逻辑），
        // 仅补后端 server.ts/Store 那两步：deriveErrorCode（DBG-YYYYMMDD-NNN）+ draft→node 注入 id/createdAt。
        const now = nowIso();
        const result = buildCloseoutFromIssue(
          req.issue,
          req.records ?? [],
          {
            category: req.category ?? '',
            rootCause: req.rootCause,
            resolution: req.resolution,
            prevention: req.prevention ?? '',
          },
          {
            now,
            errorEntryId: `err-${req.issue.id}`,
            errorCode: deriveErrorCode(now, req.issue.id),
            generatedBy: req.generatedBy ?? 'hybrid',
          },
        );
        if (!result.ok) {
          // 与后端 422 同义（缺 rootCause/resolution、卡已归档）：透出给表单错误条，不伪造完成。
          throw new Error(`422: ${result.reason}`);
        }
        return KbCloseoutResponseSchema.parse({
          archiveDocument: result.archiveDocument,
          errorEntry: result.errorEntry,
          updatedIssueCard: result.updatedIssueCard,
          knowledgeNode: {
            ...result.knowledgeNodeDraft,
            id: `kn-${req.issue.id}`,
            createdAt: now,
          },
        });
      },
    };
  }

  const fetcher = options.fetcher ?? fetch;
  return {
    mode: 'real',
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

function normalizeBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed === '/') {
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

function nowIso(): string {
  return new Date().toISOString();
}
