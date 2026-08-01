import {
  DepGraphSchema,
  GroupGapsResponseSchema,
  GroupsResponseSchema,
  GroupResponseSchema,
  SeasonsResponseSchema,
  CreateSeasonResponseSchema,
  TasksResponseSchema,
  type DepGraph,
  type GroupGapsResponse,
  type Group,
  type GroupResponse,
  type CreateGroupRequest,
  type RenameGroupRequest,
  type CreateSeasonRequest,
  type Season,
  type TaskWithMeta,
  type TaskStatus,
} from '@teamhub/hub-contracts';
import {
  HealthResponseSchema,
  OverviewSnapshotSchema,
  SystemStatusResponseSchema,
  type OverviewSnapshot,
  type SystemStatusResponse,
} from '../schemas/system';
import {
  CreateTaskResponseSchema,
  CreateDependencyResponseSchema,
  CreateNeedResponseSchema,
  TransitionTaskStatusResponseSchema,
  WaiveDependencyResponseSchema,
  ClaimTaskResponseSchema,
  AssignTaskResponseSchema,
  SetTaskPartnerResponseSchema,
  ConfirmCrossClaimResponseSchema,
  CompleteTaskResponseSchema,
  ReviewTaskResponseSchema,
  type CreateTaskRequest,
  type CreateTaskResponse,
  type CreateDependencyRequest,
  type CreateDependencyResponse,
  type CreateNeedRequest,
  type CreateNeedResponse,
  type TransitionTaskStatusResponse,
  type WaiveDependencyResponse,
  type ClaimTaskRequest,
  type ClaimTaskResponse,
  type AssignTaskRequest,
  type AssignTaskResponse,
  type SetTaskPartnerRequest,
  type SetTaskPartnerResponse,
  type ConfirmCrossClaimRequest,
  type ConfirmCrossClaimResponse,
  type CompleteTaskRequest,
  type CompleteTaskResponse,
  type ReviewTaskRequest,
  type ReviewTaskResponse,
} from '../schemas/pm';
import {
  AgentBackendsResponseSchema,
  BotChannelsResponseSchema,
  BridgeMembersResponseSchema,
  DataSourcesResponseSchema,
  GitReposResponseSchema,
  HubEventsResponseSchema,
  ArtifactsResponseSchema,
} from '@teamhub/hub-contracts';
import type { HttpContext } from '../http';
import { fetchJson, postJson, sendJson } from '../http';

export interface SystemPmSegment {
  getOverview(): Promise<OverviewSnapshot>;
  getSystemStatus(): Promise<SystemStatusResponse>;
  getDepGraph(): Promise<DepGraph>;
  getGroupGaps(): Promise<GroupGapsResponse>;
  globalSearch(q: string): Promise<{ results: Array<{ type: string; id: string; title: string; snippet: string }> }>;
  getTasks(query?: { q?: string }): Promise<{ tasks: TaskWithMeta[] }>;
  getSeasons(): Promise<{ seasons: Season[] }>;
  createSeason(req: CreateSeasonRequest): Promise<{ season: Season }>;
  getGroups(): Promise<{ groups: Group[]; assignableGroupIds: string[] }>;
  createGroup(req: CreateGroupRequest): Promise<GroupResponse>;
  renameGroup(id: string, req: RenameGroupRequest): Promise<GroupResponse>;
  deleteGroup(id: string): Promise<GroupResponse>;
  createTask(req: CreateTaskRequest): Promise<CreateTaskResponse>;
  createDependency(req: CreateDependencyRequest): Promise<CreateDependencyResponse>;
  createNeed(req: CreateNeedRequest): Promise<CreateNeedResponse>;
  updateTaskStatus(taskId: string, status: TaskStatus): Promise<TransitionTaskStatusResponse>;
  waiveDependency(depId: string): Promise<WaiveDependencyResponse>;
  claimTask(taskId: string, req: ClaimTaskRequest): Promise<ClaimTaskResponse>;
  assignTask(taskId: string, req: AssignTaskRequest): Promise<AssignTaskResponse>;
  setTaskPartner(taskId: string, req: SetTaskPartnerRequest): Promise<SetTaskPartnerResponse>;
  confirmCrossClaim(taskId: string, req: ConfirmCrossClaimRequest): Promise<ConfirmCrossClaimResponse>;
  completeTask(taskId: string, req: CompleteTaskRequest): Promise<CompleteTaskResponse>;
  reviewTask(taskId: string, req: ReviewTaskRequest): Promise<ReviewTaskResponse>;
}

