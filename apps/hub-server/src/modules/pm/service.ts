import { getWeekKey, isCurrentWeek, canReviewWeekTask, taskAuthorId, resolveCompletedAt, type UpdateSelfTaskRequest } from '@teamhub/hub-contracts';
import type { SelfReportTaskRequest } from '@teamhub/hub-contracts';
import {
  CONVERGENCE_SCOPE_ALL_LEAF_GROUPS,
  CONVERGENCE_SENTINEL_GROUP_ID,
  deriveDirectionGaps,
  deriveLeafGroups,
  derivePreviousOwnerIds,
  isBigTask,
  toDepGraphView,
  wouldCreateCycle,
} from '@teamhub/hub-contracts';
import type {
  ActorRef,
  CreateDependencyRequest,
  Delivery,
  CreateNeedRequest,
  CreateProjectRequest,
  CreateSeasonRequest,
  CreateTaskRequest,
  Dependency,
  Group,
  Member,
  Need,
  Project,
  Season,
  Task,
  TaskStatus,
  TaskWithMeta,
  UpdateProjectRequest,
} from '@teamhub/hub-contracts';
import type { Clock } from '../../clock.js';
import { isGateReviewer } from '../../authz.js';
import { deriveProjectGroupIds } from './project-groups.js';
import type { PmRepository, UpdateProjectDraft } from './repository.js';

/** 用例结果：ok:false 带 HTTP 语义（status+detail），route 只负责映射，不再夹业务判断。 */
export type PmOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 403 | 404 | 409; detail: string; code?: 'DELIVERY_REQUIRED' };

const ok = <T>(value: T): PmOutcome<T> => ({ ok: true, value });
const fail = <T>(status: 400 | 403 | 404 | 409, detail: string, code?: 'DELIVERY_REQUIRED'): PmOutcome<T> => ({
  ok: false,
  status,
  detail,
  ...(code ? { code } : {}),
});

/**
 * pm 域 application service（ARCH-UNIFY A4；前身 routes/tasks.ts / tasks-claim.ts / members.ts 的
 * 路由内编排）。用例：组/赛季管理校验、任务创建（总联调哨兵组规则）、任务搜索 + isBig 投影、
 * 依赖成环校验、认领/指派/搭档/跨组确认/完成/验收的名册与权属校验。
 * 留名（sessionActor 注入）与 HTTP 映射留在 route；持久化与状态机迁移在 repository。
 */
export class PmService {
  constructor(
    private readonly repository: PmRepository,
    private readonly clock: Clock,
  ) {}

  // ── 组管理 ──

  async listGroups(): Promise<{ groups: Group[]; assignableGroupIds: string[] }> {
    const snapshot = await this.repository.getSnapshot();
    return { groups: snapshot.groups, assignableGroupIds: deriveLeafGroups(snapshot.groups) };
  }

  async createGroup(name: string): Promise<PmOutcome<Group>> {
    const result = await this.repository.createGroup({ name });
    if (!result.ok) return fail(409, `组「${name}」已存在`);
    return ok(result.group);
  }

  async renameGroup(id: string, name: string): Promise<PmOutcome<Group>> {
    const result = await this.repository.renameGroup(id, name);
    if (result.ok) return ok(result.group);
    if (result.reason === 'not-found') return fail(404, 'group not found');
    if (result.reason === 'not-leaf') return fail(409, '汇报视角组（含子组或是联调哨兵组）不可改名');
    return fail(409, `组「${name}」已存在`);
  }

  async deleteGroup(id: string): Promise<PmOutcome<Group>> {
    const result = await this.repository.deleteGroup(id);
    if (result.ok) return ok(result.group);
    if (result.reason === 'not-found') return fail(404, 'group not found');
    const detail =
      result.reason === 'not-leaf'
        ? '汇报视角组（含子组或是联调哨兵组）不可删除'
        : result.reason === 'has-children'
          ? '该组下有子组，不能删除'
          : result.reason === 'has-members'
            ? '该组下还有成员，先迁走成员再删'
            : '该组下还有任务，先迁走任务再删';
    return fail(409, detail);
  }

  // ── 赛季 ──

  async listSeasons(): Promise<Season[]> {
    return (await this.repository.getSnapshot()).seasons;
  }

