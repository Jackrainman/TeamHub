import {
  MembersResponseSchema,
  SessionResponseSchema,
  BaselineResponseSchema,
  UpdateBaselineResponseSchema,
  ChecklistItemsResponseSchema,
  CreateChecklistItemResponseSchema,
  ClearChecklistItemResponseSchema,
  WaiveChecklistItemResponseSchema,
  SetGateReviewerResponseSchema,
  SetMemberRoleResponseSchema,
  SetProjectManagerResponseSchema,
  ClearPinResponseSchema,
  MemberPinResponseSchema,
  SetupSuperAdminResponseSchema,
  SetupStateResponseSchema,
  SetupInitResponseSchema,
  SetupConfigResponseSchema,
  SetupGraduateResponseSchema,
  RosterImportReportSchema,
  RosterPreviewResponseSchema,
  LarkConfigResponseSchema,
  LarkConfigSaveResponseSchema,
  LarkChatsResponseSchema,
  LarkCreateChatResponseSchema,
  type MemberPublic,
  type SessionRequest,
  type SessionResponse,
  type BaselineResponse,
  type UpdateBaselineRequest,
  type UpdateBaselineResponse,
  type ChecklistItemsResponse,
  type CreateChecklistItemRequest,
  type CreateChecklistItemResponse,
  type ClearChecklistItemRequest,
  type ClearChecklistItemResponse,
  type WaiveChecklistItemRequest,
  type WaiveChecklistItemResponse,
  type SetGateReviewerRequest,
  type SetGateReviewerResponse,
  type SetMemberRoleRequest,
  type SetMemberRoleResponse,
  type SetProjectManagerRequest,
  type SetProjectManagerResponse,
  type ClearPinResponse,
  type MemberPinResponse,
  type SetupSuperAdminRequest,
  type SetupSuperAdminResponse,
  type SetupStateResponse,
  type SetupInitRequest,
  type SetupInitResponse,
  type SetupConfigRequest,
  type SetupConfigResponse,
  type SetupGraduateResponse,
  type RosterImportReport,
  type RosterImportRow,
  type RosterPreviewResponse,
  type LarkConfigResponse,
  type LarkConfigSaveRequest,
  type LarkConfigSaveResponse,
  type LarkChatsResponse,
  type LarkCreateChatRequest,
  type LarkCreateChatResponse,
} from '@teamhub/hub-contracts';
import { z } from 'zod';
import type { HttpContext } from '../http';
import { fetchJson, postJson, postFormData, sendJson } from '../http';

export interface MembersSegment {
  getMembers(): Promise<{ members: MemberPublic[] }>;
  getSession(): Promise<SessionResponse>;
  login(req: SessionRequest): Promise<SessionResponse>;
  logout(): Promise<SessionResponse>;
  setMemberGateReviewer(id: string, req: SetGateReviewerRequest): Promise<SetGateReviewerResponse>;
  setMemberRole(id: string, req: SetMemberRoleRequest): Promise<SetMemberRoleResponse>;
  setMemberProjectManager(id: string, req: SetProjectManagerRequest): Promise<SetProjectManagerResponse>;
  setupSuperAdmin(req: SetupSuperAdminRequest): Promise<SetupSuperAdminResponse>;
  clearMemberPin(id: string): Promise<ClearPinResponse>;
  getMemberPin(id: string): Promise<MemberPinResponse>;
  rosterTemplateUrl(): string;
  importRoster(file: File): Promise<RosterImportReport>;
  previewRoster(file: File): Promise<RosterPreviewResponse>;
  importRosterRows(rows: RosterImportRow[]): Promise<RosterImportReport>;
  getBaseline(seasonId: string): Promise<BaselineResponse>;
  updateBaseline(seasonId: string, req: UpdateBaselineRequest): Promise<UpdateBaselineResponse>;
  getChecklist(seasonId: string): Promise<ChecklistItemsResponse>;
  createChecklistItem(seasonId: string, req: CreateChecklistItemRequest): Promise<CreateChecklistItemResponse>;
  clearChecklistItem(id: string, seasonId: string, req: ClearChecklistItemRequest): Promise<ClearChecklistItemResponse>;
  waiveChecklistItem(id: string, seasonId: string, req: WaiveChecklistItemRequest): Promise<WaiveChecklistItemResponse>;
  getSetupState(): Promise<SetupStateResponse>;
  initSetup(req: SetupInitRequest): Promise<SetupInitResponse>;
  setConfig(req: SetupConfigRequest): Promise<SetupConfigResponse>;
  graduate(): Promise<SetupGraduateResponse>;
  getLarkConfig(): Promise<LarkConfigResponse>;
  saveLarkConfig(req: LarkConfigSaveRequest): Promise<LarkConfigSaveResponse>;
  resetLarkConfig(): Promise<{ ok: boolean }>;
  getLarkChats(): Promise<LarkChatsResponse>;
  createLarkChat(req: LarkCreateChatRequest): Promise<LarkCreateChatResponse>;
}