export function createSystemPmSegment(ctx: HttpContext): SystemPmSegment {
  const { baseUrl, fetcher, writeToken } = ctx;
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
        fetchJson(`${baseUrl}/api/system/status`, SystemStatusResponseSchema, fetcher),
        fetchJson(`${baseUrl}/api/bot-channels`, BotChannelsResponseSchema, fetcher),
        fetchJson(`${baseUrl}/api/agent-backends`, AgentBackendsResponseSchema, fetcher),
        fetchJson(`${baseUrl}/api/data-sources`, DataSourcesResponseSchema, fetcher),
        fetchJson(`${baseUrl}/api/events`, HubEventsResponseSchema, fetcher),
        fetchJson(`${baseUrl}/api/bridge/members`, BridgeMembersResponseSchema, fetcher),
        fetchJson(`${baseUrl}/api/git/repos`, GitReposResponseSchema, fetcher),
        fetchJson(`${baseUrl}/api/artifacts`, ArtifactsResponseSchema, fetcher),
      ]);
      return OverviewSnapshotSchema.parse({
        health, system, botChannels, agentBackends, dataSources, events, bridgeMembers, gitRepos, artifacts,
      });
    },
    async getSystemStatus() {
      return fetchJson(`${baseUrl}/api/system/status`, SystemStatusResponseSchema, fetcher);
    },
    async getDepGraph() {
      return fetchJson(`${baseUrl}/api/dep-graph`, DepGraphSchema, fetcher);
    },
    async getGroupGaps() {
      return fetchJson(`${baseUrl}/api/group-gaps`, GroupGapsResponseSchema, fetcher);
    },
    async globalSearch(q: string) {
      const res = await fetcher(`${baseUrl}/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error(`search ${res.status}`);
      return res.json() as Promise<{ results: Array<{ type: string; id: string; title: string; snippet: string }> }>;
    },
    async getTasks(query?: { q?: string }) {
      const q = query?.q?.trim();
      const qs = q ? `?q=${encodeURIComponent(q)}` : '';
      return fetchJson(`${baseUrl}/api/tasks${qs}`, TasksResponseSchema, fetcher);
    },
    async getSeasons() {
      return fetchJson(`${baseUrl}/api/seasons`, SeasonsResponseSchema, fetcher);
    },
    async createSeason(req: CreateSeasonRequest) {
      return postJson(`${baseUrl}/api/seasons`, req, CreateSeasonResponseSchema, fetcher, writeToken);
    },
    async getGroups() {
      return fetchJson(`${baseUrl}/api/groups`, GroupsResponseSchema, fetcher);
    },
    async createGroup(req: CreateGroupRequest) {
      return postJson(`${baseUrl}/api/groups`, req, GroupResponseSchema, fetcher, writeToken);
    },
    async renameGroup(id: string, req: RenameGroupRequest) {
      return sendJson('PUT', `${baseUrl}/api/groups/${encodeURIComponent(id)}`, req, GroupResponseSchema, fetcher, writeToken);
    },
    async deleteGroup(id: string): Promise<GroupResponse> {
      return sendJson('DELETE', `${baseUrl}/api/groups/${encodeURIComponent(id)}`, undefined, GroupResponseSchema, fetcher, writeToken);
    },
    async createTask(req: CreateTaskRequest) {
      return postJson(`${baseUrl}/api/tasks`, req, CreateTaskResponseSchema, fetcher, writeToken);
    },
    async createDependency(req: CreateDependencyRequest) {
      return postJson(`${baseUrl}/api/dependencies`, req, CreateDependencyResponseSchema, fetcher, writeToken);
    },
    async createNeed(req: CreateNeedRequest) {
      return postJson(`${baseUrl}/api/needs`, req, CreateNeedResponseSchema, fetcher, writeToken);
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
    async claimTask(taskId: string, req: ClaimTaskRequest) {
      return postJson(`${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/claim`, req, ClaimTaskResponseSchema, fetcher, writeToken);
    },
    async assignTask(taskId: string, req: AssignTaskRequest) {
      return postJson(`${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/assign`, req, AssignTaskResponseSchema, fetcher, writeToken);
    },
    async setTaskPartner(taskId: string, req: SetTaskPartnerRequest) {
      return postJson(`${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/partner`, req, SetTaskPartnerResponseSchema, fetcher, writeToken);
    },
    async confirmCrossClaim(taskId: string, req: ConfirmCrossClaimRequest) {
      return postJson(`${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/confirm-cross-claim`, req, ConfirmCrossClaimResponseSchema, fetcher, writeToken);
    },
    async completeTask(taskId: string, req: CompleteTaskRequest) {
      return postJson(`${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/complete`, req, CompleteTaskResponseSchema, fetcher, writeToken);
    },
    async reviewTask(taskId: string, req: ReviewTaskRequest) {
      return postJson(`${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/review`, req, ReviewTaskResponseSchema, fetcher, writeToken);
    },
  };
}
