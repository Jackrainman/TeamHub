import { GATE_REVIEWER_DEFAULT_GRADES, GroupSchema, MemberSchema } from '@teamhub/hub-contracts';
import type { Group, Member, MemberRole, RosterImportRow } from '@teamhub/hub-contracts';
import type { SqliteDatabase } from '../../store/sqlite-db.js';
import type { GroupResult, MemberResult, RosterImportOutcome, SettingsRepository } from './repository.js';

function nextId(db: SqliteDatabase, table: string, prefix: string): string {
  return `${prefix}-${db.maxSuffix(table, prefix) + 1}`;
}
export class SqliteSettingsRepository implements SettingsRepository {
  constructor(private readonly db: SqliteDatabase) {}
  listGroups(): Group[] { return this.db.allRows<Group>('groups').map((row) => GroupSchema.parse(row)); }
  listMembers(): Member[] { return this.db.allRows<Member>('members').map((row) => MemberSchema.parse(row)); }
  getMember(id: string): Member | undefined {
    const row = this.db.getRow<Member>('members', id);
    return row ? MemberSchema.parse(row) : undefined;
  }
  private saveGroup(group: Group): Group {
    const parsed = GroupSchema.parse(group);
    this.db.updateRow('groups', parsed.id, parsed);
    return parsed;
  }
  private saveMember(member: Member): Member {
    const parsed = MemberSchema.parse(member);
    this.db.updateRow('members', parsed.id, parsed);
    return parsed;
  }
  createGroup(name: string): GroupResult {
    return this.db.tx(() => {
      if (this.listGroups().some((group) => group.name === name)) return { ok: false as const, reason: 'name-exists' as const };
      const group = GroupSchema.parse({ id: nextId(this.db, 'groups', 'grp-v1'), name, kind: 'custom' });
      this.db.insertRow('groups', group.id, group);
      return { ok: true as const, group };
    });
  }
  renameGroup(id: string, name: string): GroupResult {
    return this.db.tx(() => {
      const group = this.db.getRow<Group>('groups', id);
      if (!group) return { ok: false as const, reason: 'not-found' as const };
      if (this.listGroups().some((item) => item.id !== id && item.name === name)) return { ok: false as const, reason: 'name-exists' as const };
      return { ok: true as const, group: this.saveGroup({ ...GroupSchema.parse(group), name }) };
    });
  }
  deleteGroup(id: string): GroupResult {
    return this.db.tx(() => {
      const group = this.db.getRow<Group>('groups', id);
      if (!group) return { ok: false as const, reason: 'not-found' as const };
      if (this.listMembers().some((member) => member.groupId === id)) return { ok: false as const, reason: 'has-members' as const };
      if (this.db.rowCount('tasks') > 0 && this.db.allRows<{ groupId: string }>('tasks').some((task) => task.groupId === id)) {
        return { ok: false as const, reason: 'has-tasks' as const };
      }
      this.db.deleteRow('groups', id);
      return { ok: true as const, group: GroupSchema.parse(group) };
    });
  }
  setMemberRole(id: string, role: MemberRole): Member | undefined {
    return this.db.tx(() => {
      const member = this.getMember(id);
      return member ? this.saveMember({ ...member, role, updatedBy: 'console', updatedAt: new Date().toISOString() }) : undefined;
    });
  }
  setGateReviewer(id: string, value: boolean): Member | undefined {
    return this.db.tx(() => {
      const member = this.getMember(id);
      return member ? this.saveMember({ ...member, gateReviewer: value, updatedBy: 'console', updatedAt: new Date().toISOString() }) : undefined;
    });
  }
  setProjectManager(id: string, value: boolean): MemberResult {
    return this.db.tx(() => {
      const member = this.getMember(id);
      if (!member) return { ok: false as const, reason: 'not-found' as const };
      if (!value && member.projectManager && this.listMembers().filter((item) => item.projectManager).length <= 1) {
        return { ok: false as const, reason: 'last-project-manager' as const };
      }
      return { ok: true as const, member: this.saveMember({ ...member, projectManager: value, updatedBy: 'console', updatedAt: new Date().toISOString() }) };
    });
  }
  setMemberPin(id: string, pinHash: string | null): Member | undefined {
    return this.db.tx(() => {
      const member = this.getMember(id);
      if (!member) return undefined;
      const next = { ...member, updatedBy: 'console', updatedAt: new Date().toISOString() };
      if (pinHash === null) delete next.pinHash;
      else next.pinHash = pinHash;
      return this.saveMember(next);
    });
  }
  importRoster(rows: readonly RosterImportRow[]): RosterImportOutcome {
    return this.db.tx(() => {
      const result: RosterImportOutcome = { created: [], updated: [], failed: [], missingFromSheet: [], createdGroups: [], autoReviewers: [] };
      const seen = new Set(rows.map((row) => row.displayName));
      result.missingFromSheet = this.listMembers().filter((member) => !seen.has(member.displayName)).map((member) => member.displayName);
      for (const row of rows) {
        let group = this.listGroups().find((item) => item.name === row.groupName);
        if (!group) {
          const created = this.createGroup(row.groupName);
          if (!created.ok) { result.failed.push({ line: row.line ?? 0, reason: '组名冲突' }); continue; }
          group = created.group;
          result.createdGroups.push(group.name);
        }
        const existing = this.listMembers().find((member) => member.displayName === row.displayName);
        if (existing) {
          this.saveMember({ ...existing, grade: row.grade, groupId: group.id, gateReviewer: row.gateReviewer,
            updatedBy: 'console', updatedAt: new Date().toISOString() });
          result.updated.push(existing.displayName);
        } else {
          const member = MemberSchema.parse({
            id: nextId(this.db, 'members', 'member-v1'), displayName: row.displayName, role: 'member',
            grade: row.grade, groupId: group.id, status: 'idle', currentTaskId: null,
            updatedBy: 'console', updatedAt: new Date().toISOString(), gateReviewer: row.gateReviewer,
          });
          this.db.insertRow('members', member.id, member);
          result.created.push(member.displayName);
        }
        if (row.gateReviewerAuto) result.autoReviewers.push(row.displayName);
      }
      return result;
    });
  }
  bootstrapAdministrator(input: {
    displayName: string; groupName?: string; asGroupLead?: boolean; grade?: Member['grade'];
    pinHash: string; currentMemberId?: string;
  }): Member {
    return this.db.tx(() => {
      if (this.listMembers().some((member) => member.projectManager)) throw new Error('administrator already exists');
      let member = input.currentMemberId ? this.getMember(input.currentMemberId) : this.listMembers().find((item) => item.displayName === input.displayName);
      if (!member) {
        if (!input.groupName) throw new Error('groupName required');
        let group = this.listGroups().find((item) => item.name === input.groupName);
        if (!group) {
          const created = this.createGroup(input.groupName);
          if (!created.ok) throw new Error('groupName conflict');
          group = created.group;
        }
        const grade = input.grade ?? 'freshman';
        member = MemberSchema.parse({
          id: nextId(this.db, 'members', 'member-v1'), displayName: input.displayName,
          role: input.asGroupLead ? 'groupAdmin' : 'member', grade, groupId: group.id,
          status: 'idle', currentTaskId: null, updatedBy: 'console', updatedAt: new Date().toISOString(),
          gateReviewer: GATE_REVIEWER_DEFAULT_GRADES.has(grade),
        });
        this.db.insertRow('members', member.id, member);
      }
      return this.saveMember({ ...member, projectManager: true, pinHash: input.pinHash,
        role: input.asGroupLead ? 'groupAdmin' : member.role, updatedBy: 'console', updatedAt: new Date().toISOString() });
    });
  }
}
