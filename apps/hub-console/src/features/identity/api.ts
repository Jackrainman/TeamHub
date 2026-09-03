import {
  ClearPinResponseSchema,
  MembersResponseSchema,
  RosterImportReportSchema,
  RosterPreviewResponseSchema,
  SessionResponseSchema,
  SetGateReviewerResponseSchema,
  SetMemberRoleResponseSchema,
  SetProjectManagerResponseSchema,
  SetupSuperAdminResponseSchema,
  type ClearPinResponse,
  type MemberPublic,
  type RosterImportReport,
  type RosterImportRow,
  type RosterPreviewResponse,
  SetPinResponseSchema,
  type SessionRequest,
  type SessionResponse,
  type SetPinRequest,
  type SetPinResponse,
  type SetGateReviewerRequest,
  type SetGateReviewerResponse,
  type SetMemberRoleRequest,
  type SetMemberRoleResponse,
  type SetProjectManagerRequest,
  type SetProjectManagerResponse,
  type SetupSuperAdminRequest,
  type SetupSuperAdminResponse,
} from '@teamhub/hub-contracts';
import type { HttpContext } from '../../api/http';
import { fetchJson, postFormData, postJson, sendJson } from '../../api/http';

/**
 * 身份与名册域 API 分段（ARCH-UNIFY A4；前身 api/segments/members.ts 的成员/会话/名册半）。
 * 端点对照 server modules/pm/members.ts + roster.ts + modules/system/session.ts。
 */
export interface IdentitySegment {
  getMembers(): Promise<{ members: MemberPublic[] }>;
  getSession(): Promise<SessionResponse>;
  login(req: SessionRequest): Promise<SessionResponse>;
  logout(): Promise<SessionResponse>;
  setMemberPin(id: string, req: SetPinRequest): Promise<SetPinResponse>;
  setMemberGateReviewer(id: string, req: SetGateReviewerRequest): Promise<SetGateReviewerResponse>;
  setMemberRole(id: string, req: SetMemberRoleRequest): Promise<SetMemberRoleResponse>;
  setMemberProjectManager(id: string, req: SetProjectManagerRequest): Promise<SetProjectManagerResponse>;
  setupSuperAdmin(req: SetupSuperAdminRequest): Promise<SetupSuperAdminResponse>;
  clearMemberPin(id: string): Promise<ClearPinResponse>;
  rosterTemplateUrl(): string;
  importRoster(file: File): Promise<RosterImportReport>;
  previewRoster(file: File): Promise<RosterPreviewResponse>;
  importRosterRows(rows: RosterImportRow[]): Promise<RosterImportReport>;
}

export function createIdentitySegment(ctx: HttpContext): IdentitySegment {
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
    async setMemberPin(id: string, req: SetPinRequest) {
      return sendJson('PUT', `${baseUrl}/api/members/${encodeURIComponent(id)}/pin`, req, SetPinResponseSchema, fetcher, writeToken);
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
  };
}
