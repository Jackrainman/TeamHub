import type { ActorRef, Group, Member, Season, Task } from '@teamhub/hub-contracts';
import { deriveLeafGroups } from '@teamhub/hub-contracts';
import { MANUAL_TASK_STATUS_SOURCE, MEMBER_ROLE_UPDATED_BY } from './clamp-defaults.js';
import { memberHasPmFlag } from '../authz.js';

export function resolveActiveSeasonId(seasons: readonly Season[], fallback: string): string {
  return seasons.find((s) => s.status === 'active')?.id ?? fallback;
}

export function computeAbstractGroupIds(groups: readonly Group[]): Set<string> {
  const leafIds = new Set(deriveLeafGroups([...groups]));
  return new Set(groups.filter((g) => !leafIds.has(g.id)).map((g) => g.id));
}

export type RenameGuardFailure = { ok: false; reason: 'not-found' | 'not-leaf' | 'name-exists' };
export type DeleteGuardFailure = { ok: false; reason: 'not-found' | 'not-leaf' | 'has-children' | 'has-members' | 'has-tasks' };

export function validateGroupRename(
  groupId: string,
  newName: string,
  groups: readonly Group[],
): RenameGuardFailure | null {
  if (!groups.some((g) => g.id === groupId)) return { ok: false, reason: 'not-found' };
  if (!deriveLeafGroups([...groups]).includes(groupId)) return { ok: false, reason: 'not-leaf' };
  if (groups.some((g) => g.id !== groupId && g.name === newName)) return { ok: false, reason: 'name-exists' };
  return null;
}

export function validateGroupDeletion(
  groupId: string,
  groups: readonly Group[],
  members: readonly Member[],
  tasks: readonly Task[],
): DeleteGuardFailure | null {
  if (!groups.some((g) => g.id === groupId)) return { ok: false, reason: 'not-found' };
  if (!deriveLeafGroups([...groups]).includes(groupId)) return { ok: false, reason: 'not-leaf' };
  if (groups.some((g) => g.parentGroupId === groupId)) return { ok: false, reason: 'has-children' };
  if (members.some((m) => m.groupId === groupId)) return { ok: false, reason: 'has-members' };
  if (tasks.some((t) => t.groupId === groupId)) return { ok: false, reason: 'has-tasks' };
  return null;
}

export function validateLastProjectManagerGuard(
  prev: Member,
  projectManager: boolean,
  allMembers: readonly Member[],
  guard: boolean | undefined,
): 'last-projectmanager' | null {
  if (
    guard &&
    memberHasPmFlag(prev) &&
    !projectManager &&
    allMembers.filter((m) => memberHasPmFlag(m)).length <= 1
  ) {
    return 'last-projectmanager';
  }
  return null;
}

export function buildProjectManagerUpdate(prev: Member, projectManager: boolean, now: string): Member {
  return { ...prev, projectManager, updatedBy: MEMBER_ROLE_UPDATED_BY, updatedAt: now };
}

export function buildClaimedTask(prev: Task, ownerId: string, claimedAt: string): Task | null {
  if (prev.ownerId !== null) return null;
  const promoting = prev.status === 'pending';
  return {
    ...prev,
    ownerId,
    claimedAt,
    status: promoting ? 'inProgress' : prev.status,
    statusSource: promoting ? MANUAL_TASK_STATUS_SOURCE : prev.statusSource,
    updatedAt: claimedAt,
  };
}

export function buildAssignedTask(
  prev: Task,
  ownerId: string,
  reason: string,
  assignedBy: ActorRef,
  at: string,
): Task {
  const { claimedAt: _c, partnerMemberId: _p, crossClaimConfirmedBy: _x, ...rest } = prev;
  return { ...rest, ownerId, assignReason: reason, assignedBy, updatedAt: at };
}

export function buildCompletedTask(prev: Task, completedBy: ActorRef, at: string): Task {
  const { reviewedBy: _r, reviewNote: _n, ...rest } = prev;
  return { ...rest, status: 'done', statusSource: MANUAL_TASK_STATUS_SOURCE, completedBy, updatedAt: at };
}

export function buildReviewedTask(
  prev: Task,
  reviewedBy: ActorRef,
  outcome: 'accept' | 'reject',
  note: string | undefined,
  at: string,
): Task {
  const { reviewNote: _prevNote, ...rest } = prev;
  const rejecting = outcome === 'reject';
  return {
    ...rest,
    status: rejecting ? 'inProgress' : rest.status,
    statusSource: rejecting ? MANUAL_TASK_STATUS_SOURCE : rest.statusSource,
    reviewedBy,
    ...(note !== undefined ? { reviewNote: note } : {}),
    updatedAt: at,
  };
}
