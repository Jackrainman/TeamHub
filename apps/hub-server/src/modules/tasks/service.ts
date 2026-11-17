import {
  canReviewWeekTask, getWeekKey, isCurrentWeek, resolveCompletedAt,
  shanghaiDateKey, taskAuthorId, TaskSchema,
} from '@teamhub/hub-contracts';
import type {
  ActorRef, CreateTaskRequest, Delivery, Group, Member, ReviewTaskRequest,
  SelfReportTaskRequest, Task, TaskStatus, UpdateSelfTaskRequest,
} from '@teamhub/hub-contracts';
import type { Clock } from '../../clock.js';
import type { TasksRepository } from './repository.js';

export interface TaskDirectoryPort {
  listMembers(): Member[];
  listGroups(): Group[];
}
export type TaskOutcome<T> = { ok: true; value: T } | {
  ok: false; status: 400 | 403 | 404 | 409; code: 'VALIDATION_FAILED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'DELIVERY_REQUIRED'; detail: string;
};
const ok = <T>(value: T): TaskOutcome<T> => ({ ok: true, value });
const failure = <T>(status: 400 | 403 | 404 | 409, detail: string, code: 'VALIDATION_FAILED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'DELIVERY_REQUIRED' = status === 400 ? 'VALIDATION_FAILED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'CONFLICT'): TaskOutcome<T> => ({ ok: false, status, code, detail });

