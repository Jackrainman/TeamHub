import type { Group, Member, MemberRole, RosterImportFailure, RosterImportRow } from '@teamhub/hub-contracts';
import type { SystemTasksPort } from './public.js';

export interface RosterImportOutcome {
  created: string[]; updated: string[]; failed: RosterImportFailure[];
  missingFromSheet: string[]; createdGroups: string[]; autoReviewers: string[];
}
export type GroupResult = { ok: true; group: Group } | { ok: false; reason: 'not-found' | 'name-exists' | 'has-members' | 'has-tasks' };
export type MemberResult = { ok: true; member: Member } | { ok: false; reason: 'not-found' | 'last-project-manager' };
export interface SettingsRepository {
  listGroups(): Group[];
  listMembers(): Member[];
  getMember(id: string): Member | undefined;
  createGroup(name: string): GroupResult;
  renameGroup(id: string, name: string): GroupResult;
  deleteGroup(id: string, tasks: SystemTasksPort): GroupResult;
  setMemberRole(id: string, role: MemberRole): Member | undefined;
  setGateReviewer(id: string, value: boolean): Member | undefined;
  setProjectManager(id: string, value: boolean): MemberResult;
  setMemberPin(id: string, pinHash: string | null): Member | undefined;
  importRoster(rows: readonly RosterImportRow[]): RosterImportOutcome;
  bootstrapAdministrator(input: {
    displayName: string; groupName?: string; asGroupLead?: boolean; grade?: Member['grade'];
    pinHash: string; currentMemberId?: string;
  }): Member;
}