export function createMembersSegment(ctx: HttpContext): MembersSegment {
  const { baseUrl, fetcher, writeToken } = ctx;
  return {
    async getMembers() {
      return fetchJson(`${baseUrl}/api/members`, MembersResponseSchema, fetcher);
    },
    async getSession() {
      return fetchJson(`${baseUrl}/api/session`, SessionResponseSchema, fetcher);
    },
    async login(req: SessionRequest) {
      return postJson(`${baseUrl}/api/session`, req, SessionResponseSchema, fetcher, writeToken);
    },
    async logout() {
      return sendJson('DELETE', `${baseUrl}/api/session`, undefined, SessionResponseSchema, fetcher, writeToken);
    },
    async setMemberGateReviewer(id: string, req: SetGateReviewerRequest) {
      return sendJson('PUT', `${baseUrl}/api/members/${encodeURIComponent(id)}/gate-reviewer`, req, SetGateReviewerResponseSchema, fetcher, writeToken);
    },
    async setMemberRole(id: string, req: SetMemberRoleRequest) {
      return sendJson('PUT', `${baseUrl}/api/members/${encodeURIComponent(id)}/role`, req, SetMemberRoleResponseSchema, fetcher, writeToken);
    },
    async setMemberProjectManager(id: string, req: SetProjectManagerRequest) {
      return sendJson('PUT', `${baseUrl}/api/members/${encodeURIComponent(id)}/project-manager`, req, SetProjectManagerResponseSchema, fetcher, writeToken);
    },
    async setupSuperAdmin(req: SetupSuperAdminRequest) {
      return postJson(`${baseUrl}/api/setup/super-admin`, req, SetupSuperAdminResponseSchema, fetcher, writeToken);
    },
    async clearMemberPin(id: string) {
      return sendJson('DELETE', `${baseUrl}/api/members/${encodeURIComponent(id)}/pin`, undefined, ClearPinResponseSchema, fetcher, writeToken);
    },
    async getMemberPin(id: string) {
      return fetchJson(`${baseUrl}/api/members/${encodeURIComponent(id)}/pin`, MemberPinResponseSchema, fetcher);
    },
    rosterTemplateUrl() {
      return `${baseUrl}/api/roster/template`;
    },
    async importRoster(file: File) {
      return postFormData(`${baseUrl}/api/roster/import`, file, RosterImportReportSchema, fetcher, writeToken);
    },
    async previewRoster(file: File) {
      return postFormData(`${baseUrl}/api/roster/preview`, file, RosterPreviewResponseSchema, fetcher, writeToken);
    },
    async importRosterRows(rows: RosterImportRow[]) {
      return postJson(`${baseUrl}/api/roster/import`, { rows }, RosterImportReportSchema, fetcher, writeToken);
    },
    async getBaseline(seasonId: string) {
      return fetchJson(`${baseUrl}/api/baseline?seasonId=${encodeURIComponent(seasonId)}`, BaselineResponseSchema, fetcher);
    },
    async updateBaseline(seasonId: string, req: UpdateBaselineRequest) {
      return sendJson('PATCH', `${baseUrl}/api/baseline?seasonId=${encodeURIComponent(seasonId)}`, req, UpdateBaselineResponseSchema, fetcher, writeToken);
    },
    async getChecklist(seasonId: string) {
      return fetchJson(`${baseUrl}/api/checklist?seasonId=${encodeURIComponent(seasonId)}`, ChecklistItemsResponseSchema, fetcher);
    },
    async createChecklistItem(seasonId: string, req: CreateChecklistItemRequest) {
      return postJson(`${baseUrl}/api/checklist?seasonId=${encodeURIComponent(seasonId)}`, req, CreateChecklistItemResponseSchema, fetcher, writeToken);
    },
    async clearChecklistItem(id: string, seasonId: string, req: ClearChecklistItemRequest) {
      return postJson(
        `${baseUrl}/api/checklist/${encodeURIComponent(id)}/clear?seasonId=${encodeURIComponent(seasonId)}`,
        req,
        ClearChecklistItemResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async waiveChecklistItem(id: string, seasonId: string, req: WaiveChecklistItemRequest) {
      return postJson(
        `${baseUrl}/api/checklist/${encodeURIComponent(id)}/waive?seasonId=${encodeURIComponent(seasonId)}`,
        req,
        WaiveChecklistItemResponseSchema,
        fetcher,
        writeToken,
      );
    },
    async getSetupState() {
      return fetchJson(`${baseUrl}/api/setup/state`, SetupStateResponseSchema, fetcher);
    },
    async initSetup(req: SetupInitRequest) {
      return postJson(`${baseUrl}/api/setup/init`, req, SetupInitResponseSchema, fetcher, writeToken);
    },
    async setConfig(req: SetupConfigRequest) {
      return sendJson('PUT', `${baseUrl}/api/setup/config`, req, SetupConfigResponseSchema, fetcher, writeToken);
    },
    async graduate() {
      return sendJson('POST', `${baseUrl}/api/setup/graduate`, undefined, SetupGraduateResponseSchema, fetcher, writeToken);
    },
    async getLarkConfig() {
      return fetchJson(`${baseUrl}/api/integrations/lark`, LarkConfigResponseSchema, fetcher);
    },
    async saveLarkConfig(req: LarkConfigSaveRequest) {
      return sendJson('PUT', `${baseUrl}/api/integrations/lark`, req, LarkConfigSaveResponseSchema, fetcher, writeToken);
    },
    async resetLarkConfig() {
      return sendJson('DELETE', `${baseUrl}/api/integrations/lark`, undefined, z.object({ ok: z.boolean() }), fetcher, writeToken);
    },
    async getLarkChats() {
      return fetchJson(`${baseUrl}/api/integrations/lark/chats`, LarkChatsResponseSchema, fetcher);
    },
    async createLarkChat(req: LarkCreateChatRequest) {
      return postJson(`${baseUrl}/api/integrations/lark/chats`, req, LarkCreateChatResponseSchema, fetcher, writeToken);
    },
  };
}
