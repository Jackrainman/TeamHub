import {
  AssignTaskResponseSchema,
  ClaimTaskResponseSchema,
  CompleteTaskResponseSchema,
  ConfirmCrossClaimResponseSchema,
  CreateDependencyResponseSchema,
  CreateNeedResponseSchema,
  CreateSeasonResponseSchema,
  CreateTaskResponseSchema,
  DepGraphSchema,
  GroupGapsResponseSchema,
  GroupResponseSchema,
  GroupsResponseSchema,
  ReviewTaskResponseSchema,
  SeasonsResponseSchema,
  SetTaskPartnerResponseSchema,
  TasksResponseSchema,
  TransitionTaskStatusResponseSchema,
  WaiveDependencyResponseSchema,
  type AssignTaskRequest,
  type AssignTaskResponse,
  type ClaimTaskRequest,
  type ClaimTaskResponse,
  type CompleteTaskRequest,
  type CompleteTaskResponse,
  type ConfirmCrossClaimRequest,
  type ConfirmCrossClaimResponse,
  type CreateDependencyRequest,
  type CreateDependencyResponse,
  type CreateGroupRequest,
  type CreateNeedRequest,
  type CreateNeedResponse,
  type CreateSeasonRequest,
  type CreateTaskRequest,
  type CreateTaskResponse,
  type DepGraph,
  type Group,
  type GroupGapsResponse,
  type GroupResponse,
  type RenameGroupRequest,
  type ReviewTaskRequest,
  type ReviewTaskResponse,
  type Season,
  type SetTaskPartnerRequest,
  type SetTaskPartnerResponse,
  type TaskStatus,
  type TaskWithMeta,
  type TransitionTaskStatusResponse,
  type WaiveDependencyResponse,
} from '@teamhub/hub-contracts';
import type { HttpContext } from '../../api/http';
import { fetchJson, postJson, sendJson } from '../../api/http';

/**
 * pm 域 API 分段（ARCH-UNIFY A4；前身 api/segments/system-pm.ts 的 pm 半 + schemas/pm.ts 转发层）。
 * 端点对照 server modules/pm。全局搜索（/api/search）属 reporting，不入本段。
 */
export interface PmSegment {
  getDepGraph(): Promise<DepGraph>;
  getGroupGaps(): Promise<GroupGapsResponse>;
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

export function createPmSegment(ctx: HttpContext): PmSegment {
  const { baseUrl, fetcher, writeToken } = ctx;
  return {
    async getDepGraph() {
      return fetchJson(`${baseUrl}/api/dep-graph`, DepGraphSchema, fetcher);
    },
    async getGroupGaps() {
      return fetchJson(`${baseUrl}/api/group-gaps`, GroupGapsResponseSchema, fetcher);
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