  async createSeason(input: CreateSeasonRequest): Promise<PmOutcome<Season>> {
    const { name, startsAt, endsAt } = input;
    if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      return fail(400, 'endsAt must be after startsAt');
    }
    const snapshot = await this.repository.getSnapshot();
    if (snapshot.seasons.some((s) => s.name === name)) {
      return fail(400, `season name already exists: ${name}`);
    }
    return ok(await this.repository.createSeason({ name, startsAt, endsAt: endsAt ?? null }));
  }

  // ── 项目 ──

  async listProjects(): Promise<Project[]> {
    return this.repository.listProjects();
  }

  async createProject(input: CreateProjectRequest, creatorId?: string): Promise<PmOutcome<Project>> {
    const name = input.name.trim();
    const snapshot = await this.repository.getSnapshot();
    const groupIds = creatorId ? deriveProjectGroupIds([creatorId], snapshot.members) : [];
    const result = await this.repository.createProject({
      name,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      ...(input.seasonId ? { seasonId: input.seasonId } : {}),
      createdBy: creatorId,
      groupIds,
    });
    if (!result.ok) return fail(409, `项目「${name}」已存在`);
    return ok(result.project);
  }

  async updateProject(id: string, input: UpdateProjectRequest): Promise<PmOutcome<Project>> {
    let groupIds: string[] | undefined;
    if (input.memberIds !== undefined) {
      const [snapshot, projects] = await Promise.all([
        this.repository.getSnapshot(),
        this.repository.listProjects(),
      ]);
      const prior = projects.find((project) => project.id === id);
      groupIds = [...new Set([
        ...(prior?.groupIds ?? []),
        ...deriveProjectGroupIds(input.memberIds, snapshot.members),
      ])];
    }
    const patch: UpdateProjectDraft = {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
      ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
      ...(input.memberIds !== undefined ? { memberIds: input.memberIds, groupIds } : {}),
      // Group ownership is historical: removing participants never removes their groups.
    };
    const result = await this.repository.updateProject(id, patch);
    if (result.ok) return ok(result.project);
    if (result.reason === 'not-found') return fail(404, 'project not found');
    if (result.reason === 'date-order') return fail(400, 'endsAt must not be earlier than startsAt');
    return fail(409, `项目「${patch.name ?? id}」已存在`);
  }

  // ── 依赖链 / 方向缺口（纯派生） ──

  async getDepGraph() {
    const snapshot = await this.repository.getSnapshot();
    return toDepGraphView(snapshot, this.clock.now().toISOString());
  }

  async getGroupGaps() {
    const snapshot = await this.repository.getSnapshot();
    const now = this.clock.now().toISOString();
    return { gaps: deriveDirectionGaps(snapshot, now), generatedAt: now };
  }

  // ── 任务 ──

  /**
   * 建任务（CONVERGENCE-TASK-ENTRY）：总联调任务合法归属 = 哨兵组 + convergenceScope 同现；
   * 汇报视角组（含子组）不可直接挂任务。
   */
  async createTask(parsed: CreateTaskRequest): Promise<PmOutcome<Task>> {
    const snapshot = await this.repository.getSnapshot();
    const knownGroup = snapshot.groups.find((g) => g.id === parsed.groupId);
    const wantsConvergence = parsed.convergenceScope === CONVERGENCE_SCOPE_ALL_LEAF_GROUPS;
    const onSentinel = parsed.groupId === CONVERGENCE_SENTINEL_GROUP_ID;
    if (wantsConvergence !== onSentinel) {
      return fail(400, '总联调任务请挂「全组联调」组并勾选总联调；普通任务请挂到具体小组');
    }
    const isConvergenceTask = wantsConvergence && onSentinel;
    if (
      knownGroup &&
      !deriveLeafGroups(snapshot.groups).includes(knownGroup.id) &&
      !isConvergenceTask
    ) {
      return fail(400, `组「${knownGroup.name}」是汇报视角（含子组），任务请挂到其下的具体小组`);
    }
    return ok(await this.repository.createTask(parsed));
  }

  /** 任务列表（q 大小写不敏感标题/摘要匹配）+ isBig / 历任完成人投影（读模型增肥，不入库）。 */
  currentWeek(): string { return getWeekKey(this.clock.now()); }

  async listTasks(q?: string): Promise<TaskWithMeta[]> {
    const snapshot = await this.repository.getSnapshot();
    const needle = q?.toLowerCase();
    const matched = needle
      ? snapshot.tasks.filter(
          (t) => t.title.toLowerCase().includes(needle) || t.rawSummary.toLowerCase().includes(needle),
        )
      : snapshot.tasks;
    return matched.map((task) => ({
      ...task,
      completedAt: resolveCompletedAt(task),
      isBig: isBigTask(task, snapshot.dependencies),
      previousOwnerIds: derivePreviousOwnerIds(task),
      projectName: snapshot.projectId,
    }));
  }

  async selfReportTask(input: SelfReportTaskRequest, weekKey: string, actor: ActorRef): Promise<PmOutcome<Task>> {
    const now = this.clock.now().toISOString();
    if (!isCurrentWeek(weekKey, now)) return fail(400, 'Only the current week is writable');
    const snapshot = await this.repository.getSnapshot();
    if (!snapshot.members.some(m => m.id === actor.id)) return fail(403, 'Member required');
    if (snapshot.projectId !== input.projectId || !deriveLeafGroups(snapshot.groups).includes(input.groupId)) return fail(400, 'Valid project and leaf group required');
    if (input.reviewerIds?.some(id => id === actor.id || !snapshot.members.some(m => m.id === id))) return fail(400, '请选择其他名册成员作为备位');
    return ok(await this.repository.createTask({
      ...input, ownerId: actor.id, collaboratorIds: [], status: 'inProgress', claimedAt: now,
      createdBy: actor, reviewerIds: [...new Set(input.reviewerIds ?? [])], revision: 0,
      activity: [{ kind: 'created', at: now, by: actor, title: input.title, rawSummary: input.rawSummary, reviewerIds: [...new Set(input.reviewerIds ?? [])] }],
      weekLinks: [{ weekKey, linkedAt: now, linkedBy: actor }],
      ownershipEvents: [{ kind: 'claimed', fromOwnerId: null, toOwnerId: actor.id, at: now, by: actor }],
      transitions: [{ from: null, to: 'inProgress', at: now, by: actor }],
    }));
  }

  async editSelfTask(taskId: string, input: UpdateSelfTaskRequest, actor: ActorRef): Promise<PmOutcome<Task>> {
    const snapshot = await this.repository.getSnapshot();
    const task = snapshot.tasks.find(t => t.id === taskId);
    if (!task) return fail(404, '任务不存在');
    if (!task.weekLinks?.length || taskAuthorId(task) !== actor.id || !snapshot.members.some(m => m.id === actor.id)) return fail(403, '只有任务作者可以修改任务和选择备位人');
    if (input.reviewerIds?.some(id => id === actor.id || id === task.ownerId || id === task.completedBy?.id || !snapshot.members.some(m => m.id === id))) return fail(400, '请选择作者和完成人之外的名册成员');
    const updated = await this.repository.editSelfTask(taskId, input, actor, this.clock.now().toISOString());
    return updated ? ok(updated) : fail(409, '任务已更新，请刷新后再提交');
  }

  async linkTaskWeek(taskId: string, weekKey: string, actor: ActorRef): Promise<PmOutcome<Task>> {
    const now = this.clock.now().toISOString();
    if (!isCurrentWeek(weekKey, now)) return fail(400, 'Only the current week is writable');
    const snapshot = await this.repository.getSnapshot();
    const task = snapshot.tasks.find(t => t.id === taskId);
    if (!task) return fail(404, 'task not found');
    if (task.ownerId !== actor.id || !snapshot.members.some(m => m.id === actor.id)) return fail(403, 'Only the owner may continue a task');
    const updated = await this.repository.linkTaskWeek(taskId, weekKey, now, actor);
    return updated ? ok(updated) : fail(409, 'Only active tasks can continue');
  }

  async transitionTaskStatus(
    taskId: string,
    status: TaskStatus,
    by: ActorRef | undefined,
    authenticated = false,
    expectedRevision?: number,
  ): Promise<PmOutcome<Task>> {
    const current = (await this.repository.getSnapshot()).tasks.find(t => t.id === taskId);
    if (!current) return fail(404, 'task not found');
    if (expectedRevision !== undefined && (current.revision ?? 0) !== expectedRevision) return fail(409, '任务已更新，请刷新后重试');
    if (current.weekLinks?.length) {
      if (!authenticated || !by || current.ownerId !== by.id) return fail(403, 'Only the signed-in owner may progress a weekly task');
      if (current.status === 'done' || current.status === 'shelved') return fail(409, 'Use peer review to reopen completed tasks');
      if (status === 'done') return this.completeTask(taskId, by, authenticated);
    }
    const task = await this.repository.updateTaskStatus(taskId, status, by, expectedRevision);
    if (!task) return fail(expectedRevision === undefined ? 404 : 409, expectedRevision === undefined ? 'task not found' : '任务已更新，请刷新后重试');
    return ok(task);
  }

  // ── 依赖 / 前置需求 ──

  async createDependency(parsed: CreateDependencyRequest): Promise<PmOutcome<Dependency>> {
    const snapshot = await this.repository.getSnapshot();
    const { fromTaskId, toTaskId } = parsed;
    if (
      wouldCreateCycle(
        snapshot.dependencies.filter((d) => d.status !== 'waived'),
        fromTaskId,
        toTaskId,
      )
    ) {
      return fail(
        400,
        fromTaskId === toTaskId ? 'self dependency not allowed' : 'dependency would create a cycle',
      );
    }
    return ok(await this.repository.createDependency(parsed));
  }

  async waiveDependency(depId: string): Promise<PmOutcome<Dependency>> {
    const dependency = await this.repository.waiveDependency(depId);
    if (!dependency) return fail(404, 'dependency not found');
    return ok(dependency);
  }

  async createNeed(parsed: CreateNeedRequest): Promise<Need> {
    return this.repository.createNeed(parsed);
  }

  // ── 挂单认领制（TASK-POST-CLAIM，D-088） ──

  /** 认领：任务存在 + 认领人在名册 + 未被认领。返回 task + claimer（route 发飞书通知用）。 */
  async claimTask(
    taskId: string,
    memberId: string,
    weekKey?: string,
  ): Promise<PmOutcome<{ task: Task; claimer: Member }>> {
    if (weekKey && !isCurrentWeek(weekKey, this.clock.now())) return fail(400, 'Only the current week is writable');
    const snapshot = await this.repository.getSnapshot();
    const task = snapshot.tasks.find((t) => t.id === taskId);
    if (!task) return fail(404, 'task not found');
    const claimer = snapshot.members.find((m) => m.id === memberId);
    if (!claimer) return fail(400, '认领人不在名册');
    if (task.status === 'done' || task.status === 'shelved') return fail(409, 'Task is not active');
    if (task.ownerId !== null) return fail(409, '任务已有负责人（挂单已被认领）');
    const claimed = await this.repository.claimTask(taskId, memberId, this.clock.now().toISOString(), {
      id: memberId,
      displayName: claimer.displayName,
      source: 'console',
    }, weekKey);
    if (!claimed) return fail(404, 'task not found');
    return ok({ task: claimed, claimer });
  }

  /** 指派：权属该组组长（isGroupLeadOf 由 route 经 authz 判定后传入组长事实）。 */
  async assignTask(
    taskId: string,
    ownerId: string,
    reason: string,
    actor: ActorRef,
  ): Promise<PmOutcome<Task>> {
    const snapshot = await this.repository.getSnapshot();
    const task = snapshot.tasks.find((t) => t.id === taskId);
    if (!task) return fail(404, 'task not found');
    if (!snapshot.members.some((m) => m.id === ownerId)) return fail(400, '指派对象不在名册');
    const assigned = await this.repository.assignTask(
      taskId,
      ownerId,
      reason,
      actor,
      this.clock.now().toISOString(),
    );
    if (!assigned) return fail(404, 'task not found');
    return ok(assigned);
  }

  /** D-095：退池只接受进行中且有当前完成人的任务；操作权限由 route 按本人/本组组长判定。 */
  async releaseTask(
    taskId: string,
    actor: ActorRef,
    reason?: string,
  ): Promise<PmOutcome<Task>> {
    const snapshot = await this.repository.getSnapshot();
    const task = snapshot.tasks.find((t) => t.id === taskId);
    if (!task) return fail(404, 'task not found');
    if (task.status !== 'inProgress') return fail(409, '仅进行中的任务可退回任务池');
    if (task.ownerId === null) return fail(409, '无主任务无需退回任务池');
    const released = await this.repository.releaseTask(
      taskId,
      actor,
      this.clock.now().toISOString(),
      reason,
    );
    if (!released) return fail(409, '任务状态已变化，请刷新后重试');
    return ok(released);
  }

  /** 设搭档：搭档在名册 + 同组（跨组是学习通道，不是甩锅通道）。 */
  async setTaskPartner(taskId: string, partnerMemberId: string): Promise<PmOutcome<Task>> {
    const snapshot = await this.repository.getSnapshot();
    const task = snapshot.tasks.find((t) => t.id === taskId);
    if (!task) return fail(404, 'task not found');
    const partner = snapshot.members.find((m) => m.id === partnerMemberId);
    if (!partner) return fail(400, '搭档不在名册');
    if (partner.groupId !== task.groupId) {
      return fail(400, '搭档须为本组成员（跨组是学习通道，不是甩锅通道）');
    }
    const updated = await this.repository.setTaskPartner(
      taskId,
      partnerMemberId,
      this.clock.now().toISOString(),
    );
    if (!updated) return fail(404, 'task not found');
    return ok(updated);
  }

  async confirmCrossClaim(taskId: string, actor: ActorRef): Promise<PmOutcome<Task>> {
    const updated = await this.repository.confirmCrossClaim(
      taskId,
      actor,
      this.clock.now().toISOString(),
    );
    if (!updated) return fail(404, 'task not found');
    return ok(updated);
  }

  async completeTask(taskId: string, actor: ActorRef, authenticated = false): Promise<PmOutcome<Task>> {
    const target = (await this.repository.getSnapshot()).tasks.find(t => t.id === taskId);
    if (target?.weekLinks?.length) {
      if (!authenticated || target.ownerId !== actor.id) return fail(403, 'Only the signed-in owner may complete a weekly task');
      if (target.status === 'done' || target.status === 'shelved') return fail(409, 'Task is not active');
    }
    const updated = await this.repository.completeTask(taskId, actor, this.clock.now().toISOString());
    if (!updated) return fail(404, 'task not found');
    return ok(updated);
  }

  /** 验收/打回按周会、结构大任务、指定备位、本人自证四条路径授权。 */
  async reviewTask(
    taskId: string,
    actor: ActorRef,
    outcome: 'accept' | 'reject',
    note: string | undefined,
    authenticated = false,
    expectedRevision?: number,
    delivery?: Delivery,
  ): Promise<PmOutcome<Task>> {
    const snapshot = await this.repository.getSnapshot();
    const target = snapshot.tasks.find((t) => t.id === taskId);
    if (!target) return fail(404, 'task not found');
    if (outcome === 'reject' && !note?.trim()) return fail(400, '请填写退回原因');
    if (expectedRevision !== undefined && expectedRevision !== (target.revision ?? 0)) return fail(409, '任务已更新，请刷新后再验收');
    if (target.status !== 'done') {
      return fail(409, '任务尚未标完成，无法验收/打回（先 complete）');
    }
    if (target.weekLinks?.length) {
      if (!authenticated || !snapshot.members.some(m => m.id === actor.id) || !canReviewWeekTask(target, actor.id)) return fail(403, 'Another signed-in member must review this task');
    } else if (isBigTask(target, snapshot.dependencies)) {
      if (!isGateReviewer(snapshot.members, actor.id)) return fail(403, '验收权属验收人名单（大三）');
    } else if (target.reviewerIds?.length) {
      if (!target.reviewerIds.includes(actor.id) || taskAuthorId(target) === actor.id || target.completedBy?.id === actor.id) return fail(403, '只有作者和完成人之外的指定备位人可验收');
    } else {
      if (target.completedBy?.id !== actor.id) return fail(403, '只有完成人本人可自证验收');
      if (outcome === 'accept' && !delivery) return fail(400, '自证验收需填写交付说明', 'DELIVERY_REQUIRED');
    }
    const updated = await this.repository.reviewTask(
      taskId,
      actor,
      outcome,
      note,
      this.clock.now().toISOString(),
      target.revision ?? 0,
      delivery,
    );
    if (!updated) return fail(409, '任务已更新，请刷新后再验收');
    return ok(updated);
  }

  // ── 成员 ──

  async listMembers(): Promise<Member[]> {
    return (await this.repository.getSnapshot()).members;
  }

  async findMember(id: string): Promise<Member | undefined> {
    return (await this.repository.getSnapshot()).members.find((m) => m.id === id);
  }
}
