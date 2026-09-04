import type {
  ActorRef,
  Dependency,
  Group,
  KnowledgeNode,
  Member,
  Need,
  Season,
  Task,
  TaskStatus,
} from '@teamhub/hub-contracts';
import { deriveLeafGroups } from '@teamhub/hub-contracts';
import {
  DEPENDENCY_INITIAL_STATUS,
  DEPENDENCY_WAIVED_STATUS,
  MANUAL_TASK_STATUS_SOURCE,
  MEMBER_GATE_REVIEWER_UPDATED_BY,
  MEMBER_PIN_UPDATED_BY,
  MEMBER_ROLE_UPDATED_BY,
  MEMBER_ROSTER_UPDATED_BY,
  NEED_INITIAL_STATUS,
  ROSTER_IMPORT_GROUP_KIND,
  ROSTER_IMPORT_MEMBER_STATUS,
  TASK_DEFAULT_STATUS,
  TASK_DEFAULT_STATUS_SOURCE,
} from '../../store/clamp-defaults.js';
import { memberHasPmFlag } from '../../authz.js';
import type {
  DependencyDraft,
  KnowledgeNodeDraft,
  NeedDraft,
  SeasonDraft,
  TaskDraft,
} from './repository.js';

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

export function buildClaimedTask(
  prev: Task,
  ownerId: string,
  claimedAt: string,
  claimer?: ActorRef,
): Task | null {
  if (prev.ownerId !== null) return null;
  const promoting = prev.status === 'pending';
  return {
    ...prev,
    ownerId,
    claimedAt,
    status: promoting ? 'inProgress' : prev.status,
    statusSource: promoting ? MANUAL_TASK_STATUS_SOURCE : prev.statusSource,
    updatedAt: claimedAt,
    ...(promoting
      ? {
          transitions: [
            ...(prev.transitions ?? []),
            { from: prev.status ?? null, to: 'inProgress' as const, at: claimedAt, ...(claimer ? { by: claimer } : {}) },
          ],
        }
      : {}),
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
  return {
    ...rest,
    status: 'done',
    statusSource: MANUAL_TASK_STATUS_SOURCE,
    completedBy,
    updatedAt: at,
    transitions: [
      ...(prev.transitions ?? []),
      { from: prev.status ?? null, to: 'done' as const, at, by: completedBy },
    ],
  };
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
    ...(rejecting
      ? {
          transitions: [
            ...(prev.transitions ?? []),
            { from: prev.status ?? null, to: 'inProgress' as const, at, by: reviewedBy },
          ],
        }
      : {}),
  };
}

// ── create 族对象构造（STORE-GOV-BASE：领域构造规则单源）────────────────────────────
// 纯对象构造（补 id/时间戳 + clamp 初始态 + 派生默认），不含任何持久化语义——push/splice vs insertRow
// 仍由各 store 自持。id 由调用方经 nextSequentialId 生成后传入（序列起点各实现自管）。

