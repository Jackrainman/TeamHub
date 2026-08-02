import type {
  ActorRef,
  ArtifactRef,
  Dependency,
  Group,
  KnowledgeNode,
  Member,
  Need,
  RelayHandoff,
  ResourceSession,
  Season,
  SharedResource,
  Task,
  TaskStatus,
} from '@teamhub/hub-contracts';
import { deriveDisplayCode, deriveLeafGroups } from '@teamhub/hub-contracts';
import {
  ARTIFACT_SUBMITTED_VIA,
  DEPENDENCY_INITIAL_STATUS,
  DEPENDENCY_WAIVED_STATUS,
  MANUAL_TASK_STATUS_SOURCE,
  MEMBER_GATE_REVIEWER_UPDATED_BY,
  MEMBER_PIN_UPDATED_BY,
  MEMBER_ROLE_UPDATED_BY,
  MEMBER_ROSTER_UPDATED_BY,
  NEED_INITIAL_STATUS,
  RELAY_HANDOFF_SOURCE,
  RESOURCE_DEFAULT_STATUS,
  RESOURCE_SESSION_SOURCE,
  RESOURCE_STATUS_SOURCE,
  ROSTER_IMPORT_GROUP_KIND,
  ROSTER_IMPORT_MEMBER_STATUS,
  TASK_DEFAULT_STATUS,
  TASK_DEFAULT_STATUS_SOURCE,
} from './clamp-defaults.js';
import { memberHasPmFlag } from '../authz.js';
import type {
  ArtifactDraft,
  DependencyDraft,
  KnowledgeNodeDraft,
  NeedDraft,
  RelayHandoffDraft,
  ResourceDefaultPresetPatch,
  ResourceDraft,
  ResourceSessionDraft,
  ResourceSessionPatch,
  ResourceStatusPatch,
  SeasonDraft,
  TaskDraft,
} from './gov-store.js';

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

// ── create 族对象构造（STORE-GOV-BASE：自 mock/sqlite-gov-store 逐字抽出共享，三实现复用）──────────
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

export function buildCreatedArtifact(draft: ArtifactDraft, id: string, now: string): ArtifactRef {
  return { ...draft, id, submittedVia: ARTIFACT_SUBMITTED_VIA, createdAt: now };
}

/** 建车：displayCode 在 store 内派生（禁手写）——给了 season 才有，否则 undefined（读视图回退 name）。 */
export function buildCreatedResource(draft: ResourceDraft, id: string, now: string): SharedResource {
  const displayCode =
    draft.season !== undefined
      ? deriveDisplayCode(draft.season, draft.robotTarget, draft.version ?? 1)
      : undefined;
  return {
    ...draft,
    id,
    status: RESOURCE_DEFAULT_STATUS,
    statusReason: null,
    statusSource: RESOURCE_STATUS_SOURCE,
    displayCode,
    updatedAt: now,
  };
}

export function buildCreatedResourceSession(
  draft: ResourceSessionDraft,
  id: string,
  now: string,
): ResourceSession {
  return { ...draft, id, source: RESOURCE_SESSION_SOURCE, createdAt: now };
}

/** 批量原子创建：逐条补 id + 钉 source，**invitedMemberIds 恒强制清空 []**（I0 双保险，不信任 draft）。 */
export function buildCreatedResourceSessionsBatch(
  drafts: readonly ResourceSessionDraft[],
  nextId: () => string,
  now: string,
): ResourceSession[] {
  return drafts.map((draft) => ({
    ...draft,
    id: nextId(),
    source: RESOURCE_SESSION_SOURCE,
    invitedMemberIds: [],
    createdAt: now,
  }));
}

export function buildCreatedRelayHandoff(
  draft: RelayHandoffDraft,
  id: string,
  now: string,
): RelayHandoff {
  return { ...draft, id, source: RELAY_HANDOFF_SOURCE, createdAt: now };
}

export function buildCreatedSeason(draft: SeasonDraft, id: string): Season {
  return { ...draft, id, status: 'active' };
}

// ── 就地更新族对象构造（STORE-GOV-BASE phase2：member/resource/dep/task 受限写）─────────────────
// 同样是纯对象构造（读-判后的「写什么」），findIndex/getRow + 落盘仍由各 store 自持。

/**
 * 设/改成员 PIN（IDENTITY-LITE）的就地更新对象。**安全敏感，三实现单源**：
 * `pinHash === null` = 清除（删 pinHash + pinPlaintext，成员回免 PIN 态）；否则写 pinHash，
 * 明文副本 pinPlaintext 传了同笔落、未传则清旧副本（防 hash/明文错位）。updatedBy 钉 console。
 * 密钥纪律：pinHash/pinPlaintext 只落内存/落盘，读视图剥离（路由回 MemberPublicSchema）。
 */
export function applyMemberPin(
  prev: Member,
  pinHash: string | null,
  pinPlaintext: string | undefined,
  now: string,
): Member {
  const updated: Member = { ...prev, updatedBy: MEMBER_PIN_UPDATED_BY, updatedAt: now };
  if (pinHash === null) {
    delete updated.pinHash;
    delete updated.pinPlaintext;
  } else {
    updated.pinHash = pinHash;
    if (pinPlaintext !== undefined) {
      updated.pinPlaintext = pinPlaintext;
    } else {
      delete updated.pinPlaintext;
    }
  }
  return updated;
}

export function applyMemberGateReviewer(prev: Member, gateReviewer: boolean, now: string): Member {
  return { ...prev, gateReviewer, updatedBy: MEMBER_GATE_REVIEWER_UPDATED_BY, updatedAt: now };
}

export function applyMemberRole(prev: Member, role: Member['role'], now: string): Member {
  return { ...prev, role, updatedBy: MEMBER_ROLE_UPDATED_BY, updatedAt: now };
}

/** 车状态迁移：statusReason 未传（undefined）保留旧值、显式 null 清空、给值改写；statusSource 钉 console。 */
export function applyResourceStatus(
  prev: SharedResource,
  patch: ResourceStatusPatch,
  now: string,
): SharedResource {
  return {
    ...prev,
    status: patch.status,
    statusReason: patch.statusReason !== undefined ? patch.statusReason : prev.statusReason,
    statusSource: RESOURCE_STATUS_SOURCE,
    updatedAt: now,
  };
}

/** 车默认阵型整体写回：preset===null → 整条不含 defaultPreset 键（schema .optional() 非 .nullable()）。 */
export function applyResourceDefaultPreset(
  prev: SharedResource,
  preset: ResourceDefaultPresetPatch,
  now: string,
): SharedResource {
  if (preset === null) {
    const { defaultPreset: _drop, ...rest } = prev;
    return { ...rest, updatedAt: now };
  }
  return { ...prev, defaultPreset: preset, updatedAt: now };
}

/** 占用窗口受限编辑：只改 orderInWindow / eta（传了才改、eta 显式 null=清空）。 */
export function applyResourceSessionPatch(
  prev: ResourceSession,
  patch: ResourceSessionPatch,
): ResourceSession {
  return {
    ...prev,
    orderInWindow: patch.orderInWindow !== undefined ? patch.orderInWindow : prev.orderInWindow,
    eta: patch.eta !== undefined ? patch.eta : prev.eta,
  };
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