export class TasksService {
  constructor(private readonly repository: TasksRepository, private readonly directory: TaskDirectoryPort, private readonly clock: Clock) {}
  private now(): string { return this.clock.now().toISOString(); }
  currentWeek(): string { return getWeekKey(this.clock.now()); }
  today(): string { return shanghaiDateKey(this.clock.now()); }
  private nextId(): string {
    const ids = this.repository.listTasks().map((task) => /^task-v1-(\d+)$/.exec(task.id)?.[1]).filter(Boolean).map(Number);
    return `task-v1-${Math.max(0, ...ids) + 1}`;
  }
  private isAdmin(actor: ActorRef): boolean {
    return this.directory.listMembers().some((member) => member.id === actor.id && member.projectManager === true);
  }
  private validGroup(id: string): boolean { return this.directory.listGroups().some((group) => group.id === id); }
  private validReviewers(ids: readonly string[] | undefined, actorId: string, task?: Task): boolean {
    const members = this.directory.listMembers();
    return !ids?.some((id) => id === actorId || id === task?.ownerId || id === task?.completedBy?.id || !members.some((member) => member.id === id));
  }
  listTasks(query?: { q?: string; scope?: 'mine' | 'team' }, actor?: ActorRef): Task[] {
    const needle = query?.q?.toLowerCase();
    return this.repository.listTasks().filter((task) => {
      if (query?.scope === 'mine' && (!actor || (task.ownerId !== actor.id && !task.collaboratorIds.includes(actor.id)))) return false;
      return !needle || task.title.toLowerCase().includes(needle) || task.rawSummary.toLowerCase().includes(needle);
    }).map((task) => ({ ...task, completedAt: resolveCompletedAt(task) }));
  }
  createTask(input: CreateTaskRequest, actor: ActorRef): TaskOutcome<Task> {
    if (!this.validGroup(input.groupId)) return failure(400, 'Valid group required');
    if (input.ownerId && !this.directory.listMembers().some((member) => member.id === input.ownerId)) return failure(400, 'Owner is not a member');
    const now = this.now();
    const status = input.status ?? 'pending';
    const task = TaskSchema.parse({
      ...input, id: this.nextId(), status,
      createdAt: now, updatedAt: now, createdBy: actor, revision: 0,
      activity: [{ kind: 'created', at: now, by: actor, title: input.title, rawSummary: input.rawSummary }],
      transitions: [{ from: null, to: status, at: now, by: actor }],
    });
    return ok(this.repository.createTask(task));
  }
  selfReportTask(weekKey: string, input: SelfReportTaskRequest, actor: ActorRef): TaskOutcome<Task> {
    if (!isCurrentWeek(weekKey, this.clock.now())) return failure(400, 'Only the current week is writable');
    if (!this.validGroup(input.groupId)) return failure(400, 'Valid group required');
    if (!this.validReviewers(input.reviewerIds, actor.id)) return failure(400, '请选择其他名册成员作为验收人');
    const now = this.now();
    const task = TaskSchema.parse({
      ...input, id: this.nextId(), ownerId: actor.id, collaboratorIds: [], status: 'inProgress',
      createdAt: now, updatedAt: now,
      createdBy: actor, claimedAt: now, reviewerIds: [...new Set(input.reviewerIds ?? [])],
      weekLinks: [{ weekKey, linkedAt: now, linkedBy: actor }], revision: 0,
      activity: [{ kind: 'created', at: now, by: actor, title: input.title, rawSummary: input.rawSummary,
        reviewerIds: [...new Set(input.reviewerIds ?? [])] }],
      transitions: [{ from: null, to: 'inProgress', at: now, by: actor }],
    });
    return ok(this.repository.createTask(task));
  }
  editSelfTask(taskId: string, input: UpdateSelfTaskRequest, actor: ActorRef): TaskOutcome<Task> {
    const task = this.repository.getTask(taskId);
    if (!task) return failure(404, 'task not found');
    if (task.revision !== input.expectedRevision && (task.revision ?? 0) !== input.expectedRevision) return failure(409, '任务已更新，请刷新后再提交');
    if (taskAuthorId(task) !== actor.id && task.ownerId !== actor.id && !this.isAdmin(actor)) return failure(403, '只有作者、负责人或管理员可以修改任务');
    if (!this.validReviewers(input.reviewerIds, taskAuthorId(task) ?? actor.id, task)) return failure(400, '请选择作者和完成人之外的名册成员');
    const plannedStart = input.plannedStart === undefined ? task.plannedStart : input.plannedStart;
    const plannedEnd = input.plannedEnd === undefined ? task.plannedEnd : input.plannedEnd;
    if (plannedStart && plannedEnd && plannedEnd < plannedStart) return failure(400, 'plannedEnd must not be earlier than plannedStart');
    const at = this.now();
    const updated = this.repository.updateTask(taskId, (current) => ({
      ...current, ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.rawSummary !== undefined ? { rawSummary: input.rawSummary } : {}),
      ...(input.reviewerIds !== undefined ? { reviewerIds: [...new Set(input.reviewerIds)] } : {}),
      plannedStart, plannedEnd, revision: (current.revision ?? 0) + 1, updatedAt: at,
      activity: [...(current.activity ?? []), { kind: 'edited' as const, at, by: actor,
        title: input.title ?? current.title, rawSummary: input.rawSummary ?? current.rawSummary,
        reviewerIds: input.reviewerIds ?? current.reviewerIds }],
    }));
    return updated ? ok(updated) : failure(404, 'task not found');
  }
  linkTaskWeek(taskId: string, weekKey: string, actor: ActorRef): TaskOutcome<Task> {
    if (!isCurrentWeek(weekKey, this.clock.now())) return failure(400, 'Only the current week is writable');
    const task = this.repository.getTask(taskId);
    if (!task) return failure(404, 'task not found');
    if (task.ownerId !== actor.id) return failure(403, 'Only the owner may continue a task');
    if (task.status === 'done' || task.status === 'shelved') return failure(409, 'Only active tasks can continue');
    if (task.weekLinks?.some((link) => link.weekKey === weekKey)) return ok(task);
    const at = this.now();
    return ok(this.repository.updateTask(taskId, (current) => ({
      ...current, weekLinks: [...(current.weekLinks ?? []), { weekKey, linkedAt: at, linkedBy: actor }], updatedAt: at,
    }))!);
  }
  claimTask(taskId: string, actor: ActorRef, weekKey?: string): TaskOutcome<Task> {
    if (weekKey && !isCurrentWeek(weekKey, this.clock.now())) return failure(400, 'Only the current week is writable');
    const task = this.repository.getTask(taskId);
    if (!task) return failure(404, 'task not found');
    if (task.ownerId !== null || task.status === 'done' || task.status === 'shelved') return failure(409, '任务已有负责人或已结束');
    const at = this.now();
    return ok(this.repository.updateTask(taskId, (current) => ({
      ...current, ownerId: actor.id, claimedAt: at, status: current.status === 'pending' ? 'inProgress' : current.status,
      updatedAt: at, revision: (current.revision ?? 0) + 1,
      ...(weekKey && !current.weekLinks?.some((link) => link.weekKey === weekKey)
        ? { weekLinks: [...(current.weekLinks ?? []), { weekKey, linkedAt: at, linkedBy: actor }] } : {}),
      transitions: [...(current.transitions ?? []), { from: current.status, to: current.status === 'pending' ? 'inProgress' : current.status, at, by: actor }],
    }))!);
  }
  completeTask(taskId: string, actor: ActorRef): TaskOutcome<Task> {
    const task = this.repository.getTask(taskId);
    if (!task) return failure(404, 'task not found');
    if (task.status === 'done' || task.status === 'shelved') return failure(409, 'Task is not active');
    if (!task.ownerId || (task.ownerId !== actor.id && !this.isAdmin(actor))) return failure(403, 'Only the owner may complete a task');
    const at = this.now();
    return ok(this.repository.updateTask(taskId, (current) => {
      const { reviewedBy: _reviewedBy, reviewedAt: _reviewedAt, reviewNote: _note, delivery: _delivery, ...rest } = current;
      return { ...rest, status: 'done', completedBy: actor, completedAt: at,
        revision: (current.revision ?? 0) + 1, updatedAt: at,
        transitions: [...(current.transitions ?? []), { from: current.status, to: 'done' as const, at, by: actor }] };
    })!);
  }
  transitionTaskStatus(taskId: string, status: TaskStatus, actor: ActorRef, expectedRevision?: number): TaskOutcome<Task> {
    const task = this.repository.getTask(taskId);
    if (!task) return failure(404, 'task not found');
    if (expectedRevision !== undefined && expectedRevision !== (task.revision ?? 0)) return failure(409, '任务已更新，请刷新后重试');
    if (status === 'done') return this.completeTask(taskId, actor);
    if (task.status === 'done' || task.status === 'shelved') return failure(409, 'Completed tasks are terminal');
    if (!task.ownerId || (task.ownerId !== actor.id && !this.isAdmin(actor))) return failure(403, 'Only the owner may progress a task');
    const at = this.now();
    return ok(this.repository.updateTask(taskId, (current) => ({
      ...current, status, revision: (current.revision ?? 0) + 1, updatedAt: at,
      transitions: [...(current.transitions ?? []), { from: current.status, to: status, at, by: actor }],
    }))!);
  }
  reviewTask(taskId: string, actor: ActorRef, input: ReviewTaskRequest): TaskOutcome<Task> {
    const task = this.repository.getTask(taskId);
    if (!task) return failure(404, 'task not found');
    if (input.expectedRevision !== undefined && input.expectedRevision !== (task.revision ?? 0)) return failure(409, '任务已更新，请刷新后再验收');
    if (task.status !== 'done') return failure(409, '任务尚未标完成，无法验收/打回');
    if (input.outcome === 'reject' && !input.note?.trim()) return failure(400, '请填写退回原因');
    const anotherMemberCanReview = task.weekLinks?.length
      ? canReviewWeekTask(task, actor.id)
      : Boolean(task.reviewerIds?.includes(actor.id) && taskAuthorId(task) !== actor.id
        && task.ownerId !== actor.id && task.completedBy?.id !== actor.id);
    const selfAccept = !task.weekLinks?.length && !task.reviewerIds?.length && task.completedBy?.id === actor.id;
    if (!anotherMemberCanReview && !selfAccept && !this.isAdmin(actor)) return failure(403, '当前成员不在本任务的验收人范围');
    if (selfAccept && input.outcome === 'accept' && !input.delivery) return failure(400, '自证验收需填写交付说明', 'DELIVERY_REQUIRED');
    const at = this.now();
    const delivery: Delivery | undefined = input.delivery ?? task.delivery;
    return ok(this.repository.updateTask(taskId, (current) => {
      const { reviewedBy: _reviewedBy, reviewedAt: _reviewedAt, reviewNote: _note, ...rest } = current;
      const rejecting = input.outcome === 'reject';
      return {
        ...rest, status: rejecting ? 'inProgress' : 'done',
        ...(rejecting ? {} : { reviewedBy: actor, reviewedAt: at, delivery }),
        ...(input.note !== undefined ? { reviewNote: input.note } : {}),
        revision: (current.revision ?? 0) + 1, updatedAt: at,
        activity: [...(current.activity ?? []), { kind: rejecting ? 'rejected' as const : 'accepted' as const,
          at, by: actor, ...(input.note ? { note: input.note } : {}) }],
        ...(rejecting ? { transitions: [...(current.transitions ?? []), { from: current.status, to: 'inProgress' as const, at, by: actor }] } : {}),
      };
    })!);
  }
}