export function buildCreatedTask(draft: TaskDraft, id: string, now: string): Task {
  return {
    ...draft,
    id,
    status: draft.status ?? TASK_DEFAULT_STATUS,
    statusSource: draft.statusSource ?? TASK_DEFAULT_STATUS_SOURCE,
    lastProgressAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildCreatedDependency(draft: DependencyDraft, id: string, now: string): Dependency {
  return { ...draft, id, status: DEPENDENCY_INITIAL_STATUS, createdAt: now, updatedAt: now };
}

export function buildCreatedNeed(draft: NeedDraft, id: string, now: string): Need {
  return {
    ...draft,
    id,
    status: NEED_INITIAL_STATUS,
    claimedByMemberId: null,
    openedAt: now,
    escalatedAt: null,
  };
}

/** 结案知识节点新建分支（按 name upsert 的「未命中」支；命中支保留旧 id、只刷内容/时间戳，见各 store）。 */
export function buildCreatedKbNode(draft: KnowledgeNodeDraft, id: string, now: string): KnowledgeNode {
  return { ...draft, id, createdAt: now };
}

export function buildCreatedSeason(draft: SeasonDraft, id: string): Season {
  return { ...draft, id, status: 'active' };
}

// ── 就地更新族对象构造（STORE-GOV-BASE phase2：member/resource/dep/task 受限写）─────────────────
// 同样是纯对象构造（读-判后的「写什么」），findIndex/getRow + 落盘仍由各 store 自持。

/**
 * 设/改成员 PIN（IDENTITY-LITE）的就地更新对象。**安全敏感，三实现单源**：
 * `pinHash === null` = 清除（删 pinHash，成员回未设密码态 → 首登强制重设）；否则写 pinHash。
 * 密钥纪律（AUTH-GATE）：只存 scrypt 散列，绝不回存明文（刀⑧②明文副本例外 2026-09-04 用户拍板撤销）；
 * pinHash 只落内存/落盘，读视图剥离（路由回 MemberPublicSchema）。
 */
export function applyMemberPin(
  prev: Member,
  pinHash: string | null,
  now: string,
): Member {
  const updated: Member = { ...prev, updatedBy: MEMBER_PIN_UPDATED_BY, updatedAt: now };
  // AUTH-GATE（撤销刀⑧②明文副本例外）：任何 PIN 写路径都顺手剥掉旧落盘里可能残留的 pinPlaintext。
  delete (updated as Record<string, unknown>).pinPlaintext;
  if (pinHash === null) {
    delete updated.pinHash;
  } else {
    updated.pinHash = pinHash;
  }
  return updated;
}

export function applyMemberGateReviewer(prev: Member, gateReviewer: boolean, now: string): Member {
  return { ...prev, gateReviewer, updatedBy: MEMBER_GATE_REVIEWER_UPDATED_BY, updatedAt: now };
}

export function applyMemberRole(prev: Member, role: Member['role'], now: string): Member {
  return { ...prev, role, updatedBy: MEMBER_ROLE_UPDATED_BY, updatedAt: now };
}

/** 软删除依赖边：转 status=waived，保留 confirmedBy/createdAt（G2 可审计）。 */
export function applyDependencyWaive(prev: Dependency, now: string): Dependency {
  return { ...prev, status: DEPENDENCY_WAIVED_STATUS, updatedAt: now };
}

/** 任务状态流转：受限状态机迁移，statusSource 钉 console + 追加一条 transition（lastProgressAt 不动）。 */
export function applyTaskStatusTransition(
  prev: Task,
  status: TaskStatus,
  now: string,
  by?: ActorRef,
): Task {
  const transition = { from: prev.status ?? null, to: status, at: now, ...(by ? { by } : {}) };
  return {
    ...prev,
    status,
    statusSource: MANUAL_TASK_STATUS_SOURCE,
    updatedAt: now,
    transitions: [...(prev.transitions ?? []), transition],
  };
}

// ── 名册导入成员对象构造（STORE-GOV-BASE phase2：importRoster 内部，role/pinHash/PM 旗标永不动）──

/** 名册导入新建成员：role 恒 'member'（刀③ 导入不写 role——组长走导入后确认页）。 */
export function buildRosterMemberCreate(
  row: { displayName: string; grade: Member['grade']; gateReviewer: boolean },
  groupId: string,
  id: string,
  now: string,
): Member {
  return {
    id,
    displayName: row.displayName,
    role: 'member',
    grade: row.grade,
    groupId,
    status: ROSTER_IMPORT_MEMBER_STATUS,
    currentTaskId: null,
    updatedBy: MEMBER_ROSTER_UPDATED_BY,
    updatedAt: now,
    gateReviewer: row.gateReviewer,
  };
}

/** 名册导入更新成员：`...prev` 保留 role / pinHash / projectManager 旗标（重导幂等不洗已任命组长）。 */
export function buildRosterMemberUpdate(
  prev: Member,
  row: { grade: Member['grade']; gateReviewer: boolean },
  groupId: string,
  now: string,
): Member {
  return {
    ...prev,
    grade: row.grade,
    groupId,
    gateReviewer: row.gateReviewer,
    updatedBy: MEMBER_ROSTER_UPDATED_BY,
    updatedAt: now,
  };
}

/** 自动建组 / 新建叶子组共用：parentGroupId=null + kind 默认 + 指定赛季。 */
export function buildCreatedGroup(name: string, seasonId: string, id: string): Group {
  return { id, seasonId, parentGroupId: null, name, kind: ROSTER_IMPORT_GROUP_KIND };
}
