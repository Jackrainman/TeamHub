import {
  ClaimTaskResponseSchema, CompleteTaskResponseSchema, CreateTaskResponseSchema,
  GroupResponseSchema, GroupsResponseSchema, ReviewTaskResponseSchema,
  TasksResponseSchema, TransitionTaskStatusResponseSchema,
  type ClaimTaskRequest, type ClaimTaskResponse, type CompleteTaskRequest,
  type CompleteTaskResponse, type CreateGroupRequest, type CreateTaskRequest,
  type CreateTaskResponse, type Group, type GroupResponse, type RenameGroupRequest,
  type ReviewTaskRequest, type ReviewTaskResponse, type SelfReportTaskRequest,
  type TaskStatus, type TaskWithMeta, type TransitionTaskStatusResponse,
  type UpdateSelfTaskRequest, type ScheduleTaskRequest,
} from '@teamhub/hub-contracts';
import type { HttpContext } from '../../api/http';
import { fetchJson, postJson, sendJson } from '../../api/http';

export interface PmSegment {
  getTasks(query?: { q?: string; scope?: 'mine' | 'team' }): Promise<{ tasks: TaskWithMeta[]; currentWeek?: string; today?: string }>;
  getGroups(): Promise<{ groups: Group[]; assignableGroupIds: string[] }>;
  createGroup(req: CreateGroupRequest): Promise<GroupResponse>;
  renameGroup(id: string, req: RenameGroupRequest): Promise<GroupResponse>;
  deleteGroup(id: string): Promise<GroupResponse>;
  selfReportTask(weekKey: string, req: SelfReportTaskRequest): Promise<CreateTaskResponse>;
  editSelfTask(taskId: string, req: UpdateSelfTaskRequest): Promise<CreateTaskResponse>;
  linkTaskWeek(taskId: string, weekKey: string): Promise<CreateTaskResponse>;
  scheduleTask(taskId: string, req: ScheduleTaskRequest): Promise<CreateTaskResponse>;
  createTask(req: CreateTaskRequest): Promise<CreateTaskResponse>;
  updateTaskStatus(taskId: string, status: TaskStatus, expectedRevision?: number): Promise<TransitionTaskStatusResponse>;
  claimTask(taskId: string, req: ClaimTaskRequest): Promise<ClaimTaskResponse>;
  completeTask(taskId: string, req: CompleteTaskRequest): Promise<CompleteTaskResponse>;
  reviewTask(taskId: string, req: ReviewTaskRequest): Promise<ReviewTaskResponse>;
}
export function createPmSegment(ctx: HttpContext): PmSegment {
  const { baseUrl, fetcher, writeToken } = ctx;
  return {
    async getTasks(query) {
      const params = new URLSearchParams();
      if (query?.q?.trim()) params.set('q', query.q.trim());
      if (query?.scope) params.set('scope', query.scope);
      const suffix = params.size ? `?${params}` : '';
      return fetchJson(`${baseUrl}/api/tasks${suffix}`, TasksResponseSchema, fetcher);
    },
    async getGroups() { return fetchJson(`${baseUrl}/api/groups`, GroupsResponseSchema, fetcher); },
    async createGroup(req) { return postJson(`${baseUrl}/api/groups`, req, GroupResponseSchema, fetcher, writeToken); },
    async renameGroup(id, req) { return sendJson('PUT', `${baseUrl}/api/groups/${encodeURIComponent(id)}`, req, GroupResponseSchema, fetcher, writeToken); },
    async deleteGroup(id) { return sendJson('DELETE', `${baseUrl}/api/groups/${encodeURIComponent(id)}`, undefined, GroupResponseSchema, fetcher, writeToken); },
    async selfReportTask(weekKey, req) { return postJson(`${baseUrl}/api/weeks/${encodeURIComponent(weekKey)}/tasks`, req, CreateTaskResponseSchema, fetcher, writeToken); },
    async editSelfTask(taskId, req) { return postJson(`${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/edit`, req, CreateTaskResponseSchema, fetcher, writeToken); },
    async linkTaskWeek(taskId, weekKey) { return postJson(`${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/weeks`, { weekKey }, CreateTaskResponseSchema, fetcher, writeToken); },
    async scheduleTask(taskId, req) { return postJson(`${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/schedule`, req, CreateTaskResponseSchema, fetcher, writeToken); },
    async createTask(req) { return postJson(`${baseUrl}/api/tasks`, req, CreateTaskResponseSchema, fetcher, writeToken); },
    async updateTaskStatus(taskId, status, expectedRevision) {
      return postJson(`${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/status`, { status, expectedRevision }, TransitionTaskStatusResponseSchema, fetcher, writeToken);
    },
    async claimTask(taskId, req) { return postJson(`${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/claim`, req, ClaimTaskResponseSchema, fetcher, writeToken); },
    async completeTask(taskId, req) { return postJson(`${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/complete`, req, CompleteTaskResponseSchema, fetcher, writeToken); },
    async reviewTask(taskId, req) { return postJson(`${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/review`, req, ReviewTaskResponseSchema, fetcher, writeToken); },
  };
}
