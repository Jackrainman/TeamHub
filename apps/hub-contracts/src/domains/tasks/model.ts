import { z } from 'zod';
import { ActorRefSchema, isoDateTimeSchema } from '../../common.js';
import { isValidWeekKey } from './week.js';

export const GroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  kind: z.string().min(1),
});
export type Group = z.infer<typeof GroupSchema>;
export type GroupResponse = { group: Group };
export function deriveLeafGroups(groups: readonly Group[]): string[] {
  return groups.map((group) => group.id);
}

export const MemberRoleSchema = z.enum(['groupAdmin', 'member']);
export const MemberGradeSchema = z.enum([
  'freshman', 'sophomore', 'junior', 'senior', 'graduate', 'grad1', 'grad2', 'grad3',
]);
export const MemberSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().trim().min(1),
  role: MemberRoleSchema,
  grade: MemberGradeSchema,
  groupId: z.string().min(1),
  updatedAt: isoDateTimeSchema,
  pinHash: z.string().min(1).optional(),
  gateReviewer: z.boolean().optional(),
  projectManager: z.boolean().optional(),
});
export const MemberPublicSchema = MemberSchema.omit({ pinHash: true });
export type Member = z.infer<typeof MemberSchema>;
export type MemberPublic = z.infer<typeof MemberPublicSchema>;
export type MemberRole = z.infer<typeof MemberRoleSchema>;
export type MemberGrade = z.infer<typeof MemberGradeSchema>;

export const TaskStatusSchema = z.enum(['pending', 'inProgress', 'blocked', 'done', 'shelved']);
export const TaskComplexitySchema = z.enum(['trivial', 'normal', 'hard']);
export const RobotTargetSchema = z.enum(['R1', 'R2', 'shared']);
export const DeliverySchema = z.object({
  summary: z.string().trim().min(1).max(500),
  deliverable: z.string().trim().min(1).max(500),
  paths: z.array(z.string().trim().min(1)).min(1).max(20),
});
export const DateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, 'Invalid calendar date');

const WeekLinkSchema = z.object({
  weekKey: z.string().refine(isValidWeekKey, 'Invalid ISO week'),
  linkedAt: isoDateTimeSchema,
  linkedBy: ActorRefSchema,
});
const TransitionSchema = z.object({
  from: TaskStatusSchema.nullable(),
  to: TaskStatusSchema,
  at: isoDateTimeSchema,
  by: ActorRefSchema.optional(),
});
const ActivitySchema = z.object({
  kind: z.enum(['created', 'edited', 'reviewersChanged', 'accepted', 'rejected', 'rescheduled']),
  at: isoDateTimeSchema,
  by: ActorRefSchema,
  title: z.string().optional(),
  rawSummary: z.string().optional(),
  reviewerIds: z.array(z.string()).optional(),
  note: z.string().optional(),
});

export const TaskObjectSchema = z.object({
  id: z.string().min(1),
  groupId: z.string().min(1),
  title: z.string().trim().min(1),
  rawSummary: z.string().trim().min(1),
  status: TaskStatusSchema,
  ownerId: z.string().min(1).nullable(),
  collaboratorIds: z.array(z.string().min(1)),
  robotTarget: RobotTargetSchema.optional(),
  targetLabel: z.string().trim().min(1).optional(),
  intrinsicComplexity: TaskComplexitySchema,
  plannedStart: DateKeySchema.nullable().optional(),
  plannedEnd: DateKeySchema.nullable().optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  createdBy: ActorRefSchema.optional(),
  reviewerIds: z.array(z.string().min(1)).optional(),
  revision: z.number().int().nonnegative().optional(),
  activity: z.array(ActivitySchema).optional(),
  claimedAt: isoDateTimeSchema.optional(),
  completedBy: ActorRefSchema.optional(),
  completedAt: isoDateTimeSchema.optional(),
  reviewedBy: ActorRefSchema.optional(),
  reviewedAt: isoDateTimeSchema.optional(),
  delivery: DeliverySchema.optional(),
  reviewNote: z.string().min(1).optional(),
  weekLinks: z.array(WeekLinkSchema).optional(),
  transitions: z.array(TransitionSchema).optional(),
});
function validatePlannedRange(task: { plannedStart?: string | null; plannedEnd?: string | null }, ctx: z.RefinementCtx): void {
  if (task.plannedStart && task.plannedEnd && task.plannedEnd < task.plannedStart) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['plannedEnd'], message: 'plannedEnd must not be earlier than plannedStart' });
  }
}
export const TaskSchema = TaskObjectSchema.superRefine(validatePlannedRange);

export const TaskWithMetaSchema = TaskSchema;
export const TasksResponseSchema = z.object({
  currentWeek: z.string().refine(isValidWeekKey).optional(),
  today: DateKeySchema.optional(),
  tasks: z.array(TaskWithMetaSchema),
});
export const TasksQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  scope: z.enum(['mine', 'team']).optional(),
});
export const GroupsResponseSchema = z.object({
  groups: z.array(GroupSchema),
  assignableGroupIds: z.array(z.string()),
});
export const GroupResponseSchema = z.object({ group: GroupSchema });
export const MembersResponseSchema = z.object({ members: z.array(MemberPublicSchema) });

export type Task = z.infer<typeof TaskSchema>;
export type TaskWithMeta = z.infer<typeof TaskWithMetaSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskComplexity = z.infer<typeof TaskComplexitySchema>;
export type RobotTarget = z.infer<typeof RobotTargetSchema>;
export type Delivery = z.infer<typeof DeliverySchema>;
export type TasksQuery = z.infer<typeof TasksQuerySchema>;

export type TaskAcceptanceState = 'notDone' | 'awaitingReview' | 'accepted';
export const ACCEPTANCE_CUTOFF = '2026-11-16T00:00:00.000Z';
export function deriveTaskAcceptance(task: Pick<Task, 'status' | 'reviewedBy' | 'completedAt'>): TaskAcceptanceState {
  if (task.status !== 'done') return 'notDone';
  if (task.reviewedBy) return 'accepted';
  if (task.completedAt && task.completedAt < ACCEPTANCE_CUTOFF) return 'accepted';
  return 'awaitingReview';
}

export function resolveCompletedAt(task: Pick<Task, 'status' | 'completedAt' | 'updatedAt' | 'transitions'>): string | undefined {
  if (task.completedAt) return task.completedAt;
  const lastDone = [...(task.transitions ?? [])].reverse().find((item) => item.to === 'done');
  if (lastDone) return lastDone.at;
  return task.status === 'done' ? task.updatedAt : undefined;
}


export function lookupMemberByDisplayName(members: readonly Member[], displayName: string):
  { kind: 'none' } | { kind: 'ok'; member: Member } | { kind: 'duplicate'; count: number } {
  const hits = members.filter((member) => member.displayName === displayName);
  if (hits.length === 0) return { kind: 'none' };
  if (hits.length > 1) return { kind: 'duplicate', count: hits.length };
  return { kind: 'ok', member: hits[0] };
}
