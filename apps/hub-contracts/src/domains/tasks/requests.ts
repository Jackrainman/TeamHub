import { z } from 'zod';
import { ActorRefSchema } from '../../common.js';
import { DateKeySchema, DeliverySchema, MemberPublicSchema, MemberRoleSchema, TaskObjectSchema, TaskSchema, TaskStatusSchema } from './model.js';
import { isValidWeekKey } from './week.js';

const taskResponse = z.object({ task: TaskSchema });
const actor = ActorRefSchema.optional();
const revision = z.number().int().nonnegative().optional();
const CreateTaskObjectSchema = TaskObjectSchema.pick({
  groupId: true, title: true, rawSummary: true,
  ownerId: true, collaboratorIds: true, robotTarget: true, targetLabel: true,
  intrinsicComplexity: true, plannedStart: true, plannedEnd: true,
}).extend({ status: z.enum(['pending', 'inProgress']).optional() });
function validateDateOrder(value: { plannedStart?: string | null; plannedEnd?: string | null }, ctx: z.RefinementCtx): void {
  if (value.plannedStart && value.plannedEnd && value.plannedEnd < value.plannedStart) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['plannedEnd'], message: 'plannedEnd must be on or after plannedStart' });
  }
}
export const CreateTaskRequestSchema = CreateTaskObjectSchema.superRefine(validateDateOrder);
export const CreateTaskResponseSchema = taskResponse;
export const SelfReportTaskRequestSchema = CreateTaskObjectSchema.omit({ ownerId: true, collaboratorIds: true, status: true }).extend({
  reviewerIds: z.array(z.string().min(1)).max(100).optional(),
}).superRefine(validateDateOrder);
export const UpdateSelfTaskRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  title: z.string().trim().min(1).optional(),
  rawSummary: z.string().trim().min(1).optional(),
  reviewerIds: z.array(z.string().min(1)).max(100).optional(),
  plannedStart: DateKeySchema.nullable().optional(),
  plannedEnd: DateKeySchema.nullable().optional(),
}).refine((value) => Object.keys(value).some((key) => key !== 'expectedRevision'), 'No changes supplied').superRefine(validateDateOrder);
export const TransitionTaskStatusRequestSchema = z.object({ status: TaskStatusSchema, by: actor, expectedRevision: revision });
export const TransitionTaskStatusResponseSchema = taskResponse;
export const WeekKeySchema = z.string().refine(isValidWeekKey, 'Invalid ISO week');
export const LinkTaskWeekRequestSchema = z.object({ weekKey: WeekKeySchema });
export const ClaimTaskRequestSchema = z.object({ weekKey: WeekKeySchema.optional(), memberId: z.string().min(1).optional() });
export const ClaimTaskResponseSchema = taskResponse;
export const CompleteTaskRequestSchema = z.object({ completedBy: actor });
export const CompleteTaskResponseSchema = taskResponse;
export const ReviewTaskRequestSchema = z.object({
  expectedRevision: revision, outcome: z.enum(['accept', 'reject']), reviewedBy: actor,
  note: z.string().trim().min(1).optional(), delivery: DeliverySchema.optional(),
});
export const ReviewTaskResponseSchema = taskResponse;
export const CreateGroupRequestSchema = z.object({ name: z.string().trim().min(1) });
export const RenameGroupRequestSchema = CreateGroupRequestSchema;
export const SetGateReviewerRequestSchema = z.object({ gateReviewer: z.boolean() });
export const SetGateReviewerResponseSchema = z.object({ member: MemberPublicSchema });
export const SetMemberRoleRequestSchema = z.object({ role: MemberRoleSchema });
export const SetMemberRoleResponseSchema = SetGateReviewerResponseSchema;
export const SetProjectManagerRequestSchema = z.object({ projectManager: z.boolean() });
export const SetProjectManagerResponseSchema = SetGateReviewerResponseSchema;

export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;
export type CreateTaskResponse = z.infer<typeof CreateTaskResponseSchema>;
export type SelfReportTaskRequest = z.infer<typeof SelfReportTaskRequestSchema>;
export type UpdateSelfTaskRequest = z.infer<typeof UpdateSelfTaskRequestSchema>;
export type TransitionTaskStatusResponse = z.infer<typeof TransitionTaskStatusResponseSchema>;
export type ClaimTaskRequest = z.infer<typeof ClaimTaskRequestSchema>;
export type ClaimTaskResponse = z.infer<typeof ClaimTaskResponseSchema>;
export type CompleteTaskRequest = z.infer<typeof CompleteTaskRequestSchema>;
export type CompleteTaskResponse = z.infer<typeof CompleteTaskResponseSchema>;
export type ReviewTaskRequest = z.infer<typeof ReviewTaskRequestSchema>;
export type ReviewTaskResponse = z.infer<typeof ReviewTaskResponseSchema>;
export type CreateGroupRequest = z.infer<typeof CreateGroupRequestSchema>;
export type RenameGroupRequest = z.infer<typeof RenameGroupRequestSchema>;
export type SetGateReviewerRequest = z.infer<typeof SetGateReviewerRequestSchema>;
export type SetGateReviewerResponse = z.infer<typeof SetGateReviewerResponseSchema>;
export type SetMemberRoleRequest = z.infer<typeof SetMemberRoleRequestSchema>;
export type SetMemberRoleResponse = z.infer<typeof SetMemberRoleResponseSchema>;
export type SetProjectManagerRequest = z.infer<typeof SetProjectManagerRequestSchema>;
export type SetProjectManagerResponse = z.infer<typeof SetProjectManagerResponseSchema>;
