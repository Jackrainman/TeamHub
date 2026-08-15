import { z } from 'zod';

import { ActorRefSchema, isoDateTimeSchema } from '../../common.js';

export const BaselineSegmentKindSchema = z.enum(['semester', 'vacation', 'vacuum']);
export const BaselinePhaseTypeSchema = z.enum(['rd', 'iterate', 'tuning', 'vacuum']);
export const MilestoneKindSchema = z.enum(['milestone', 'gate']);
export const MilestoneStatusSchema = z.enum(['pending', 'passed', 'missed']);
export const MilestoneRobotVersionSchema = z.enum(['V1', 'V2', 'V3']);

export const BaselineAnchorsSchema = z.object({
  semesterStart: isoDateTimeSchema.optional(),
  competitionDate: isoDateTimeSchema.optional(),
});
export const BaselineSegmentSchema = z.object({
  kind: BaselineSegmentKindSchema,
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  label: z.string().min(1),
});
export const BaselinePhaseSchema = z.object({
  type: BaselinePhaseTypeSchema,
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
});
export const BaselineMilestoneSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: MilestoneKindSchema,
  plannedAt: isoDateTimeSchema,
  robotVersion: MilestoneRobotVersionSchema.optional(),
  mergedFromVersion: MilestoneRobotVersionSchema.optional(),
  status: MilestoneStatusSchema,
  passedBy: ActorRefSchema.optional(),
  evidenceRefs: z.array(z.string().min(1)).optional(),
  note: z.string().min(1).optional(),
});
export const SeasonBaselineSchema = z.object({
  id: z.string().min(1),
  seasonId: z.string().min(1),
  anchors: BaselineAnchorsSchema,
  segments: z.array(BaselineSegmentSchema),
  phases: z.array(BaselinePhaseSchema),
  milestones: z.array(BaselineMilestoneSchema),
});

export const BaselineMilestonePublicSchema = BaselineMilestoneSchema.omit({ passedBy: true });
export const SeasonBaselinePublicSchema = SeasonBaselineSchema.extend({
  milestones: z.array(BaselineMilestonePublicSchema),
});

export type BaselineSegmentKind = z.infer<typeof BaselineSegmentKindSchema>;
export type BaselinePhaseType = z.infer<typeof BaselinePhaseTypeSchema>;
export type MilestoneKind = z.infer<typeof MilestoneKindSchema>;
export type MilestoneStatus = z.infer<typeof MilestoneStatusSchema>;
export type MilestoneRobotVersion = z.infer<typeof MilestoneRobotVersionSchema>;
export type BaselineAnchors = z.infer<typeof BaselineAnchorsSchema>;
export type BaselineSegment = z.infer<typeof BaselineSegmentSchema>;
export type BaselinePhase = z.infer<typeof BaselinePhaseSchema>;
export type BaselineMilestone = z.infer<typeof BaselineMilestoneSchema>;
export type SeasonBaseline = z.infer<typeof SeasonBaselineSchema>;
export type BaselineMilestonePublic = z.infer<typeof BaselineMilestonePublicSchema>;
export type SeasonBaselinePublic = z.infer<typeof SeasonBaselinePublicSchema>;
